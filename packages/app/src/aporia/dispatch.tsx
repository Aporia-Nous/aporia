// APORIA: bot-to-bot dispatcher. Polls %APORIA_HOME%\inbox (via the desktop bridge), delivers each message into the
// target bot's chat as a labeled turn, waits for the turn to finish, and posts the reply back to the sender's chat.
// Rooms: a post reaches every member; members take turns in order, each seeing the room posts since its last turn.
// Runs in the renderer, so it keeps working while the window is minimized (Electron keeps the renderer alive).
import { onCleanup, onMount } from "solid-js"
import { Session } from "@opencode/schema/session"
import { useData } from "@/runtime/server/current"
import { useServerSDK } from "@/runtime/server/client"
import { aporiaAlerts } from "./alerts"
import { agentFor, bots, refreshBots, type Bot } from "./bots"

type Msg = { id: string; from: string; to?: string; room?: string; message: string; priority: boolean; kind: "message" | "reply" | "room" | "routine"; created: string; fromSession?: string; routine?: { id: string; name: string }; manual?: boolean }
const routines = (input: unknown) => (globalThis as any).electron?.aporia?.routines?.(input)
type Room = { slug: string; name: string; members: string[]; sessions: Record<string, string> }
const IDLE_DELAY_MS = 2 * 60_000 // non-priority messages wait this long (target idle) before they wake it
const TURN_TIMEOUT_MS = 15 * 60_000
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
let running = false

export function BotDispatcher() {
  const sdk = useServerSDK()
  const data = useData()
  const api = sdk.api as any

  const paths = bots({ op: "paths" }) as Promise<{ bots: string }>
  async function createSession(bot: Bot, title?: string) {
    const [providerID, ...rest] = (bot.model || "deepseek/deepseek-flash").split("/")
    const directory = `${(await paths).bots}\\${bot.slug}`
    const created = data.session.create({ id: Session.ID.create(), agent: agentFor(bot.slug), model: { id: rest.join("/"), providerID }, location: { directory } } as any)
    await created.request
    if (title) await api.session.update({ sessionID: created.id, title }).catch(() => undefined)
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
  async function turn(sessionID: string, text: string, metadata: Record<string, unknown>) {
    const before = Date.now()
    await api.session.prompt({ sessionID, text, delivery: "queue", metadata: { aporia: metadata } })
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
    if (!target) return bots({ op: "inboxAck", id: m.id, result: { error: "no such bot" } })
    const sessionID = await botSession(target)
    if (!m.priority && (busy(sessionID) || Date.now() - Date.parse(m.created) < IDLE_DELAY_MS)) return // wait
    await bots({ op: "inboxAck", id: m.id, result: { sessionID, state: "delivered" } })
    if (m.kind === "routine") {
      try {
        const out = await turn(sessionID, `⏰ Routine "${m.routine?.name}"${m.manual ? " (run now by Ali)" : ""}:\n\n${m.message}`, { kind: "routine", routine: m.routine?.id, msg: m.id })
        await routines({ op: "result", slug: target.slug, routine: m.routine?.id, name: m.routine?.name, sessionID, excerpt: out })
      } catch (err) { await routines({ op: "result", slug: target.slug, routine: m.routine?.id, name: m.routine?.name, sessionID, error: String((err as Error)?.message ?? err) }) }
      return
    }
    const label = m.kind === "reply" ? `📬 Reply from ${name(m.from)}` : `📨 From ${name(m.from)} (bot message${m.priority ? ", priority" : ""})`
    const reply = await turn(sessionID, `${label}:\n\n${m.message}`, { kind: m.kind, from: m.from, msg: m.id })
    if (m.kind === "message" && list.some((b) => b.slug === m.from)) {
      await bots({ op: "inboxPost", msg: { from: target.slug, to: m.from, message: reply, priority: true, kind: "reply", replyTo: m.id } })
    }
  }

  async function deliverRoom(m: Msg, list: Bot[], name: (s: string) => string) {
    const rooms = (await bots({ op: "rooms" })) as Room[]
    const room = rooms.find((r) => r.slug === m.room)
    await bots({ op: "inboxAck", id: m.id, result: { room: m.room } })
    if (!room) return
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
      const reply = await turn(sessionID, `🧑‍🤝‍🧑 Room "${room.name}" (members: ${room.members.map(name).join(", ")}). New posts since your last turn:\n\n${recent}\n\nYour reply goes to everyone in the room. Reply PASS to stay silent.`, { kind: "room", room: room.slug, msg: m.id })
      if (!/^\s*PASS\.?\s*$/i.test(reply)) await bots({ op: "roomPost", slug: room.slug, from: bot.name, text: reply, fanout: false })
    }
    aporiaAlerts.push({ title: `Room ${room.name}: round finished`, level: "info" })
  }

  async function tick() {
    if (running || sdk.connection.status() !== "connected") return
    running = true
    try {
      const pending = (await bots({ op: "inbox" })) as Msg[]
      if (!pending.length) return
      const list = (await bots({ op: "list" })) as Bot[]
      const order = [...pending].sort((a, b) => Number(b.priority) - Number(a.priority))
      for (const m of order) {
        try { await deliver(m, list) } catch (err) {
          await bots({ op: "inboxAck", id: m.id, result: { error: String((err as Error)?.message ?? err) } })
          aporiaAlerts.push({ title: "Bot message failed", detail: `${m.from} → ${m.to ?? m.room}: ${String((err as Error)?.message ?? err)}`, level: "error" })
        }
      }
    } catch { /* bridge missing or server not ready */ } finally { running = false }
  }
  onMount(() => { const t = setInterval(() => void tick(), 4000); onCleanup(() => clearInterval(t)) })
  return null
}
