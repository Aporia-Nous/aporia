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
  return new Promise((resolve, reject) => {
    pending.set(msgId, { resolve, reject })
    ws.send(JSON.stringify({ id: msgId, method, params }))
  })
}
await new Promise((r, j) => {
  ws.on("open", r)
  ws.on("error", j)
})
await send("Runtime.enable")
const expr = `({
  title: document.title,
  url: location.href,
  rootLen: (document.querySelector('#root')?.innerHTML || '').length,
  rootSlice: (document.querySelector('#root')?.innerHTML || '').slice(0, 400),
  components: [...document.querySelectorAll('[data-component]')].map((e) => e.getAttribute('data-component')).slice(0, 30),
  bodyText: (document.body?.innerText || '').slice(0, 300),
})`
const res = await send("Runtime.evaluate", { expression: expr, returnByValue: true })
console.log(JSON.stringify(res.result?.result?.value ?? res, null, 2))
const logs = await send("Runtime.evaluate", {
  expression: `(() => {
    const errs = []
    return { readyState: document.readyState }
  })()`,
  returnByValue: true,
})
console.log("ready", JSON.stringify(logs.result?.result?.value))
ws.close()
