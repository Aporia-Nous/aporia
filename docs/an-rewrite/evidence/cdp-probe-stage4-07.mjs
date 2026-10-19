import WebSocket from "ws"

const list = await fetch("http://127.0.0.1:9222/json/list").then((r) => r.json())
const page = list.find((p) => p.type === "page") ?? list[0]
if (!page?.webSocketDebuggerUrl) {
  console.error("No CDP page")
  process.exit(1)
}

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

await send("Page.enable")
await send("Runtime.enable")
await send("Page.reload", { ignoreCache: true })
await new Promise((r) => setTimeout(r, 4500))

const expression = `(() => {
  const shell = document.querySelector('[data-component="an-shell"]')
  const cards = [...document.querySelectorAll('[data-component="an-card"]')].map((el) => ({
    type: el.getAttribute("data-type"),
    title: el.querySelector(".an-card-title")?.textContent?.trim(),
    source: el.getAttribute("data-source"),
  }))
  const navSvgs = document.querySelectorAll(".an-nav-icon").length
  const tools = document.querySelectorAll(".tool-collapsible, [data-an-part='tool']").length
  const selected = document.querySelector('.an-roster-member[data-selected="true"]')
  const selectedBorder = selected ? getComputedStyle(selected).borderColor : null
  return {
    hasShell: !!shell,
    mode: shell?.getAttribute("data-mode") ?? null,
    cardCount: cards.length,
    cards,
    hasStreamCards: !!document.querySelector('[data-component="an-stream-cards"]'),
    navSvgCount: navSvgs,
    toolPartCount: tools,
    selectedBorder,
    pills: [...document.querySelectorAll(".an-pill")].map((p) => p.textContent.trim()),
  }
})()`

const evalRes = await send("Runtime.evaluate", { expression, returnByValue: true })
const value = evalRes.result?.result?.value ?? evalRes.result ?? evalRes
console.log(JSON.stringify(value, null, 2))
ws.close()
