import WebSocket from "ws"

const list = await fetch("http://127.0.0.1:9222/json/list").then((r) => r.json())
const page = list.find((p) => p.type === "page") ?? list[0]
const ws = new WebSocket(page.webSocketDebuggerUrl)
let id = 0
const pending = new Map()
ws.on("message", (data) => {
  const msg = JSON.parse(String(data))
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id).resolve(msg)
    pending.delete(msg.id)
  }
})
function send(method, params = {}) {
  const msgId = ++id
  return new Promise((resolve) => {
    pending.set(msgId, { resolve })
    ws.send(JSON.stringify({ id: msgId, method, params }))
  })
}
await new Promise((r, j) => {
  ws.on("open", r)
  ws.on("error", j)
})
await send("Page.enable")
await send("Page.reload", { ignoreCache: true })
await new Promise((r) => setTimeout(r, 6000))
const res = await send("Runtime.evaluate", {
  expression: `({
    components: [...document.querySelectorAll('[data-component]')].map((e) => e.getAttribute('data-component')).slice(0, 25),
    body: (document.body?.innerText || '').slice(0, 250),
    hasShell: !!document.querySelector('[data-component="an-shell"]'),
    url: location.href,
  })`,
  returnByValue: true,
})
console.log(JSON.stringify(res.result?.result?.value ?? res, null, 2))
ws.close()
