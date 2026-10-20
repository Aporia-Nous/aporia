import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import WebSocket from "ws"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outShot = path.join(__dirname, "screenshots-2026-10-18/18-computer-view-presence-merged-dev.png")

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
  const shell = document.querySelector('[data-component="an-shell"]')
  const modeBtns = [...document.querySelectorAll('.an-mode-btn')].map((b) => ({
    mode: b.getAttribute("data-mode"),
    label: (b.textContent || "").trim(),
    active: b.getAttribute("data-active"),
  }))
  const viewBtn = document.querySelector('.an-mode-btn[data-mode="view"]')
  const presenceDots = [...document.querySelectorAll(".an-presence")].map((el) => el.className)
  const presenceLabels = [...document.querySelectorAll(".an-roster-presence")].map((el) => ({
    text: (el.textContent || "").trim(),
    presence: el.getAttribute("data-presence"),
  }))
  const computer = document.querySelector(".an-computer")
  const computerTitle = computer?.querySelector(".an-computer-header strong")?.textContent?.trim() ?? null
  const computerBadge = computer?.querySelector(".an-computer-badge")?.textContent?.trim() ?? null
  const computerEmpty = computer?.querySelector(".an-computer-empty")?.textContent?.trim() ?? null
  return {
    hasShell: !!shell,
    shellMode: shell?.getAttribute("data-mode") ?? null,
    modeBtns,
    hasViewBtn: !!viewBtn,
    viewLabel: viewBtn ? (viewBtn.textContent || "").trim() : null,
    presenceDots,
    presenceLabels,
    hasComputer: !!computer,
    computerTitle,
    computerBadge,
    computerEmpty,
    computerSize: computer?.getAttribute("data-size") ?? null,
  }
})()`

let value = null
for (let i = 0; i < 30; i++) {
  const evalRes = await send("Runtime.evaluate", { expression: probeExpr, returnByValue: true })
  value = evalRes.result?.result?.value ?? null
  console.log("probe", i, JSON.stringify(value))
  if (value?.hasShell && value?.hasViewBtn) break
  await new Promise((r) => setTimeout(r, 1000))
}

if (!value?.hasShell) {
  console.error("AnShell not ready")
  process.exit(2)
}

// Click Computer View mode (no CSS inject — real UI)
const clickRes = await send("Runtime.evaluate", {
  expression: `(() => {
    const btn = document.querySelector('.an-mode-btn[data-mode="view"]')
    if (!btn) return { ok: false, reason: "no view btn" }
    btn.click()
    const shell = document.querySelector('[data-component="an-shell"]')
    return {
      ok: true,
      shellMode: shell?.getAttribute("data-mode") ?? null,
      viewActive: btn.getAttribute("data-active"),
    }
  })()`,
  returnByValue: true,
})
console.log("clickView", JSON.stringify(clickRes.result?.result?.value ?? clickRes))

await new Promise((r) => setTimeout(r, 800))

const afterRes = await send("Runtime.evaluate", { expression: probeExpr, returnByValue: true })
value = afterRes.result?.result?.value ?? value
console.log("after", JSON.stringify(value))

const ok =
  value?.hasShell &&
  value?.shellMode === "view" &&
  value?.viewLabel === "Computer View" &&
  value?.computerTitle === "Computer View" &&
  Array.isArray(value?.presenceLabels) &&
  value.presenceLabels.length > 0

if (!ok) {
  console.error("PROOF FAIL", JSON.stringify(value, null, 2))
  process.exit(4)
}

await new Promise((r) => setTimeout(r, 400))
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
console.log("PROOF_OK")
ws.close()
