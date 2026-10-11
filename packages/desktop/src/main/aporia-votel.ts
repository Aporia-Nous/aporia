// APORIA: read-only Votel bridge for the right-rail panel. Talks to the hosted Votel MCP endpoint
// with VOTEL_API_KEY from the main-process env (never sent to the renderer). Only list_/get_ tools
// without write verbs are callable here; anything that calls, spends, or publishes is refused.
import { ipcMain } from "electron"

const URL_ = (process.env.VOTEL_API_URL || "https://app.votel.ai").replace(/\/$/, "") + "/mcp"
const READ = /^(list|get|search|count)[_-]/i
const WRITE = /(create|update|delete|send|call|dial|publish|purchase|buy|charge|start|trigger|post|set|remove|add)/i
let session: string | undefined
let id = 0

const key = () => process.env.VOTEL_API_KEY || process.env.API_KEY

async function rpc(method: string, params?: unknown) {
  const k = key()
  if (!k) throw new Error("VOTEL_API_KEY is not set")
  const res = await fetch(URL_, {
    method: "POST",
    headers: {
      authorization: `Bearer ${k}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(session ? { "mcp-session-id": session } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
  })
  session = res.headers.get("mcp-session-id") ?? session
  if (!res.ok) throw new Error(`Votel ${res.status}`)
  const text = await res.text()
  const json = text.trim().startsWith("{")
    ? JSON.parse(text)
    : JSON.parse(text.split("\n").filter((l) => l.startsWith("data:")).pop()!.slice(5))
  if (json.error) throw new Error(json.error.message ?? "Votel error")
  return json.result
}

async function ready() {
  if (session) return
  await rpc("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "aporia", version: "1" } })
  await rpc("notifications/initialized").catch(() => undefined)
}

type Op = { op: "status" } | { op: "tools" } | { op: "call"; name: string }

export async function handleVotel(input: Op) {
  if (input.op === "status") return { configured: !!key() }
  await ready()
  const tools = ((await rpc("tools/list")).tools ?? []) as { name: string }[]
  const readable = tools.map((t) => t.name).filter((n) => READ.test(n) && !WRITE.test(n.replace(READ, "")))
  if (input.op === "tools") return readable
  if (!readable.includes(input.name)) throw new Error("Only read-only Votel tools are allowed here")
  const result = await rpc("tools/call", { name: input.name, arguments: {} })
  const text = (result.content ?? []).map((c: { text?: string }) => c.text ?? "").join("\n")
  return text.slice(0, 20000)
}

export function registerAporiaVotelHandler() {
  ipcMain.handle("aporia:votel", (_event, input: Op) => handleVotel(input))
}
