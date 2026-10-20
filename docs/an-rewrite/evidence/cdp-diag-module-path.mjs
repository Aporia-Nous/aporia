import WebSocket from "ws"

const CDP_PORT = process.env.APORETIC_CDP_PORT || "9223"
const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json()
const page = list.find((t) => t.type === "page")
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((res, rej) => {
  ws.on("open", res)
  ws.on("error", rej)
})
let id = 0
const pending = new Map()
ws.on("message", (data) => {
  const msg = JSON.parse(String(data))
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg)
    pending.delete(msg.id)
  }
})
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const msgId = ++id
    pending.set(msgId, resolve)
    ws.send(JSON.stringify({ id: msgId, method, params }))
  })

await send("Network.enable")
const scripts = await send("Debugger.enable").catch(() => null)
const evaled = await send("Runtime.evaluate", {
  expression: `(() => {
    const entries = performance.getEntriesByType('resource')
      .map(e => e.name)
      .filter(n => /session-layout|session-draft|an-shell|composer\\/persistence/.test(n))
    return { entries: entries.slice(0, 20), origin: location.origin }
  })()`,
  returnByValue: true,
})
console.log(JSON.stringify(evaled.result?.result?.value ?? evaled, null, 2))

// Fetch vite module graph source for session-layout if present
const urlCandidates = [
  "http://localhost:5173/@fs/C:/Users/Dilla/.cursor/worktrees/opt/cursor-aporetic-stage4/packages/app/src/shell/an/session-layout.tsx",
  "http://localhost:5173/@fs/C:/Users/Dilla/.cursor/worktrees/opt/cursor-aporetic/packages/app/src/shell/an/session-layout.tsx",
]
for (const u of urlCandidates) {
  try {
    const res = await fetch(u)
    console.log(u, res.status, (await res.text()).slice(0, 120).replace(/\\n/g, " "))
  } catch (e) {
    console.log(u, "ERR", e.message)
  }
}

ws.close()
process.exit(0)
