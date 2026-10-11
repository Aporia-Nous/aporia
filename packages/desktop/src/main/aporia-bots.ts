// APORIA: Teammates (bots). Each bot lives in %USERPROFILE%\Aporia\bots\<slug>\ with bot.json + MEMORY.md.
// Every bot is materialized as a primary OpenCode agent file (~/.config/opencode/agents/aporia-<slug>.md) whose
// system prompt = bot instructions + MEMORY-AND-TOOLS rules + a snapshot of shared USER.md and its own MEMORY.md.
// Agent files are regenerated whenever a bot or a memory file changes; the engine hot-reloads agent files.
// The aporia-memory MCP (scripts/aporia-memory-mcp.mjs, stdio, headless) gives bots remember/forget/recall.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, watch, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { ipcMain } from "electron"
import { parse } from "jsonc-parser"
import { globalConfigFile, persistMcp } from "./aporia-mcp"

export type Routine = { id: string; name: string; cron: string; prompt: string; enabled: boolean }
export type Bot = {
  slug: string; name: string; avatar?: string; role: string; instructions: string
  model: string; tools: string[]; mcps: string[]; skills: string[]; voice?: string
  folder?: string; routines: Routine[]; sessions: string[]; created: string; seed?: boolean
}

export const APORIA_HOME = path.join(os.homedir(), "Aporia")
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

export function agentPrompt(bot: Bot) {
  return [
    `You are ${bot.name}, one of Ali Dillard's Aporia teammates (bot slug: ${bot.slug}).`,
    bot.role ? `ROLE: ${bot.role}` : "",
    bot.instructions,
    bot.skills.length ? `Skills you should load when relevant: ${bot.skills.join(", ")}.` : "",
    `Your working folder is ${path.join(BOTS_DIR, bot.slug)}. Answer Ali right away; run long work as background subagents/jobs per WORKING-STYLE.md so you are never blocked.`,
    "Anything sent externally under Ali's name (email, text, post, call) needs his explicit OK unless Owner mode is on.",
    `Memory tools (aporia-memory MCP): remember/forget/recall with bot="${bot.slug}". Below is a snapshot of memory at the time this prompt was built; use recall for anything older or more specific.`,
    read(RULES_FILE),
    "## SHARED MEMORY (USER.md, facts about Ali)\n" + cap(read(USER_MEMORY), 12000),
    `## YOUR MEMORY (${bot.slug}/MEMORY.md)\n` + cap(read(path.join(BOTS_DIR, bot.slug, "MEMORY.md")), 12000),
  ].filter(Boolean).join("\n\n")
}

export function writeAgent(bot: Bot) {
  mkdirSync(agentsDir(), { recursive: true })
  const fm = ["---", `description: ${frontmatterString(bot.role || bot.name)}`, "mode: primary", `model: ${bot.model}`, "---", ""].join("\n")
  const file = path.join(agentsDir(), `aporia-${bot.slug}.md`)
  const next = fm + agentPrompt(bot) + "\n"
  if (read(file) !== next) writeFileSync(file, next)
}
export const regenerateAll = () => listBots().forEach((b) => { try { writeAgent(b) } catch {} })

// ---- seeding ------------------------------------------------------------------------------
const RULES_NOTE = "Follows MEMORY-AND-TOOLS.md (memory, tool escalation, swapping rules)."
function roleFromTeammate(file: string) {
  const text = read(file)
  const body = text.split(/Role text \(verbatim\):/i)[1] ?? text.replace(/^#.*$/m, "")
  return body.trim()
}
const firstLine = (s: string) => (s.split(/(?<=\.)\s|\n/)[0] ?? "").slice(0, 160)

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
  try { current = parse(read(file)) ?? {} } catch {}
  const node = existsSync("C:\\Tools\\node22\\node.exe") ? "C:\\Tools\\node22\\node.exe" : "node"
  const want = { type: "local", command: [node, MEMORY_MCP], enabled: true }
  const have = current?.mcp?.["aporia-memory"]
  if (have && JSON.stringify(have.command) === JSON.stringify(want.command)) return false
  persistMcp(file, "aporia-memory", want as any) // writes a timestamped backup first
  return true
}

let watching = false
function watchMemory() {
  if (watching) return; watching = true
  let t: NodeJS.Timeout | undefined
  const kick = () => { clearTimeout(t); t = setTimeout(regenerateAll, 500) }
  for (const dir of [path.dirname(USER_MEMORY), BOTS_DIR, HANDOFF]) {
    try { mkdirSync(dir, { recursive: true }); watch(dir, { recursive: true }, (_e, f) => { if (f && /\.(md|json)$/i.test(String(f)) && !String(f).includes(".bak")) kick() }) } catch {}
  }
}

export function startBots() {
  try { seedBots() } catch (e) { console.error("aporia bots seed", e) }
  try { ensureMemoryMcp() } catch (e) { console.error("aporia memory mcp", e) }
  regenerateAll(); watchMemory()
}

export function registerAporiaBotsHandler() {
  startBots()
  ipcMain.handle("aporia:bots", (_e, input: any) => {
    switch (input?.op) {
      case "list": return listBots()
      case "get": return getBot(String(input.slug))
      case "save": return saveBot(input.bot ?? {})
      case "delete": return deleteBot(String(input.slug))
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
      case "paths": return { home: APORIA_HOME, bots: BOTS_DIR, user: USER_MEMORY, agents: agentsDir() }
    }
    throw new Error("Unknown bots op")
  })
}
