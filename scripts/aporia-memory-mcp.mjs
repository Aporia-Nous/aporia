// APORIA: memory MCP (stdio, no deps). Tools: remember / forget / recall.
// Scopes: "user" -> %USERPROFILE%\Aporia\memory\USER.md (shared, facts about Ali)
//         "bot"  -> %USERPROFILE%\Aporia\bots\<bot>\MEMORY.md (how that bot does its job)
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, copyFileSync } from "node:fs"
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
const scopeProp = { type: "string", enum: ["user", "bot"], description: "user = shared facts about Ali (USER.md); bot = your own job memory (MEMORY.md)" }
const botProp = { type: "string", description: "Your bot slug (from your instructions), e.g. rep-recruiter" }
const TOOLS = [
  { name: "remember", description: "Save one self-contained lasting fact (dedupes, adds the date).", inputSchema: { type: "object", properties: { scope: scopeProp, bot: botProp, fact: { type: "string" } }, required: ["scope", "fact"] }, run: remember },
  { name: "forget", description: "Remove facts containing the given text (use when Ali corrects something, then remember the new fact).", inputSchema: { type: "object", properties: { scope: scopeProp, bot: botProp, match: { type: "string" } }, required: ["scope", "match"] }, run: forget },
  { name: "recall", description: "Search shared and your own memory. Empty query lists everything.", inputSchema: { type: "object", properties: { query: { type: "string" }, bot: botProp, limit: { type: "number" } } }, run: recall },
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
