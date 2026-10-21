import WebSocket from "ws"

const list = await fetch("http://127.0.0.1:9222/json/list").then((r) => r.json())
const page = list.find((p) => p.type === "page") ?? list[0]
const ws = new WebSocket(page.webSocketDebuggerUrl)
let id = 0
const pending = new Map()

function send(method, params = {}) {
  const msgId = ++id
  return new Promise((resolve, reject) => {
    pending.set(msgId, { resolve, reject })
    ws.send(JSON.stringify({ id: msgId, method, params }))
  })
}

ws.on("message", (data) => {
  const msg = JSON.parse(String(data))
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id).resolve(msg)
    pending.delete(msg.id)
  }
})

await new Promise((resolve, reject) => {
  ws.on("open", resolve)
  ws.on("error", reject)
})

await send("Runtime.enable")

const expression = `(() => ({
  href: location.href,
  hasShell: !!document.querySelector('[data-component="an-shell"]'),
  rootKids: document.querySelector('#root')?.childElementCount ?? -1,
  bodyText: (document.body?.innerText || '').slice(0, 160),
  cards: [...document.querySelectorAll('[data-component="an-card"]')].map((el) => el.getAttribute('data-type')),
  navSvgCount: document.querySelectorAll('.an-nav-icon').length,
  mode: document.querySelector('[data-component="an-shell"]')?.getAttribute('data-mode') ?? null,
}))()`

for (let i = 0; i < 12; i++) {
  await new Promise((r) => setTimeout(r, 1500))
  const evalRes = await send("Runtime.evaluate", { expression, returnByValue: true })
  const value = evalRes.result?.result?.value
  console.log(JSON.stringify(value))
  if (value?.hasShell) break
}

ws.close()
