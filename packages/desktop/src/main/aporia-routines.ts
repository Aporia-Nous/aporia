// APORIA: per-bot routines (cron, America/Chicago), builder (DeepSeek drafts a bot), templates, reactions.
// The scheduler runs in the main process every 30s, so routines fire while the window is minimized; a due routine
// is dropped into the bot inbox (kind "routine") and the in-app dispatcher runs the turn and records the result.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { BrowserWindow, dialog, ipcMain } from "electron"
import { BOTS_DIR, getBot, inboxPost, listBots, safeSlug, saveBot, slugify, type Bot, type Routine } from "./aporia-bots"
import { aporiaLog } from "./aporia-log"
import { resolveVault } from "./aporia-vault-store"

const TZ = "America/Chicago"
const MINUTE_MS = 60_000
const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000
// ~4 years so any leap day (e.g. Feb 29) is always reachable; the old stepper capped at one year.
const SEARCH_DAYS = 1465
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
// Hoisted: one formatter for the whole process instead of a fresh Intl.DateTimeFormat per match.
const CHICAGO = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour12: false, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", weekday: "short" })

// ---- cron (5 fields: min hour dom mon dow; *, */n, a-b, a,b) -------------------------------
function field(spec: string, min: number, max: number): Set<number> {
  const out = new Set<number>()
  for (const part of spec.split(",")) {
    const [range = "*", stepS] = part.split("/")
    const step = stepS ? Number(stepS) : 1
    let a = min, b = max
    if (range !== "*") {
      const [x, y] = range.split("-")
      a = Number(x); b = y !== undefined ? Number(y) : stepS ? max : a
    }
    if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(step) || step < 1) throw new Error(`bad cron field "${spec}"`)
    for (let v = a; v <= b; v += step) if (v >= min && v <= max) out.add(v)
  }
  return out
}
export type Cron = { min: Set<number>; hour: Set<number>; dom: Set<number>; mon: Set<number>; dow: Set<number>; domStar: boolean; dowStar: boolean }
export function parseCron(cron: string): Cron {
  const f = cron.trim().split(/\s+/) as [string, string, string, string, string]; if (f.length !== 5) throw new Error("cron needs 5 fields: min hour day month weekday")
  const dow = field(f[4], 0, 7); if (dow.has(7)) dow.add(0)
  return { min: field(f[0], 0, 59), hour: field(f[1], 0, 23), dom: field(f[2], 1, 31), mon: field(f[3], 1, 12), dow, domStar: f[2] === "*", dowStar: f[4] === "*" }
}
type WallClock = { year: number; month: number; day: number; hour: number; minute: number; dow: number }
// The wall-clock fields Chicago is showing at absolute instant `d` (one formatToParts call).
function localParts(d: Date): WallClock {
  const p = Object.fromEntries(CHICAGO.formatToParts(d).map((x) => [x.type, x.value]))
  return { year: Number(p.year), month: Number(p.month), day: Number(p.day), hour: Number(p.hour) % 24, minute: Number(p.minute), dow: WEEKDAYS.indexOf(p.weekday as string) }
}
export function cronMatches(cron: string, d: Date) {
  const c = parseCron(cron); const t = localParts(d)
  const dayOk = c.domStar || c.dowStar ? c.dom.has(t.day) && c.dow.has(t.dow) : c.dom.has(t.day) || c.dow.has(t.dow)
  return c.min.has(t.minute) && c.hour.has(t.hour) && c.mon.has(t.month) && dayOk
}
// Local wall clock -> every absolute instant that shows it: usually one, none in a spring-forward
// gap, two in a fall-back overlap. Needed to resolve a cron date back to a real timestamp.
function localInstants(wall: Omit<WallClock, "dow">): Date[] {
  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute)
  const atGuess = localParts(new Date(asUtc))
  const offset = Date.UTC(atGuess.year, atGuess.month - 1, atGuess.day, atGuess.hour, atGuess.minute) - asUtc
  const found = new Set<number>()
  for (const candidate of [offset, offset + HOUR_MS, offset - HOUR_MS]) {
    const ms = asUtc - candidate
    const t = localParts(new Date(ms))
    if (t.year === wall.year && t.month === wall.month && t.day === wall.day && t.hour === wall.hour && t.minute === wall.minute) found.add(ms)
  }
  return [...found].sort((a, b) => a - b).map((ms) => new Date(ms))
}
const dowMatches = (c: Cron, day: number, dow: number) =>
  c.domStar || c.dowStar ? c.dom.has(day) && c.dow.has(dow) : c.dom.has(day) || c.dow.has(dow)
// Parse the cron once, then advance day by day (calendar arithmetic) and only materialize the
// candidate times on a day that matches. A no-near-match cron (Feb 29) skips ~500 days instead of
// stepping ~527k minutes through the timezone formatter.
export function nextRun(cron: string, from = new Date()): string | undefined {
  const c = parseCron(cron)
  const start = Math.ceil(from.getTime() / MINUTE_MS) * MINUTE_MS
  const seed = localParts(new Date(start))
  let dayMs = Date.UTC(seed.year, seed.month - 1, seed.day)
  for (let i = 0; i < SEARCH_DAYS; i++, dayMs += DAY_MS) {
    const day = new Date(dayMs)
    const year = day.getUTCFullYear(), month = day.getUTCMonth() + 1, dom = day.getUTCDate()
    if (!c.mon.has(month) || !dowMatches(c, dom, day.getUTCDay())) continue
    let best: number | undefined
    for (const hour of c.hour) for (const minute of c.min)
      for (const instant of localInstants({ year, month, day: dom, hour, minute })) {
        const ms = instant.getTime()
        if (ms >= start && (best === undefined || ms < best)) best = ms
      }
    if (best !== undefined) return new Date(best).toISOString()
  }
  return undefined
}

// ---- routine state / history ---------------------------------------------------------------
const stateFile = (slug: string) => path.join(BOTS_DIR, slug, "routines-state.json")
const historyFile = (slug: string) => path.join(BOTS_DIR, slug, "routines-history.jsonl")
const readJson = (f: string, d: any) => { try { return JSON.parse(readFileSync(f, "utf8")) } catch { return d } }
export function history(slug: string, limit = 100) {
  if (!existsSync(historyFile(slug))) return []
  return readFileSync(historyFile(slug), "utf8").trim().split("\n").filter(Boolean).slice(-limit).map((l) => JSON.parse(l)).reverse()
}
function record(slug: string, e: Record<string, unknown>) { mkdirSync(path.join(BOTS_DIR, slug), { recursive: true }); appendFileSync(historyFile(slug), JSON.stringify({ at: new Date().toISOString(), ...e }) + "\n") }
export function fire(bot: Bot, r: Routine, manual: boolean) {
  const msg = inboxPost({ from: "routine", to: bot.slug, message: r.prompt, priority: true, kind: "routine" as any, routine: { id: r.id, name: r.name }, manual } as any)
  record(bot.slug, { routine: r.id, name: r.name, event: "fired", manual, msg: msg.id })
  return msg
}
function tick() {
  const now = new Date(); const minuteKey = now.toISOString().slice(0, 16)
  for (const bot of listBots()) {
    const st = readJson(stateFile(bot.slug), {})
    let changed = false
    for (const r of bot.routines ?? []) {
      if (!r.enabled) continue
      try { if (!cronMatches(r.cron, now) || st[r.id] === minuteKey) continue } catch { continue }
      st[r.id] = minuteKey; changed = true; fire(bot, r, false)
    }
    if (changed) writeFileSync(stateFile(bot.slug), JSON.stringify(st))
  }
}

// ---- builder (DeepSeek drafts a bot) -------------------------------------------------------
async function deepseekKey() {
  if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY
  return (await resolveVault(["DEEPSEEK_API_KEY"])).get("DEEPSEEK_API_KEY")
}
export async function draftBot(description: string) {
  const key = await deepseekKey(); if (!key) throw new Error("DEEPSEEK_API_KEY isn't in the vault or environment")
  const system = `You design AI teammate bots for Ali Dillard (Aporia Nous, AI phone/text agents and automations for local businesses). Given a plain-words job description, return ONLY JSON: {"name": short title-case name, "avatar": one emoji, "role": one sentence (<=200 chars), "instructions": detailed second-person instructions (goals, steps, rules, what needs Ali's OK before anything is sent externally), "skills": [skill folder names if obvious, else []], "tools": [suggested tools/connectors e.g. "gmail","google-drive","web-search","browser","votel"], "routines": [{"name":..., "cron": 5-field cron in America/Chicago, "prompt": what to do each run}] }. Routines are suggestions; keep 0-3.`
  let lastErr = ""
  for (const model of ["deepseek-flash", "deepseek-chat"]) {
    const res = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, temperature: 0.4, response_format: { type: "json_object" }, messages: [{ role: "system", content: system }, { role: "user", content: description }] }),
    })
    if (!res.ok) { lastErr = `DeepSeek ${res.status}: ${(await res.text()).slice(0, 160)}`; if (res.status === 400 || res.status === 404) continue; throw new Error(lastErr) }
    const j: any = await res.json()
    const d = JSON.parse(j.choices?.[0]?.message?.content ?? "{}")
    return {
      name: String(d.name ?? ""), avatar: String(d.avatar ?? ""), role: String(d.role ?? ""), instructions: String(d.instructions ?? ""),
      skills: Array.isArray(d.skills) ? d.skills.map(String) : [], tools: Array.isArray(d.tools) ? d.tools.map(String) : [],
      routines: (Array.isArray(d.routines) ? d.routines : []).map((r: any, i: number) => ({ id: `r${Date.now()}${i}`, name: String(r.name ?? "Routine"), cron: String(r.cron ?? "0 9 * * 1-5"), prompt: String(r.prompt ?? ""), enabled: false })),
      model: "deepseek/deepseek-flash", folder: "Teammates", draftedWith: model,
    }
  }
  throw new Error(lastErr || "DeepSeek draft failed")
}

// ---- templates -----------------------------------------------------------------------------
export function toTemplate(bot: Bot) {
  // Shareable: NO chats, sessions, memory, or secrets.
  return { format: "aporia-bot", version: 1, exportedAt: new Date().toISOString(), name: bot.name, avatar: bot.avatar, role: bot.role, instructions: bot.instructions, model: bot.model, skills: bot.skills, tools: bot.tools, mcps: bot.mcps, voice: bot.voice, routines: (bot.routines ?? []).map(({ name, cron, prompt }) => ({ name, cron, prompt })) }
}
export function fromTemplate(t: any) {
  if (t?.format !== "aporia-bot") throw new Error("Not an .aporia-bot.json template")
  let name = String(t.name || "Imported bot"); let n = 2
  while (getBot(slugify(name))) name = `${String(t.name)} ${n++}`
  return saveBot({ name, avatar: t.avatar, role: String(t.role ?? ""), instructions: String(t.instructions ?? ""), model: String(t.model || "deepseek/deepseek-flash"), skills: t.skills ?? [], tools: t.tools ?? [], mcps: t.mcps ?? [], voice: t.voice, folder: "Imported",
    routines: (t.routines ?? []).map((r: any, i: number) => ({ id: `r${Date.now()}${i}`, name: String(r.name), cron: String(r.cron), prompt: String(r.prompt), enabled: false })) })
}

// ---- reactions -----------------------------------------------------------------------------
const reactFile = (slug: string) => path.join(BOTS_DIR, slug, "reactions.jsonl")
export function reactions(slug: string) {
  if (!existsSync(reactFile(slug))) return []
  return readFileSync(reactFile(slug), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l))
}
export function addReaction(slug: string, r: { by: "ali" | "bot"; emoji: string; messageID?: string; sessionID?: string; excerpt?: string }) {
  mkdirSync(path.join(BOTS_DIR, slug), { recursive: true })
  const e = { at: new Date().toISOString(), ...r, emoji: String(r.emoji).slice(0, 8) }
  appendFileSync(reactFile(slug), JSON.stringify(e) + "\n"); return e
}

export function registerAporiaRoutinesHandler() {
  setInterval(() => { try { tick() } catch (e) { aporiaLog.error("aporia routines tick failed", e instanceof Error ? (e.stack ?? e.message) : String(e)) } }, 30_000)
  ipcMain.handle("aporia:routines", async (event, input: any) => {
    // `slug` reaches path.join for every per-bot file below, so it is validated at the boundary.
    const slug = input?.slug === undefined || input?.slug === "" ? "" : safeSlug(input.slug, "bot slug")
    switch (input?.op) {
      case "history": return history(slug)
      case "next": try { return nextRun(String(input.cron)) ?? null } catch (e) { return { error: (e as Error).message } }
      case "runNow": {
        const bot = getBot(slug); const r = bot?.routines.find((x) => x.id === input.id); if (!bot || !r) throw new Error("No such routine")
        return fire(bot, r, true)
      }
      case "result": record(slug, { routine: input.routine, name: input.name, event: input.error ? "failed" : "done", sessionID: input.sessionID, excerpt: String(input.excerpt ?? "").slice(0, 400), error: input.error }); return true
      case "draft": return draftBot(String(input.description ?? ""))
      case "export": {
        const bot = getBot(slug); if (!bot) throw new Error("No such bot")
        // The destination always comes from the OS save dialog, never from the renderer — a caller
        // cannot point this at an arbitrary path to overwrite a file.
        const win = BrowserWindow.fromWebContents(event.sender) ?? undefined
        const target = (await dialog.showSaveDialog(win!, { defaultPath: `${bot.slug}.aporia-bot.json`, filters: [{ name: "Aporetic bot", extensions: ["json"] }] })).filePath
        if (!target) return null
        writeFileSync(target, JSON.stringify(toTemplate(bot), null, 2)); return target
      }
      case "import": {
        // Source always comes from the OS open dialog, never from the renderer (arbitrary read guard).
        const win = BrowserWindow.fromWebContents(event.sender) ?? undefined
        const picked = await dialog.showOpenDialog(win!, { filters: [{ name: "Aporetic bot", extensions: ["json"] }], properties: ["openFile"] })
        const file = picked.filePaths[0]
        if (!file) return null
        return fromTemplate(JSON.parse(readFileSync(file, "utf8")))
      }
      case "reactions": return reactions(slug)
      case "react": return addReaction(slug, input.reaction)
    }
    throw new Error("Unknown routines op")
  })
}
