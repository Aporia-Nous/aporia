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
await new Promise((r) => setTimeout(r, 5000))

const expression = `(() => {
  const shell = document.querySelector('[data-component="an-shell"]')
  if (!shell) return { hasShell: false }
  const cs = getComputedStyle(shell)
  const card = document.querySelector('[data-component="an-card"]')
  const cardCs = card ? getComputedStyle(card) : null
  const dock = document.querySelector('[data-component="session-composer-dock"]')
  const composer = document.querySelector('[data-component="composer"]')
  const composerCs = composer ? getComputedStyle(composer) : null
  return {
    hasShell: true,
    mode: shell.getAttribute("data-mode"),
    blur: cs.getPropertyValue("--an-blur").trim(),
    blurStrong: cs.getPropertyValue("--an-blur-strong").trim(),
    ease: cs.getPropertyValue("--an-ease").trim(),
    easeRail: cs.getPropertyValue("--an-ease-rail").trim(),
    easeCard: cs.getPropertyValue("--an-ease-card").trim(),
    panel: cs.getPropertyValue("--an-panel").trim(),
    iceSheen: cs.getPropertyValue("--an-ice-sheen").trim(),
    iceEdge: cs.getPropertyValue("--an-ice-edge").trim(),
    gold: cs.getPropertyValue("--an-gold").trim(),
    void: cs.getPropertyValue("--an-void").trim(),
    cardBackdrop: cardCs?.backdropFilter || cardCs?.webkitBackdropFilter || null,
    cardAnimation: cardCs?.animationName || null,
    dockBg: dock ? getComputedStyle(dock).backgroundColor : null,
    composerBg: composerCs?.backgroundColor || null,
    cards: [...document.querySelectorAll('[data-component="an-card"]')].map((el) => el.getAttribute("data-type")),
  }
})()`

const evalRes = await send("Runtime.evaluate", { expression, returnByValue: true })
const value = evalRes.result?.result?.value ?? evalRes.result ?? evalRes
console.log(JSON.stringify(value, null, 2))
ws.close()
