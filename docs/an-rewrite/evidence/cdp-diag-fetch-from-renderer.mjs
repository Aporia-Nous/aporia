import WebSocket from "ws"

const list = await fetch("http://127.0.0.1:9222/json/list").then((r) => r.json())
const page = list.find((p) => p.type === "page")
const ws = new WebSocket(page.webSocketDebuggerUrl)
let id = 0
const pending = new Map()
function send(method, params = {}) {
  const mid = ++id
  return new Promise((res) => {
    pending.set(mid, { res })
    ws.send(JSON.stringify({ id: mid, method, params }))
  })
}
ws.on("message", (d) => {
  const m = JSON.parse(String(d))
  if (m.id && pending.has(m.id)) {
    pending.get(m.id).res(m)
    pending.delete(m.id)
  }
})
await new Promise((r, j) => {
  ws.on("open", r)
  ws.on("error", j)
})
await send("Runtime.enable")

const expr = `(() => Promise.all([
  fetch('http://127.0.0.1:9333/json/version').then(async (r) => ({ ok: r.ok, status: r.status, body: await r.text().then(t=>t.slice(0,120)) })).catch((e) => ({ fetchError: String(e) })),
  fetch('http://127.0.0.1:9333/json/list').then(async (r) => ({ ok: r.ok, status: r.status, count: (await r.json()).length })).catch((e) => ({ fetchError: String(e) })),
]))()`

const res = await send("Runtime.evaluate", {
  expression: expr,
  awaitPromise: true,
  returnByValue: true,
})
console.log(JSON.stringify(res.result?.result?.value ?? res.result ?? res, null, 2))
ws.close()
