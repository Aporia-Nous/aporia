import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import WebSocket from "ws"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, "screenshots-2026-10-18")
const outShot = path.join(outDir, process.argv[2] || "19-before-message-visibility.png")

const list = await fetch("http://127.0.0.1:9222/json/list").then((r) => r.json())
const page =
  list.find((p) => p.type === "page" && (p.url || "").includes("5173")) ??
  list.find((p) => p.type === "page") ??
  list[0]
if (!page?.webSocketDebuggerUrl) {
  console.error("No CDP page", JSON.stringify(list).slice(0, 400))
  process.exit(1)
}
console.log("page", page.title, page.url)

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

const probeExpr = `(() => {
  const rect = (el) => {
    if (!el) return null
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    return {
      w: Math.round(r.width),
      h: Math.round(r.height),
      top: Math.round(r.top),
      left: Math.round(r.left),
      display: cs.display,
      visibility: cs.visibility,
      opacity: cs.opacity,
      overflow: cs.overflow + "/" + cs.overflowY,
      flex: cs.flex,
      minH: cs.minHeight,
      color: cs.color,
      bg: cs.backgroundColor,
    }
  }
  const shell = document.querySelector('[data-component="an-shell"]')
  const stream = document.querySelector(".an-stream")
  const cards = document.querySelector(".an-stream-cards")
  const legacy = document.querySelector(".an-stream-legacy")
  const slot = document.querySelector(".an-stream-slot")
  const panel = document.querySelector('[data-an-part="session-panel-frame"]')
  const composer = document.querySelector('[data-component="prompt-input"], [data-component="dock-prompt"], textarea, [contenteditable="true"]')
  const userMsgs = [...document.querySelectorAll('[data-slot="user-message-text"], [data-component="user-message"], [data-role="user"]')]
  const msgParts = [...document.querySelectorAll('[data-slot="message-part"], [data-component="message"]')]
  const timeline = document.querySelector('[data-component="message-timeline"], [data-slot="session-timeline"], [data-component="session-messages"]')
  const virtualizer = document.querySelector('[data-component="virtualizer"], [data-slot="virtual-list"]')
  const scrollers = [...document.querySelectorAll(".an-stream-legacy *, .an-stream-slot *")].filter((el) => {
    const cs = getComputedStyle(el)
    return (cs.overflowY === "auto" || cs.overflowY === "scroll") && el.scrollHeight > 0
  }).slice(0, 8).map((el) => ({
    tag: el.tagName,
    cls: (el.className || "").toString().slice(0, 80),
    slot: el.getAttribute("data-slot") || el.getAttribute("data-component"),
    scrollH: el.scrollHeight,
    clientH: el.clientHeight,
    scrollTop: el.scrollTop,
    rect: rect(el),
  }))
  const textSample = (el) => ((el?.textContent || "").trim().slice(0, 120) || null)
  return {
    hasShell: !!shell,
    shellMode: shell?.getAttribute("data-mode") ?? null,
    stream: rect(stream),
    cards: { ...rect(cards), childCount: cards?.children?.length ?? 0, text: textSample(cards) },
    legacy: rect(legacy),
    slot: rect(slot),
    panel: rect(panel),
    composer: { ...rect(composer), placeholder: composer?.getAttribute?.("placeholder") || composer?.dataset?.placeholder || null, tag: composer?.tagName },
    userMsgCount: userMsgs.length,
    userMsgs: userMsgs.slice(0, 5).map((el) => ({ text: textSample(el), rect: rect(el) })),
    msgPartCount: msgParts.length,
    msgParts: msgParts.slice(0, 5).map((el) => ({ text: textSample(el), rect: rect(el), slot: el.getAttribute("data-slot") || el.getAttribute("data-component") })),
    timeline: rect(timeline),
    virtualizer: rect(virtualizer),
    scrollers,
    bodyTextHasAsk: /Ask anything/.test(document.body.innerText || ""),
  }
})()`

let value = null
for (let i = 0; i < 20; i++) {
  const evalRes = await send("Runtime.evaluate", { expression: probeExpr, returnByValue: true })
  value = evalRes.result?.result?.value ?? null
  console.log("probe", i, JSON.stringify(value, null, 2))
  if (value?.hasShell) break
  await new Promise((r) => setTimeout(r, 500))
}

if (!value?.hasShell) {
  console.error("AnShell not ready")
  process.exit(2)
}

const shot = await send("Page.captureScreenshot", { format: "png", fromSurface: true })
const b64 = shot.result?.data
if (!b64) {
  console.error("No screenshot data", JSON.stringify(shot).slice(0, 300))
  process.exit(3)
}
fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(outShot, Buffer.from(b64, "base64"))
console.log("wrote", outShot)
ws.close()
