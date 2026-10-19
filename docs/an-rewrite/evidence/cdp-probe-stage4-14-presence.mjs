import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import WebSocket from "ws"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, "screenshots-2026-10-18")
const marker = `AP-STAGE4-14 presence ${Date.now()}`

const list = await fetch("http://127.0.0.1:9222/json/list").then((r) => r.json())
const page =
  list.find((p) => p.type === "page" && (p.url || "").includes("5173")) ??
  list.find((p) => p.type === "page") ??
  list[0]
if (!page?.webSocketDebuggerUrl) {
  console.error("No CDP page")
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

async function evaluate(expression) {
  const res = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })
  if (res.result?.exceptionDetails) {
    console.error("eval exception", JSON.stringify(res.result.exceptionDetails).slice(0, 800))
  }
  return res.result?.result?.value ?? null
}

async function shot(name) {
  const shotRes = await send("Page.captureScreenshot", { format: "png", fromSurface: true })
  const b64 = shotRes.result?.data
  if (!b64) throw new Error("no screenshot for " + name)
  const out = path.join(outDir, name)
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(out, Buffer.from(b64, "base64"))
  console.log("wrote", out)
  return out
}

const probeExpr = `(() => {
  const shell = document.querySelector('[data-component="an-shell"]')
  const roster = [...document.querySelectorAll(".an-roster-member, [data-an-part='roster'] [data-presence], .an-roster li")].map((el) => {
    const presenceEl = el.matches("[data-presence]") ? el : el.querySelector("[data-presence]")
    const label = el.querySelector(".an-roster-presence")
    return {
      name: (el.querySelector(".an-roster-name, .an-roster-title, strong")?.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 80),
      presence: presenceEl?.getAttribute("data-presence") ?? label?.getAttribute("data-presence") ?? null,
      label: (label?.textContent || "").trim(),
    }
  })
  const presenceLabels = [...document.querySelectorAll(".an-roster-presence")].map((el) => ({
    text: (el.textContent || "").trim(),
    presence: el.getAttribute("data-presence"),
  }))
  const counts = presenceLabels.reduce((acc, row) => {
    const key = row.presence || "missing"
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})
  const unknownCount = presenceLabels.filter((r) => r.presence === "unknown" || r.text === "Unknown").length
  const five = ["listening", "thinking", "speaking", "working", "waiting"]
  const fiveCount = presenceLabels.filter((r) => five.includes(r.presence)).length
  const composer = document.querySelector('[data-an-owned="composer"]')
  const stream = document.querySelector('[data-an-part="conversation-stream"], [data-an-owned="stream"]')
  const contraptions = document.querySelector('[data-an-part="contraptions"]')
  return {
    marker: ${JSON.stringify(marker)},
    hasShell: !!shell,
    shellMode: shell?.getAttribute("data-mode") ?? null,
    rosterSample: roster.slice(0, 12),
    presenceLabels,
    counts,
    unknownCount,
    fiveCount,
    rosterLen: presenceLabels.length,
    composerOwned: !!composer,
    streamOwned: !!stream,
    hasContraptionsNav: !!document.querySelector('[data-an-nav="contraptions"], .an-nav [data-nav="contraptions"], button[title*="Contraption"]'),
    contraptionsMounted: !!contraptions,
  }
})()`

let value = null
for (let i = 0; i < 40; i++) {
  value = await evaluate(probeExpr)
  console.log("probe", i, JSON.stringify(value))
  if (value?.hasShell && value?.rosterLen > 0) break
  await new Promise((r) => setTimeout(r, 1000))
}

if (!value?.hasShell) {
  console.error("AnShell not ready")
  process.exit(2)
}

await shot("43-before-presence-five-state.png")

// Prefer Conversation mode for roster visibility
await evaluate(`(() => {
  const btn = document.querySelector('.an-mode-btn[data-mode="conversation"]')
  if (btn) btn.click()
  return true
})()`)
await new Promise((r) => setTimeout(r, 600))

value = await evaluate(probeExpr)
console.log("afterConversation", JSON.stringify(value))
await shot("44-presence-five-state-roster.png")

// Flip to Computer View — presence should remain honest
await evaluate(`(() => {
  const btn = document.querySelector('.an-mode-btn[data-mode="view"]')
  if (btn) btn.click()
  return true
})()`)
await new Promise((r) => setTimeout(r, 600))
const viewValue = await evaluate(probeExpr)
console.log("afterView", JSON.stringify(viewValue))
await shot("45-presence-computer-view.png")

const final = viewValue?.rosterLen ? viewValue : value
const ok =
  !!final?.hasShell &&
  final.rosterLen > 0 &&
  final.fiveCount > 0 &&
  // Live companions with signals must not be almost-all Unknown
  final.unknownCount < final.rosterLen &&
  final.fiveCount >= Math.ceil(final.rosterLen * 0.5)

const result = {
  ok,
  marker,
  rosterLen: final?.rosterLen ?? 0,
  fiveCount: final?.fiveCount ?? 0,
  unknownCount: final?.unknownCount ?? 0,
  counts: final?.counts ?? {},
  composerOwned: !!final?.composerOwned,
  presenceLabels: final?.presenceLabels ?? [],
}
console.log("RESULT", JSON.stringify(result))

if (!ok) process.exit(3)
process.exit(0)
