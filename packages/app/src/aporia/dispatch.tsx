// APORIA: bot-to-bot dispatcher. Polls %APORIA_HOME%\inbox (via the desktop bridge), delivers each message into the
// target bot's chat as a labeled turn, waits for the turn to finish, and posts the reply back to the sender's chat.
// Rooms: a post reaches every member; members take turns in order, each seeing the room posts since its last turn.
// Runs in the renderer, so it keeps working while the window is minimized (Electron keeps the renderer alive).
import { onCleanup, onMount } from "solid-js"
import { Session } from "@opencode/schema/session"
import { useData } from "@/runtime/server/current"
import { useServerSDK } from "@/runtime/server/client"
import { AN_FREE_PATH_DEFAULT_MODEL } from "@/shell/an/models-free-path"
import { aporiaAlerts } from "./alerts"
import { agentFor, bots, refreshBots, type Bot } from "./bots"
import { createDispatchScheduler } from "./dispatch-queue"
import { createDedupe, fingerprint } from "./dedupe"
import { isSilentReply } from "./reply"
import { buildMemoryPrompt } from "./context-grounded"
import { scopedEntries } from "./context-scope"
import { needsResearch, researchPrompt, type BotKind } from "./expert-policy"

type Msg = { id: string; from: string; to?: string; room?: string; message: string; priority: boolean; kind: "message" | "reply" | "room" | "routine"; created: string; fromSession?: string; routine?: { id: string; name: string }; manual?: boolean; response?: "required" | "none" }
const routines = (input: unknown) => (globalThis as any).electron?.aporia?.routines?.(input)
type Room = { slug: string; name: string; members: string[]; sessions: Record<string, string> }
const IDLE_DELAY_MS = 2 * 60_000 // non-priority messages wait this long (target idle) before they wake it
// How long to wait for a bot's reply before the turn is reported as timed out.
const TURN_TIMEOUT_MS = 10 * 60_000
// Loop guard: two bots can ping-pong forever (each turn fires another send_to_bot). Cap how many
// messages may pass between the same pair inside a window.
const PAIR_WINDOW_MS = 10 * 60_000
const PAIR_MAX = 6
// Once a pair hits the cap, stop it for real rather than letting it trickle.
const PAIR_COOLDOWN_MS = 60 * 60_000
// A repeat inside this window is the same message arriving twice, not a second message. Matches the loop guard's
// window, since a broadcast that fans out or a pair that echoes itself both land inside it.
const DUPLICATE_WINDOW_MS = 10 * 60_000
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function BotDispatcher() {
  const sdk = useServerSDK()
  const data = useData()
  const api = sdk.api as any
  // Per bot-pair delivery timestamps and cooldowns for the loop guard (in-memory, per running app).
  const pairHits = new Map<string, number[]>()
  const pairCooldown = new Map<string, number>()
  // Repeats are remembered in memory, per running app, like the loop guard's counters.
  const duplicate = createDedupe(DUPLICATE_WINDOW_MS).duplicate

  const paths = bots({ op: "paths" }) as Promise<{ bots: string }>
  async function createSession(bot: Bot, title?: string) {
    const [providerID, ...rest] = (bot.model || AN_FREE_PATH_DEFAULT_MODEL).split("/")
    const directory = `${(await paths).bots}\\${bot.slug}`
    const created = data.session.create({ id: Session.ID.create(), agent: agentFor(bot.slug), model: { id: rest.join("/"), providerID }, location: { directory } } as any)
    await created.request
    // Bot/dispatch sessions are internal: they must not show as human chats (Phase 5).
    await api.session
      .update({ sessionID: created.id, metadata: { aporia: { internal: true } }, ...(title ? { title } : {}) })
      .catch(() => undefined)
    return created.id as string
  }
  async function exists(sessionID?: string) {
    if (!sessionID) return false
    try { await api.session.get({ sessionID }); return true } catch { return false }
  }
  async function botSession(bot: Bot) {
    for (const id of bot.sessions ?? []) if (await exists(id)) return id
    const id = await createSession(bot)
    await bots({ op: "attachSession", slug: bot.slug, sessionID: id }); refreshBots()
    return id
  }
  async function messages(sessionID: string) {
    const r = await api.message.list({ sessionID, limit: 30, order: "desc" })
    return ((r?.data ?? r?.items ?? r) as any[]) ?? []
  }
  const textOf = (m: any) => (m?.content ?? []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n").trim()
  const busy = (sessionID: string) => { try { return data.session.status(sessionID) === "running" } catch { return false } }

  /** Prompt a session and return the final assistant text once the turn settles. */
  async function turn(sessionID: string, text: string, metadata: Record<string, unknown>, scopes?: string[], kind?: BotKind) {
    const before = Date.now()
    // Experts find things out before they answer (a behaviour, not a refusal gate).
    const ask = needsResearch(kind, false) ? `${researchPrompt(text, scopes)}\n\n${text}` : text
    let promptText = ask
    try {
      const context = (globalThis as any).electron?.aporia?.context
      const result = context ? await context({ op: "query", q: {} }) : undefined
      const entries = (result?.entries ?? []) as { id: string; topic: string; text: string }[]
      // Shared memory is background the bot MAY use. No gate: it is never told to refuse, and its
      // answer is never stored back as a "fact" (only remember_finding may write memory, and only
      // with a real source).
      promptText = buildMemoryPrompt(ask, scopedEntries(entries, scopes)).prompt
    } catch {
      // no store yet — prompt as before
    }
    // The bot still receives the full text; `displayText` only changes what the UI shows, so a
    // bot-to-bot turn reads as a small quiet line instead of dumping the message into the chat.
    const display = String((metadata as { display?: unknown }).display ?? "").trim()
    const promptMeta = display
      ? { displayText: display, comments: [], attachments: [], aporia: metadata }
      : { aporia: metadata }
    await api.session.prompt({ sessionID, text: promptText, delivery: "queue", metadata: promptMeta })
    const started = Date.now()
    let stable = 0
    while (Date.now() - started < TURN_TIMEOUT_MS) {
      await sleep(3000)
      const list = await messages(sessionID).catch(() => [])
      const last = list.find((m: any) => m.type === "assistant" && (m.time?.created ?? 0) >= before - 1000)
      const done = last && last.time?.completed && last.finish !== "tool-calls" && !busy(sessionID)
      stable = done ? stable + 1 : 0
      if (stable >= 2) return textOf(last) || "(no text reply)"
    }
    return "(timed out waiting for a reply)"
  }

  async function deliver(m: Msg, list: Bot[]) {
    const name = (slug: string) => list.find((b) => b.slug === slug)?.name ?? slug
    if (m.room) return deliverRoom(m, list, name)
    const target = list.find((b) => b.slug === m.to)
    if (!target) {
      aporiaAlerts.push({ title: `✗ Could not deliver to ${m.to}`, detail: "No such bot.", level: "error" })
      return bots({ op: "inboxAck", id: m.id, result: { error: "no such bot" } })
    }
    const sessionID = await botSession(target)
    if (!m.priority && (busy(sessionID) || Date.now() - Date.parse(m.created) < IDLE_DELAY_MS)) return // wait
    // A repeat is the same words from the same sender to the same target inside the window. Dropped rather than
    // delivered, so it costs no turn. Routines and Ali are exempt: a routine repeats on schedule by design, and Ali's
    // own messages are never suppressed.
    if (m.kind !== "routine" && list.some((b) => b.slug === m.from)) {
      if (duplicate(fingerprint(m.from, m.to ?? "", m.message), m.id)) {
        await bots({ op: "inboxAck", id: m.id, result: { suppressed: "duplicate" } })
        return
      }
      // The sender says whether this needs an answer. `none` is not escalated: no turn, no cost. It is held on disk
      // beside the bot and read on its next real turn, the way room posts are, so it survives a restart and the bot
      // is not blind to what was said. Ali and routines are exempt — a message from Ali always gets a turn, whatever
      // it is labelled.
      if (m.response === "none") {
        await bots({ op: "fyiAppend", slug: target.slug, from: m.from, text: m.message })
        await bots({ op: "inboxAck", id: m.id, result: { suppressed: "fyi", state: "held" } })
        return
      }
    }
    // Loop guard (counted only when we are about to DELIVER, not on every retry tick): two bots can
    // ping-pong forever because each turn fires another send_to_bot. Cap per pair. Ali's own
    // messages are never rate-limited.
    if (m.to && list.some((b) => b.slug === m.from)) {
      const key = [m.from, m.to].sort().join("|")
      const now = Date.now()
      const until = pairCooldown.get(key) ?? 0
      if (now < until) {
        // Still in the cooldown from a previous loop: drop silently (no alert spam).
        await bots({ op: "inboxAck", id: m.id, result: { suppressed: "loop-guard" } })
        return
      }
      if (until) pairCooldown.delete(key)
      const hits = (pairHits.get(key) ?? []).filter((t) => now - t < PAIR_WINDOW_MS)
      if (hits.length >= PAIR_MAX) {
        pairCooldown.set(key, now + PAIR_COOLDOWN_MS)
        pairHits.delete(key)
        await bots({ op: "inboxAck", id: m.id, result: { suppressed: "loop-guard" } })
        aporiaAlerts.push({
          title: "Bot loop stopped",
          detail: `${name(m.from)} ↔ ${name(m.to)} kept messaging in a loop, so I paused them for an hour.`,
          level: "warning",
        })
        return
      }
      hits.push(now)
      pairHits.set(key, hits)
    }
    await bots({ op: "inboxAck", id: m.id, result: { sessionID, state: "delivered" } })
    // Delivery receipt: the sender (and Ali) can see the message actually landed, not just queued.
    aporiaAlerts.push({ title: `✓ Delivered to ${target.name}`, detail: m.from ? `from ${name(m.from)}` : undefined, level: "success" })
    if (m.kind === "routine") {
      try {
        const out = await turn(sessionID, `⏰ Routine "${m.routine?.name}"${m.manual ? " (run now by Ali)" : ""}:\n\n${m.message}`, { kind: "routine", routine: m.routine?.id, msg: m.id, display: `⏰ Routine "${m.routine?.name}"` }, target.scopes, target.kind as BotKind)
        await routines({ op: "result", slug: target.slug, routine: m.routine?.id, name: m.routine?.name, sessionID, excerpt: out })
      } catch (err) { await routines({ op: "result", slug: target.slug, routine: m.routine?.id, name: m.routine?.name, sessionID, error: String((err as Error)?.message ?? err) }) }
      return
    }
    const label = m.kind === "reply" ? `📬 Reply from ${name(m.from)}` : `📨 From ${name(m.from)} (bot message${m.priority ? ", priority" : ""})`
    // What the receiving bot's chat shows: a small line, never the message body.
    const display = m.kind === "reply" ? `📬 Reply received from ${name(m.from)}` : `📨 Message received from ${name(m.from)}`
    // Without the PASS line a bot has no way to end a turn quietly, so every "already handled" reply became another
    // message back and another turn on the other side.
    // Anything held since this bot's last turn rides along here, so the message it is answering is not the only thing
    // it knows. Held notes live beside the bot, so a restart does not lose them.
    const held = ((await bots({ op: "fyiDrain", slug: target.slug })) as { from: string; text: string }[] | undefined) ?? []
    const heldText = held.length
      ? `Not needing a reply, held since your last turn:\n\n${held.map((e) => `${name(e.from)}: ${e.text}`).join("\n\n")}\n\n---\n\n`
      : ""
    const ask = `${heldText}${label}:\n\n${m.message}\n\nIf you have nothing to add — no new information and nothing for them to do — reply with exactly PASS and nothing is sent.`
    const reply = await turn(sessionID, ask, { kind: m.kind, from: m.from, msg: m.id, display }, target.scopes, target.kind as BotKind)
    if (m.kind === "message" && list.some((b) => b.slug === m.from) && !isSilentReply(reply)) {
      // One-way. An exchange ends here: a reply is never answered in turn, so nothing either bot says can start
      // another round. The answer wakes the asker only if the asker said it was blocked on one; otherwise it is filed
      // as held, and the asker reads it on its next turn — one wake instead of one per reply, which is what a
      // question sent to many bots used to cost.
      const blocked = m.response === "required"
      await bots({
        op: "inboxPost",
        msg: {
          from: target.slug,
          to: m.from,
          message: reply,
          priority: true,
          kind: "reply",
          replyTo: m.id,
          response: blocked ? "required" : "none",
        },
      })
    }
  }

  async function deliverRoom(m: Msg, list: Bot[], name: (s: string) => string) {
    const rooms = (await bots({ op: "rooms" })) as Room[]
    const room = rooms.find((r) => r.slug === m.room)
    await bots({ op: "inboxAck", id: m.id, result: { room: m.room } })
    if (!room) return
    if (m.kind !== "room" && list.some((b) => b.slug === m.from)) {
      if (duplicate(fingerprint(m.from, `room:${room.slug}`, m.message), m.id)) return
    }
    if (m.kind !== "room") await bots({ op: "roomPost", slug: room.slug, from: name(m.from), text: m.message, fanout: false })
    // Members take turns, each sees what was posted since its own last turn (including earlier members this round).
    for (const slug of room.members) {
      if (slug === m.from) continue
      const bot = list.find((b) => b.slug === slug); if (!bot) continue
      let sessionID = room.sessions[slug]
      if (!(await exists(sessionID))) {
        sessionID = await createSession(bot, `Room: ${room.name}`)
        room.sessions[slug] = sessionID
        await bots({ op: "roomSave", room: { slug: room.slug, sessions: { [slug]: sessionID } } })
      }
      const log = (await bots({ op: "roomRead", slug: room.slug })) as { at: string; from: string; text: string }[]
      const mineIdx = log.map((e) => e.from).lastIndexOf(bot.name)
      const recent = log.slice(mineIdx + 1).slice(-20).map((e) => `${e.from}: ${e.text}`).join("\n\n")
      const reply = await turn(sessionID, `🧑‍🤝‍🧑 Room "${room.name}" (members: ${room.members.map(name).join(", ")}). New posts since your last turn:\n\n${recent}\n\nYour reply goes to everyone in the room. Reply PASS to stay silent.`, { kind: "room", room: room.slug, msg: m.id, display: `🧑‍🤝‍🧑 Room "${room.name}" — new posts` }, bot.scopes, bot.kind as BotKind)
      if (!isSilentReply(reply)) await bots({ op: "roomPost", slug: room.slug, from: bot.name, text: reply, fanout: false })
    }
    aporiaAlerts.push({ title: `Room ${room.name}: round finished`, level: "info" })
  }

  // Independent targets run concurrently; a target already in flight keeps its lock so the same bot
  // or room round is never delivered twice at once. Messages for an in-flight target stay in the
  // inbox (unacked) and are picked up on a later tick, preserving per-target queue order.
  const scheduler = createDispatchScheduler<Msg, Bot[]>({
    load: async () => {
      try {
        if (sdk.connection.status() !== "connected") return null
        const messages = (await bots({ op: "inbox" })) as Msg[]
        if (!messages.length) return null
        const list = (await bots({ op: "list" })) as Bot[]
        return { messages, context: list }
      } catch { return null } // bridge missing or server not ready
    },
    target: (m) => (m.room ? `room:${m.room}` : `bot:${m.to}`),
    priority: (m) => m.priority,
    deliver: (m, list) => deliver(m, list),
    onError: async (m, err) => {
      await bots({ op: "inboxAck", id: m.id, result: { error: String((err as Error)?.message ?? err) } })
      aporiaAlerts.push({ title: "Bot message failed", detail: `${m.from} → ${m.to ?? m.room}: ${String((err as Error)?.message ?? err)}`, level: "error" })
    },
  })
  onMount(() => {
    const t = setInterval(() => { void scheduler.tick().catch(() => undefined) }, 4000)
    // Surface messages that have been sitting undelivered (the dispatcher only runs while the app is
    // open; without this they wait silently forever).
    const stuck = setInterval(async () => {
      try {
        const msgs = (await bots({ op: "inbox" })) as Msg[]
        const old = (msgs ?? []).filter((x) => Date.now() - Date.parse(x.created) > 10 * 60_000)
        if (old.length) aporiaAlerts.push({
          title: `${old.length} bot message${old.length > 1 ? "s" : ""} still undelivered`,
          detail: old.slice(0, 3).map((x) => `${x.from} → ${x.to ?? x.room}`).join(", "),
          level: "warning",
        })
      } catch { /* bridge/server not ready */ }
    }, 60_000)
    onCleanup(() => { clearInterval(t); clearInterval(stuck) })
  })
  return null
}
