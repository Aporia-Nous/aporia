import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import WebSocket from "ws"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outShot = path.join(__dirname, "screenshots-2026-10-18/14-dock-merged-dev.png")

const list = await fetch("http://127.0.0.1:9222/json/list").then((r) => r.json())
const page = list.find((p) => p.type === "page" && (p.url || "").includes("5173")) ?? list.find((p) => p.type === "page") ?? list[0]
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
  const inject = document.getElementById("ap-stage4-09-dock-inject")
  const shell = document.querySelector('[data-component="an-shell"]')
  const panel = document.querySelector('[data-slot="session-chat-panel"] > div')
    || document.querySelector('[data-an-part="session-panel-frame"]')
  const dock = document.querySelector('[data-component="session-composer-dock"]')
  const composer = document.querySelector('[data-component="composer"]')
  const panelCs = panel ? getComputedStyle(panel) : null
  const dockCs = dock ? getComputedStyle(dock) : null
  const composerCs = composer ? getComputedStyle(composer) : null
  return {
    hasShell: !!shell,
    mode: shell?.getAttribute("data-mode") ?? null,
    injectedStylePresent: !!inject,
    tipMarkerCss: !!document.querySelector('[data-component="an-shell"]') && getComputedStyle(document.documentElement).getPropertyValue("--an-ease-dock").trim() !== "",
    easeDock: shell ? getComputedStyle(shell).getPropertyValue("--an-ease-dock").trim() : null,
    gold: shell ? getComputedStyle(shell).getPropertyValue("--an-gold").trim() : null,
    void: shell ? getComputedStyle(shell).getPropertyValue("--an-void").trim() : null,
    panelBg: panelCs?.backgroundImage || panelCs?.backgroundColor || null,
    panelBlur: panelCs?.backdropFilter || panelCs?.webkitBackdropFilter || null,
    panelRadius: panelCs?.borderRadius || null,
    panelAnim: panelCs?.animationName || null,
    dockBg: dockCs?.backgroundImage || dockCs?.backgroundColor || null,
    composerBg: composerCs?.backgroundImage || composerCs?.backgroundColor || null,
    composerBorder: composerCs?.borderColor || null,
    hasDock: !!dock,
    hasComposer: !!composer,
  }
})()`

let value = null
for (let i = 0; i < 20; i++) {
  const evalRes = await send("Runtime.evaluate", { expression: probeExpr, returnByValue: true })
  value = evalRes.result?.result?.value ?? null
  console.log("probe", i, JSON.stringify(value))
  if (value?.hasShell && value?.hasDock) break
  await new Promise((r) => setTimeout(r, 1000))
}

if (!value?.hasShell) {
  console.error("AnShell not ready")
  process.exit(2)
}

await new Promise((r) => setTimeout(r, 500))
const shot = await send("Page.captureScreenshot", { format: "png", fromSurface: true })
const data = shot.result?.data ?? shot.data
if (!data) {
  console.error("No screenshot", JSON.stringify(shot).slice(0, 400))
  process.exit(3)
}
fs.mkdirSync(path.dirname(outShot), { recursive: true })
fs.writeFileSync(outShot, Buffer.from(data, "base64"))
console.log("wrote", outShot, "bytes", Buffer.from(data, "base64").length)
console.log("FINAL", JSON.stringify(value, null, 2))
ws.close()
