// APORIA: memory MCP (stdio, no deps). Tools: remember / forget / recall.
// Scopes: "user" -> %USERPROFILE%\Aporia\memory\USER.md (shared, facts about Ali)
//         "bot"  -> %USERPROFILE%\Aporia\bots\<bot>\MEMORY.md (how that bot does its job)
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, copyFileSync } from "node:fs"
import { createHash } from "node:crypto"
import path from "node:path"
import os from "node:os"
const ROOT = process.env.APORIA_HOME || path.join(os.homedir(), "Aporia")
const userFile = () => path.join(ROOT, "memory", "USER.md")
const botFile = (slug) => {
  if (!/^[a-z0-9-]{1,48}$/.test(slug || "")) throw new Error("bot must be a bot slug like rep-recruiter")
  return path.join(ROOT, "bots", slug, "MEMORY.md")
}
const fileFor = (scope, bot) => (scope === "user" ? userFile() : botFile(bot))
const read = (f) => (existsSync(f) ? readFileSync(f, "utf8") : "")
const facts = (f) => read(f).split(/\r?\n/).filter((l) => l.startsWith("- "))
const norm = (s) => s.toLowerCase().replace(/^- (\[\d{4}-\d{2}-\d{2}\] )?/, "").replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim()
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" })

// ---- shared context store (the APORIA_HOME\context\entries.jsonl the app reads) -----------------
// The one hard rule: a finding may only be written WITH a real source. Model output can never be
// stored as a "fact". The id matches aporia-context.ts entryId so nothing is ever duplicated.
const contextFile = () => path.join(ROOT, "context", "entries.jsonl")
function rememberFinding({ topic, text, source, tags }) {
  const body = String(text ?? "").trim()
  if (!body) throw new Error("text is required (the finding)")
  const ref = String(source ?? "").trim()
  if (!ref) throw new Error("source is required — a finding must come from somewhere real (a url or file path)")
  const t = String(topic ?? "").trim() || "general"
  const kind = /^https?:\/\//i.test(ref) ? "url" : "file"
  const input = { topic: t, tags: Array.isArray(tags) ? tags.map(String) : [], text: body, source: { kind, ref } }
  const id = createHash("sha256").update(`${input.source.ref}\n${input.topic}\n${input.text}`).digest("hex")
  const f = contextFile()
  mkdirSync(path.dirname(f), { recursive: true })
  if (existsSync(f)) {
    for (const line of read(f).split("\n")) {
      if (!line.trim()) continue
      try { if (JSON.parse(line).id === id) return `Already stored [${id}].` } catch { /* skip a corrupt line */ }
    }
  }
  appendFileSync(f, JSON.stringify({ ...input, id, created: Date.now() }) + "\n")
  return `Stored finding [${id}] on "${t}" from ${ref}. Cite [${id}] if you use it.`
}

function remember({ scope, bot, fact }) {
  if (!fact || !String(fact).trim()) throw new Error("fact is required")
  const f = fileFor(scope, bot); mkdirSync(path.dirname(f), { recursive: true })
  const line = `- [${today()}] ${String(fact).replace(/\s+/g, " ").trim()}`
  if (facts(f).some((l) => norm(l) === norm(line))) return `Already saved in ${scope} memory.`
  if (!existsSync(f)) writeFileSync(f, scope === "user" ? "# Shared memory: facts about Ali\n\n" : `# ${bot} memory\n\n`)
  appendFileSync(f, line + "\n")
  return `Saved to ${scope} memory: ${line}`
}
function forget({ scope, bot, match }) {
  if (!match || String(match).trim().length < 4) throw new Error("match must be at least 4 characters")
  const f = fileFor(scope, bot); if (!existsSync(f)) return "Nothing to forget."
  const m = String(match).toLowerCase()
  const lines = read(f).split(/\r?\n/)
  const removed = lines.filter((l) => l.startsWith("- ") && l.toLowerCase().includes(m))
  if (!removed.length) return "No fact matched."
  if (removed.length > 5) return `Matched ${removed.length} facts; be more specific.`
  copyFileSync(f, f + ".bak")
  writeFileSync(f, lines.filter((l) => !removed.includes(l)).join("\n"))
  return `Forgot ${removed.length}:\n${removed.join("\n")}`
}
function recall({ query, bot, limit }) {
  const sources = [["user", userFile()]]
  if (bot) sources.push(["bot", botFile(bot)])
  const words = String(query || "").toLowerCase().split(/\s+/).filter((w) => w.length > 2)
  const out = []
  for (const [scope, f] of sources) for (const l of facts(f)) {
    const score = words.length ? words.filter((w) => l.toLowerCase().includes(w)).length : 1
    if (score > 0) out.push({ scope, l, score })
  }
  out.sort((a, b) => b.score - a.score)
  const n = Math.min(Number(limit) || 40, 200)
  return out.length ? out.slice(0, n).map((o) => `(${o.scope}) ${o.l.slice(2)}`).join("\n") : "No matching facts."
}
function listBots() {
  const dir = path.join(ROOT, "bots"); if (!existsSync(dir)) return "No bots."
  return readdirSync(dir).filter((d) => existsSync(path.join(dir, d, "bot.json"))).map((d) => {
    try { const b = JSON.parse(readFileSync(path.join(dir, d, "bot.json"), "utf8")); return `${d}: ${b.name} - ${b.role ?? ""}` } catch { return d }
  }).join("\n")
}

// ---- bot-to-bot messaging: drop into %APORIA_HOME%\inbox; the Aporia app delivers it and runs the target's turn.
function sendToBot({ from, target, message, priority, response }) {
  if (!message || !String(message).trim()) throw new Error("message is required")
  const t = String(target || "").trim()
  const isRoom = t.startsWith("room:")
  const slug = isRoom ? t.slice(5) : t
  if (!/^[a-z0-9-]{1,48}$/.test(slug)) throw new Error("target must be a bot slug (see list_bots) or room:<slug>")
  if (!isRoom && !existsSync(path.join(ROOT, "bots", slug, "bot.json"))) throw new Error(`No bot ${slug}. Use list_bots.`)
  if (isRoom && !existsSync(path.join(ROOT, "rooms", slug, "room.json"))) throw new Error(`No room ${slug}.`)
  if (response !== undefined && response !== "required" && response !== "none") throw new Error("response must be 'required' or 'none'")
  const dir = path.join(ROOT, "inbox"); mkdirSync(dir, { recursive: true })
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const msg = { id, from: String(from || "unknown"), to: isRoom ? undefined : slug, room: isRoom ? slug : undefined, message: String(message), priority: !!priority, kind: "message", created: new Date().toISOString(), ...(response ? { response } : {}) }
  writeFileSync(path.join(dir, id + ".json"), JSON.stringify(msg, null, 2))
  if (response === "none") return `Filed for ${t}. No reply is expected, so it is not waking them; they read it on their next turn.`
  return `Queued for ${t}${priority ? " (priority: it wakes now)" : " (delivered when it is idle, within a few minutes)"}. The reply comes back to you as a new message; don't wait for it.`
}
function react({ bot, emoji }) {
  if (!/^[a-z0-9-]{1,48}$/.test(bot || "")) throw new Error("bot must be your bot slug")
  const e = String(emoji || "").trim(); if (!e || e.length > 8) throw new Error("one emoji")
  const f = path.join(ROOT, "bots", bot, "reactions.jsonl"); mkdirSync(path.dirname(f), { recursive: true })
  appendFileSync(f, JSON.stringify({ at: new Date().toISOString(), by: "bot", emoji: e }) + "\n")
  return `Reacted ${e} to Ali's latest message. Don't also reply unless an answer is needed.`
}
const scopeProp = { type: "string", enum: ["user", "bot"], description: "user = shared facts about Ali (USER.md); bot = your own job memory (MEMORY.md)" }
const botProp = { type: "string", description: "Your bot slug (from your instructions), e.g. rep-recruiter" }
const TOOLS = [
  { name: "remember", description: "Save one self-contained lasting fact (dedupes, adds the date).", inputSchema: { type: "object", properties: { scope: scopeProp, bot: botProp, fact: { type: "string" } }, required: ["scope", "fact"] }, run: remember },
  { name: "forget", description: "Remove facts containing the given text (use when Ali corrects something, then remember the new fact).", inputSchema: { type: "object", properties: { scope: scopeProp, bot: botProp, match: { type: "string" } }, required: ["scope", "match"] }, run: forget },
  { name: "recall", description: "Search shared and your own memory. Empty query lists everything.", inputSchema: { type: "object", properties: { query: { type: "string" }, bot: botProp, limit: { type: "number" } } }, run: recall },
  { name: "remember_finding", description: "Save a sourced finding to the shared context store (topic, text, source). The source is REQUIRED — the url or file path you got it from; a finding with no real source is rejected. Use it when you research something so the team can reuse it.", inputSchema: { type: "object", properties: { topic: { type: "string", description: "the topic this finding belongs to" }, text: { type: "string", description: "the finding itself" }, source: { type: "string", description: "where it came from: a url or file path" }, tags: { type: "array", items: { type: "string" } } }, required: ["text", "source"] }, run: rememberFinding },
  { name: "send_to_bot", description: "Send an async message to another Aporia bot (or room:<slug>). Returns immediately; you read the answer on your next turn. Set response:'none' when the message needs no answer (an update, a heads-up, a closing note) — it is then held and read on the target's next turn instead of waking a turn of its own. Set response:'required' only when you are blocked waiting on this one answer: it then wakes you the moment it arrives. Leave it out to send a question whose answer you can read later (cheapest for a message sent to several bots).", inputSchema: { type: "object", properties: { from: { type: "string", description: "Your own bot slug" }, target: { type: "string", description: "Target bot slug or room:<slug>" }, message: { type: "string" }, response: { type: "string", enum: ["required", "none"], description: "required = you are blocked on this answer, so it wakes you. none = no answer needed; held and read on their next turn. Omit = an answer you will read on your next turn." }, priority: { type: "boolean", description: "true wakes the target now; false waits until it is idle" } }, required: ["from", "target", "message"] }, run: sendToBot },
  { name: "react", description: "Put one emoji reaction on Ali's latest message in your chat (instead of a reply to thanks/acknowledgements). Max one per message.", inputSchema: { type: "object", properties: { bot: botProp, emoji: { type: "string" } }, required: ["bot", "emoji"] }, run: react },
  { name: "list_bots", description: "List Aporia teammate bots (slug: name - role).", inputSchema: { type: "object", properties: {} }, run: listBots },
]
const send = (m) => process.stdout.write(JSON.stringify(m) + "\n")
let buf = ""
process.stdin.setEncoding("utf8")
process.stdin.on("data", (chunk) => {
  buf += chunk; let i
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!line) continue
    let msg; try { msg = JSON.parse(line) } catch { continue }
    if (msg.id === undefined) continue
    try {
      if (msg.method === "initialize") send({ jsonrpc: "2.0", id: msg.id, result: { protocolVersion: msg.params?.protocolVersion ?? "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "aporia-memory", version: "1.0.0" } } })
      else if (msg.method === "tools/list") send({ jsonrpc: "2.0", id: msg.id, result: { tools: TOOLS.map(({ run, ...t }) => t) } })
      else if (msg.method === "tools/call") {
        const t = TOOLS.find((x) => x.name === msg.params?.name); if (!t) throw new Error("unknown tool")
        send({ jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "text", text: String(t.run(msg.params.arguments ?? {})) }] } })
      } else if (msg.method === "ping") send({ jsonrpc: "2.0", id: msg.id, result: {} })
      else send({ jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: "method not found" } })
    } catch (e) { send({ jsonrpc: "2.0", id: msg.id, result: { isError: true, content: [{ type: "text", text: String(e?.message ?? e) }] } }) }
  }
})
