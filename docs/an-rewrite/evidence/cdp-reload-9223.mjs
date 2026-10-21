import WebSocket from "ws"

const CDP_PORT = process.env.APORETIC_CDP_PORT || "9223"
const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json()
const page = list.find((t) => t.type === "page" && /5173|Aporetic/i.test(`${t.url}${t.title}`))
if (!page) throw new Error("no Aporetic page on CDP")

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

await send("Page.enable")
await send("Page.reload", { ignoreCache: true })
await new Promise((r) => setTimeout(r, 5000))
const check = await send("Runtime.evaluate", {
  expression: `({
    shell: !!document.querySelector('[data-component="an-shell"]'),
    composer: !!document.querySelector('[data-an-owned="composer"]'),
    href: location.href,
  })`,
  returnByValue: true,
})
console.log("reload", JSON.stringify(check.result?.result?.value ?? check))
ws.close()
process.exit(0)
