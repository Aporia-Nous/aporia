// APORIA: Teammates (bots). Each bot lives in %USERPROFILE%\Aporia\bots\<slug>\ with bot.json + MEMORY.md.
// Every bot is materialized as a primary OpenCode agent file (~/.config/opencode/agents/aporia-<slug>.md) whose
// system prompt = bot instructions + MEMORY-AND-TOOLS rules + a snapshot of shared USER.md and its own MEMORY.md.
// Agent files are regenerated whenever a bot or a memory file changes; the engine hot-reloads agent files.
// The aporia-memory MCP (scripts/aporia-memory-mcp.mjs, stdio, headless) gives bots remember/forget/recall.
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, watch, writeFileSync, type FSWatcher } from "node:fs"
import os from "node:os"
import path from "node:path"
import { app, ipcMain } from "electron"
import { parse } from "jsonc-parser"
import { globalConfigFile, persistMcpSync } from "./aporia-mcp"
import { aporiaLog } from "./aporia-log"

export type Routine = { id: string; name: string; cron: string; prompt: string; enabled: boolean }
export type Bot = {
  slug: string; name: string; avatar?: string; role: string; instructions: string
  model: string; tools: string[]; mcps: string[]; skills: string[]; voice?: string
  folder?: string; routines: Routine[]; sessions: string[]; created: string; seed?: boolean
}

export const APORIA_HOME = process.env.APORIA_HOME || path.join(os.homedir(), "Aporia")
export const BOTS_DIR = path.join(APORIA_HOME, "bots")
export const USER_MEMORY = path.join(APORIA_HOME, "memory", "USER.md")
const HANDOFF = path.join(APORIA_HOME, "handoff")
const RULES_FILE = path.join(HANDOFF, "MEMORY-AND-TOOLS.md")
const DEFAULT_MODEL = "deepseek/deepseek-flash" // never auto-upgraded
const agentsDir = () => path.join(path.dirname(globalConfigFile()), "agents")
const MEMORY_MCP = "C:\\Tools\\aporia\\scripts\\aporia-memory-mcp.mjs" // source checkout (also used by the updater)

export const slugify = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "bot"
const read = (f: string) => (existsSync(f) ? readFileSync(f, "utf8") : "")
const cap = (s: string, n: number) => (s.length > n ? s.slice(-n) + "\n(older entries trimmed; use recall)" : s)
const botFile = (slug: string) => path.join(BOTS_DIR, slug, "bot.json")

export function listBots(): Bot[] {
  if (!existsSync(BOTS_DIR)) return []
  return readdirSync(BOTS_DIR)
    .filter((d) => existsSync(botFile(d)))
    .map((d) => { try { return JSON.parse(readFileSync(botFile(d), "utf8")) as Bot } catch { return undefined } })
    .filter((b): b is Bot => !!b)
    .sort((a, b) => (a.slug === "grok" ? -1 : b.slug === "grok" ? 1 : a.name.localeCompare(b.name)))
}
export const getBot = (slug: string) => listBots().find((b) => b.slug === slug)

function normalize(input: Partial<Bot>, prev?: Bot): Bot {
  const name = String(input.name ?? prev?.name ?? "").trim()
  if (!name) throw new Error("Bot needs a name")
  const slug = prev?.slug ?? slugify(input.slug || name)
  return {
    slug, name,
    avatar: input.avatar ?? prev?.avatar,
    role: String(input.role ?? prev?.role ?? ""),
    instructions: String(input.instructions ?? prev?.instructions ?? ""),
    model: String(input.model || prev?.model || DEFAULT_MODEL),
    tools: input.tools ?? prev?.tools ?? [],
    mcps: input.mcps ?? prev?.mcps ?? [],
    skills: input.skills ?? prev?.skills ?? [],
    voice: input.voice ?? prev?.voice,
    folder: input.folder ?? prev?.folder,
    routines: (input.routines ?? prev?.routines ?? []).map((r) => ({ ...r })),
    sessions: input.sessions ?? prev?.sessions ?? [],
    created: prev?.created ?? new Date().toISOString(),
    seed: input.seed ?? prev?.seed,
    ...((input as any).roleVersion ?? (prev as any)?.roleVersion ? { roleVersion: (input as any).roleVersion ?? (prev as any)?.roleVersion } : {}),
  }
}

export function saveBot(input: Partial<Bot>): Bot {
  const prev = input.slug ? getBot(input.slug) : undefined
  const bot = normalize(input, prev)
  if (!prev && existsSync(botFile(bot.slug))) throw new Error(`A bot named ${bot.slug} already exists`)
  const dir = path.join(BOTS_DIR, bot.slug)
  mkdirSync(dir, { recursive: true })
  if (existsSync(botFile(bot.slug))) copyFileSync(botFile(bot.slug), botFile(bot.slug) + ".bak")
  writeFileSync(botFile(bot.slug), JSON.stringify(bot, null, 2))
  const mem = path.join(dir, "MEMORY.md")
  if (!existsSync(mem)) writeFileSync(mem, `# ${bot.name} memory\n\n`)
  writeAgent(bot)
  return bot
}

export function deleteBot(slug: string) {
  const bot = getBot(slug); if (!bot) return false
  // Keep the folder (memory) as a backup; only the agent and bot.json are retired.
  const dir = path.join(BOTS_DIR, slug)
  copyFileSync(botFile(slug), path.join(dir, `bot.json.deleted-${Date.now()}`))
  rmSync(botFile(slug))
  rmSync(path.join(agentsDir(), `aporia-${slug}.md`), { force: true })
  return true
}

function frontmatterString(s: string) { return JSON.stringify(s.replace(/\s+/g, " ").slice(0, 300)) }

// The shared, per-pass inputs: read once and reused for every bot's prompt, instead of re-reading
// USER.md and the rules file for each bot during a regeneration pass.
export type SharedPrompt = { rules: string; user: string }
export function sharedPrompt(): SharedPrompt {
  return { rules: read(RULES_FILE), user: cap(read(USER_MEMORY), 12000) }
}

export function agentPrompt(bot: Bot, shared: SharedPrompt = sharedPrompt()) {
  return [
    `You are ${bot.name}, one of Ali Dillard's Aporia teammates (bot slug: ${bot.slug}).`,
    bot.role ? `ROLE: ${bot.role}` : "",
    bot.instructions,
    bot.skills.length ? `Skills you should load when relevant: ${bot.skills.join(", ")}.` : "",
    `Your working folder is ${path.join(BOTS_DIR, bot.slug)}. Answer Ali right away; run long work as background subagents/jobs per WORKING-STYLE.md so you are never blocked.`,
    "Anything sent externally under Ali's name (email, text, post, call) needs his explicit OK unless Owner mode is on.",
    `Reactions: you can react to Ali's latest message with the react tool (bot="${bot.slug}", one emoji) instead of replying to a quick thanks or acknowledgement; follow the reaction rules in VOICE.md.`,
    `Teammates: use send_to_bot (from="${bot.slug}") to ask another bot (list_bots shows them) or post to room:<slug>. It's async: keep working, the reply arrives as a new message. Messages starting with "📨 From" are from another bot; answer them directly (your final reply is sent back automatically, so don't call send_to_bot to reply). In a room turn, reply with PASS if you have nothing useful to add.`,
    `Memory tools (aporia-memory MCP): remember/forget/recall with bot="${bot.slug}". Below is a snapshot of memory at the time this prompt was built; use recall for anything older or more specific.`,
    shared.rules,
    recentReactions(bot.slug),
    "## SHARED MEMORY (USER.md, facts about Ali)\n" + shared.user,
    `## YOUR MEMORY (${bot.slug}/MEMORY.md)\n` + cap(read(path.join(BOTS_DIR, bot.slug, "MEMORY.md")), 12000),
  ].filter(Boolean).join("\n\n")
}

function recentReactions(slug: string) {
  const f = path.join(BOTS_DIR, slug, "reactions.jsonl"); if (!existsSync(f)) return ""
  const ali = read(f).trim().split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return undefined } }).filter((r) => r?.by === "ali").slice(-10)
  if (!ali.length) return ""
  return "## Ali's recent reactions to your messages (newest last)\n" + ali.map((r) => `- ${r.at.slice(0, 16)} ${r.emoji} on: "${String(r.excerpt ?? "").slice(0, 120)}"`).join("\n")
}

export function writeAgent(bot: Bot, shared: SharedPrompt = sharedPrompt()) {
  mkdirSync(agentsDir(), { recursive: true })
  const fm = ["---", `description: ${frontmatterString(bot.role || bot.name)}`, "mode: primary", `model: ${bot.model}`, "---", ""].join("\n")
  const file = path.join(agentsDir(), `aporia-${bot.slug}.md`)
  const next = fm + agentPrompt(bot, shared) + "\n"
  if (read(file) !== next) writeFileSync(file, next)
}

const errorText = (error: unknown) => (error instanceof Error ? (error.stack ?? error.message) : String(error))

/** Regenerate the agent files for just these bots, reading the shared USER.md / rules once for the pass. */
export function regenerateBots(slugs: Iterable<string>): string[] {
  const shared = sharedPrompt()
  const bots = new Map(listBots().map((b) => [b.slug, b]))
  const done: string[] = []
  for (const slug of new Set(slugs)) {
    const bot = bots.get(slug)
    if (!bot) continue
    try {
      writeAgent(bot, shared)
      done.push(slug)
    } catch (error) {
      aporiaLog.error(`aporia regenerate ${slug} failed`, errorText(error))
    }
  }
  return done
}

export const regenerateAll = () => regenerateBots(listBots().map((b) => b.slug))

// ---- inbox (bot-to-bot) and rooms --------------------------------------------------------
export const INBOX = path.join(APORIA_HOME, "inbox")
export const ROOMS = path.join(APORIA_HOME, "rooms")
export type InboxMsg = { id: string; from: string; to?: string; room?: string; message: string; priority: boolean; kind: "message" | "reply" | "room" | "routine"; routine?: { id: string; name: string }; manual?: boolean; created: string; replyTo?: string; fromSession?: string }
export type Room = { slug: string; name: string; members: string[]; sessions: Record<string, string>; created: string }
const roomFile = (slug: string) => path.join(ROOMS, slug, "room.json")
export function inboxPending(): InboxMsg[] {
  if (!existsSync(INBOX)) return []
  return readdirSync(INBOX).filter((f) => f.endsWith(".json")).sort()
    .map((f) => { try { return JSON.parse(readFileSync(path.join(INBOX, f), "utf8")) } catch { return undefined } }).filter(Boolean)
}
export function inboxPost(m: Partial<InboxMsg>) {
  mkdirSync(INBOX, { recursive: true })
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const msg = { id, priority: false, kind: "message", created: new Date().toISOString(), ...m } as InboxMsg
  writeFileSync(path.join(INBOX, id + ".json"), JSON.stringify(msg, null, 2)); return msg
}
export function inboxAck(id: string, result: unknown) {
  const f = path.join(INBOX, `${id}.json`); if (!existsSync(f)) return false
  const done = path.join(INBOX, "done"); mkdirSync(done, { recursive: true })
  const msg = JSON.parse(readFileSync(f, "utf8"))
  writeFileSync(path.join(done, `${id}.json`), JSON.stringify({ ...msg, result, deliveredAt: new Date().toISOString() }, null, 2)); rmSync(f)
  appendFileSync(path.join(APORIA_HOME, "bots", "messages.log.jsonl"), JSON.stringify({ at: new Date().toISOString(), ...msg, result }) + "\n")
  return true
}
export function listRooms(): Room[] {
  if (!existsSync(ROOMS)) return []
  return readdirSync(ROOMS).filter((d) => existsSync(roomFile(d))).map((d) => JSON.parse(readFileSync(roomFile(d), "utf8")))
}
export function saveRoom(input: Partial<Room>): Room {
  const prev = input.slug ? listRooms().find((r) => r.slug === input.slug) : undefined
  const name = String(input.name ?? prev?.name ?? "").trim(); if (!name) throw new Error("Room needs a name")
  const room: Room = { slug: prev?.slug ?? slugify(name), name, members: (input.members ?? prev?.members ?? []).filter((m) => !!getBot(m)), sessions: { ...(prev?.sessions ?? {}), ...(input.sessions ?? {}) }, created: prev?.created ?? new Date().toISOString() }
  mkdirSync(path.dirname(roomFile(room.slug)), { recursive: true }); writeFileSync(roomFile(room.slug), JSON.stringify(room, null, 2)); return room
}
const transcript = (slug: string) => path.join(ROOMS, slug, "transcript.jsonl")
export function roomAppend(slug: string, entry: { from: string; text: string }) {
  mkdirSync(path.join(ROOMS, slug), { recursive: true })
  const e = { at: new Date().toISOString(), ...entry }; appendFileSync(transcript(slug), JSON.stringify(e) + "\n"); return e
}
export function roomRead(slug: string, limit = 200) {
  return read(transcript(slug)).trim().split("\n").filter(Boolean).slice(-limit).map((l) => JSON.parse(l))
}

// ---- seeding ------------------------------------------------------------------------------
const RULES_NOTE = "Follows MEMORY-AND-TOOLS.md (memory, tool escalation, swapping rules)."
function roleFromTeammate(file: string) {
  const text = read(file)
  const body = text.split(/Role text \(verbatim\):/i)[1] ?? text.replace(/^#.*$/m, "")
  return body.trim()
}
// First sentence, cut at a word boundary (never mid-word) with an ellipsis when it's long.
export const firstLine = (s: string, max = 220) => {
  const first = (s.trim().split(/(?<=[.!?])\s|\n/)[0] ?? "").trim()
  if (first.length <= max) return first
  const cut = first.slice(0, max); const sp = cut.lastIndexOf(" ")
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[,;:\s]+$/, "") + "…"
}

export function seedBots() {
  const marker = path.join(BOTS_DIR, ".seeded")
  if (existsSync(marker)) return { seeded: false }
  mkdirSync(path.dirname(USER_MEMORY), { recursive: true })
  if (!existsSync(USER_MEMORY)) {
    const legacy = path.join(APORIA_HOME, "memory", "MEMORY.md")
    writeFileSync(USER_MEMORY, "# Shared memory: facts about Ali\n\n" + (existsSync(legacy) ? `(Imported from memory/MEMORY.md on first run)\n\n${read(legacy)}\n` : ""))
  }
  const team = path.join(APORIA_HOME, "workspace", "teammates")
  const seeds: { name: string; file?: string; skills: string[]; avatar: string; role?: string }[] = [
    { name: "Rep Recruiter", file: "Rep-Recruiter.md", skills: ["rep-recruiter"], avatar: "🧲" },
    { name: "Upwork Expert", file: "Upwork-Expert.md", skills: ["upwork-expert"], avatar: "💼" },
    { name: "Copy Humanizer", file: "Copy-Humanizer.md", skills: [], avatar: "✍️" },
    { name: "Outbound Prospecting", file: "Outbound-Prospecting.md", skills: [], avatar: "🎯" },
    { name: "SEO & AEO Desk", skills: [], avatar: "🔎", role: "Runs SEO and answer-engine optimization (AEO) for aporianous.com and the rep portal: keyword and question research, on-page fixes, schema (FAQ, LocalBusiness, JobPosting), content briefs, and tracking rankings and AI-answer citations. Proposes changes; nothing is published without Ali's OK." },
    { name: "Projects Manager", file: "Projects-Manager.md", skills: [], avatar: "🗂️" },
  ]
  const made: string[] = []
  for (const s of seeds) {
    const role = s.role ?? (s.file && existsSync(path.join(team, s.file)) ? roleFromTeammate(path.join(team, s.file)) : `${s.name} teammate.`)
    if (existsSync(botFile(slugify(s.name)))) continue
    saveBot({ name: s.name, avatar: s.avatar, role: `${firstLine(role)} ${RULES_NOTE}`, instructions: role, skills: s.skills, folder: "Teammates", routines: [], seed: true })
    made.push(s.name)
  }
  if (!existsSync(botFile("grok"))) {
    const parts = ["AGENTS.md", "VOICE.md", "WORKING-STYLE.md"].map((f) => `## ${f}\n${read(path.join(HANDOFF, f))}`)
    saveBot({ slug: "grok", name: "Grok", avatar: "⚡", folder: "Main",
      role: `Ali's main assistant: runs the business day to day, delegates to teammates, keeps HANDOFF.md current. ${RULES_NOTE}`,
      instructions: [
        "You are the main bot. Delegate specialist work to teammates (list_bots), keep HANDOFF.md current, and follow these files (snapshot below; re-read the originals in C:\\Users\\Dilla\\Aporia\\handoff\\ when they may have changed):",
        ...parts,
      ].join("\n\n"), skills: [], routines: [], seed: true })
    made.push("Grok")
  }
  writeFileSync(marker, new Date().toISOString())
  return { seeded: true, made }
}

export function ensureMemoryMcp() {
  const file = globalConfigFile()
  let current: any = {}
  try { current = parse(read(file)) ?? {} }
  catch (error) { aporiaLog.error("aporia memory-mcp config parse failed; leaving it unchanged", errorText(error)) }
  const node = existsSync("C:\\Tools\\node22\\node.exe") ? "C:\\Tools\\node22\\node.exe" : "node"
  const want = { type: "local", command: [node, MEMORY_MCP], enabled: true }
  const have = current?.mcp?.["aporia-memory"]
  if (have && JSON.stringify(have.command) === JSON.stringify(want.command)) return false
  persistMcpSync(file, "aporia-memory", want as any) // validated write; keeps one backup
  return true
}

// ---- watchers (narrow: one non-recursive watch per bot dir + the shared memory/rules dirs) -----
// Map a changed path to what must be regenerated: "*" for a shared file (USER.md / rules), a list of
// slugs for a bot's own files, or [] for anything we do not care about.
export function changeTargets(changedFile: string): string[] | "*" {
  const file = changedFile.replace(/\\/g, "/")
  if (/(?:^|\/)USER\.md$/i.test(file) || /MEMORY-AND-TOOLS\.md$/i.test(file)) return "*"
  const bot = file.match(/(?:^|\/)bots\/([^/]+)\/(?:bot\.json|MEMORY\.md|reactions\.jsonl)$/i)
  return bot ? [bot[1]] : []
}

export function regenerateChanged(changedFile: string): string[] {
  const targets = changeTargets(changedFile)
  if (targets === "*") return regenerateBots(listBots().map((b) => b.slug))
  return regenerateBots(targets)
}

let watching = false
let watchers: FSWatcher[] = []
const watchedBots = new Set<string>()
let debounce: NodeJS.Timeout | undefined
const pendingBots = new Set<string>()
let pendingShared = false

function kick() {
  clearTimeout(debounce)
  debounce = setTimeout(flush, 500)
}

function flush() {
  const shared = pendingShared
  const slugs = [...pendingBots]
  pendingShared = false
  pendingBots.clear()
  try {
    if (shared) regenerateAll()
    else if (slugs.length) regenerateBots(slugs)
  } catch (error) {
    aporiaLog.error("aporia watcher regeneration failed", errorText(error))
  }
}

function addWatch(dir: string, onFile: (name: string) => void) {
  try {
    mkdirSync(dir, { recursive: true })
    const watcher = watch(dir, { recursive: false }, (_event, name) => { if (name) onFile(String(name)) })
    watcher.on("error", (error) => aporiaLog.error(`aporia watcher on ${dir} failed`, errorText(error)))
    watchers.push(watcher)
  } catch (error) {
    aporiaLog.error(`aporia watcher setup for ${dir} failed`, errorText(error))
  }
}

function watchBot(slug: string) {
  if (watchedBots.has(slug)) return
  watchedBots.add(slug)
  addWatch(path.join(BOTS_DIR, slug), (name) => {
    if (/^(bot\.json|MEMORY\.md)$/i.test(name) || /^reactions\.jsonl$/i.test(name)) {
      pendingBots.add(slug)
      kick()
    }
  })
}

function watchNewBots() {
  for (const bot of listBots()) watchBot(bot.slug)
}

export function isWatching() {
  return watching
}

export function closeWatchers() {
  clearTimeout(debounce)
  for (const watcher of watchers) {
    try { watcher.close() }
    catch (error) { aporiaLog.error("aporia watcher close failed", errorText(error)) }
  }
  watchers = []
  watchedBots.clear()
  pendingBots.clear()
  pendingShared = false
  watching = false
}

export function watchMemory(): () => void {
  if (watching) return closeWatchers
  watching = true
  // Shared inputs -> regenerate every bot.
  addWatch(path.dirname(USER_MEMORY), (name) => { if (name === "USER.md") { pendingShared = true; kick() } })
  addWatch(path.dirname(RULES_FILE), (name) => { if (name === path.basename(RULES_FILE)) { pendingShared = true; kick() } })
  // Each bot's own files -> regenerate only that bot.
  watchNewBots()
  // A new/removed bot dir -> (re)install its watch.
  addWatch(BOTS_DIR, () => watchNewBots())
  // Close the handles when the app quits.
  app.once("will-quit", closeWatchers)
  return closeWatchers
}

function migrateSeedRoles() {
  // v2: seed descriptions used to be cut at 160 chars mid-word; rebuild them at a word boundary.
  const team = path.join(APORIA_HOME, "workspace", "teammates")
  for (const b of listBots()) {
    if (!b.seed || (b as any).roleVersion >= 2 || b.slug === "grok" || b.slug === "seo-and-aeo-desk") continue
    const file = path.join(team, b.name.replace(/ /g, "-") + ".md")
    if (!existsSync(file)) continue
    saveBot({ ...b, role: `${firstLine(roleFromTeammate(file))} ${RULES_NOTE}`, roleVersion: 2 } as any)
  }
}

// ---- startup health -------------------------------------------------------
export type BotsHealth = { readonly ok: boolean; readonly stage?: string; readonly error?: string; readonly at: string }

export type BotsInitStep = readonly [stage: string, run: () => void]

let health: BotsHealth = { ok: true, at: new Date().toISOString() }

/** Last bots-init outcome, surfaced over `aporia:bots { op: "health" }` so the UI can warn on failure. */
export const botsHealth = (): BotsHealth => health

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))

const defaultInitSteps = (): BotsInitStep[] => [
  ["seed", seedBots],
  ["migrate", migrateSeedRoles],
  ["memory-mcp", ensureMemoryMcp],
  ["regenerate", () => { regenerateAll(); watchMemory() }],
]

export function startBots(steps: ReadonlyArray<BotsInitStep> = defaultInitSteps()) {
  const failures: { readonly stage: string; readonly error: unknown }[] = []
  for (const [stage, run] of steps) {
    try {
      run()
    } catch (error) {
      failures.push({ stage, error })
    }
  }
  if (failures.length > 0) {
    health = {
      ok: false,
      stage: failures.map((failure) => failure.stage).join(","),
      error: failures.map((failure) => errorMessage(failure.error)).join("; "),
      at: new Date().toISOString(),
    }
    throw new Error(`aporia bots init failed (${health.stage}): ${health.error}`)
  }
  health = { ok: true, at: new Date().toISOString() }
  return health
}

export function registerAporiaBotsHandler() {
  ipcMain.handle("aporia:bots", (_e, input: any) => {
    switch (input?.op) {
      case "list": return listBots()
      case "get": return getBot(String(input.slug))
      case "save": return saveBot(input.bot ?? {})
      case "delete": return deleteBot(String(input.slug))
      case "health": return botsHealth()
      case "attachSession": {
        const bot = getBot(String(input.slug)); if (!bot) throw new Error("No such bot")
        if (!bot.sessions.includes(input.sessionID)) bot.sessions.unshift(String(input.sessionID))
        return saveBot(bot)
      }
      case "memory": {
        const f = input.scope === "user" ? USER_MEMORY : path.join(BOTS_DIR, slugify(String(input.slug)), "MEMORY.md")
        if (input.text === undefined) return read(f)
        if (existsSync(f)) copyFileSync(f, f + ".bak")
        mkdirSync(path.dirname(f), { recursive: true }); writeFileSync(f, String(input.text)); return true
      }
      case "inbox": return inboxPending()
      case "inboxPost": return inboxPost(input.msg ?? {})
      case "inboxAck": return inboxAck(String(input.id), input.result)
      case "rooms": return listRooms()
      case "roomSave": return saveRoom(input.room ?? {})
      case "roomPost": {
        const e = roomAppend(String(input.slug), { from: String(input.from ?? "Ali"), text: String(input.text) })
        if (input.fanout !== false) inboxPost({ from: String(input.from ?? "ali"), room: String(input.slug), message: String(input.text), priority: true, kind: "room" })
        return e
      }
      case "roomRead": return roomRead(String(input.slug))
      case "paths": return { home: APORIA_HOME, bots: BOTS_DIR, user: USER_MEMORY, agents: agentsDir() }
    }
    throw new Error("Unknown bots op")
  })
}
