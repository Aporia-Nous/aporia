/**
 * AP-STAGE4-09 — inject Session/composer dock ice-glass CSS into running Electron CDP,
 * probe computed styles, capture shot 13. Does not mutate other worktrees / no merge.
 *
 * Honest note: live DEV may still serve STAGE4-08 tip from cursor-aporetic-stage4;
 * this inject previews dock CSS committed only on stage4-dock-glass.
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import WebSocket from "ws"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, "../../..")
const cssPath = path.join(root, "packages/app/src/shell/an/an-shell.css")
const outShot = path.join(__dirname, "screenshots-2026-10-18/13-session-dock-glass.png")

const fullCss = fs.readFileSync(cssPath, "utf8")
const marker = "/* AP-STAGE4-09:"
const start = fullCss.indexOf(marker)
if (start < 0) {
  console.error("AP-STAGE4-09 CSS marker not found")
  process.exit(1)
}
const reduced = fullCss.indexOf("@media (prefers-reduced-motion: reduce)", start)
const dockCss = fullCss.slice(start, reduced > start ? reduced : undefined)

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

const injectExpr = `(() => {
  const id = "ap-stage4-09-dock-inject"
  let s = document.getElementById(id)
  if (!s) {
    s = document.createElement("style")
    s.id = id
    document.documentElement.appendChild(s)
  }
  s.textContent = ${JSON.stringify(dockCss)}
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
    injected: true,
    panelBg: panelCs?.backgroundImage || panelCs?.backgroundColor || null,
    panelBlur: panelCs?.backdropFilter || panelCs?.webkitBackdropFilter || null,
    panelRadius: panelCs?.borderRadius || null,
    panelAnim: panelCs?.animationName || null,
    dockBg: dockCs?.backgroundImage || dockCs?.backgroundColor || null,
    composerBg: composerCs?.backgroundImage || composerCs?.backgroundColor || null,
    composerBorder: composerCs?.borderColor || null,
    easeDock: shell ? getComputedStyle(shell).getPropertyValue("--an-ease-dock").trim() : null,
    gold: shell ? getComputedStyle(shell).getPropertyValue("--an-gold").trim() : null,
    void: shell ? getComputedStyle(shell).getPropertyValue("--an-void").trim() : null,
  }
})()`

const evalRes = await send("Runtime.evaluate", { expression: injectExpr, returnByValue: true })
const value = evalRes.result?.result?.value ?? evalRes.result ?? evalRes
console.log(JSON.stringify(value, null, 2))

await new Promise((r) => setTimeout(r, 400))

const shot = await send("Page.captureScreenshot", { format: "png", fromSurface: true })
const data = shot.result?.data ?? shot.data
if (!data) {
  console.error("No screenshot data", JSON.stringify(shot).slice(0, 400))
  process.exit(1)
}
fs.mkdirSync(path.dirname(outShot), { recursive: true })
fs.writeFileSync(outShot, Buffer.from(data, "base64"))
console.log("wrote", outShot)

ws.close()
