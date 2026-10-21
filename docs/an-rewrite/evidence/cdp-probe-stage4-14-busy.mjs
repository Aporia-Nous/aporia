import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import WebSocket from "ws"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, "screenshots-2026-10-18")
const marker = `AP-STAGE4-14 busy ${Date.now()}`

const list = await fetch("http://127.0.0.1:9222/json/list").then((r) => r.json())
const page =
  list.find((p) => p.type === "page" && (p.url || "").includes("5173")) ??
  list.find((p) => p.type === "page") ??
  list[0]
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

async function evaluate(expression) {
  const res = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })
  return res.result?.result?.value ?? null
}

async function shot(name) {
  const shotRes = await send("Page.captureScreenshot", { format: "png", fromSurface: true })
  const b64 = shotRes.result?.data
  if (!b64) throw new Error("no screenshot")
  const out = path.join(outDir, name)
  fs.writeFileSync(out, Buffer.from(b64, "base64"))
  console.log("wrote", out)
}

const presenceExpr = `(() => {
  const labels = [...document.querySelectorAll(".an-roster-presence")].map((el) => ({
    text: (el.textContent || "").trim(),
    presence: el.getAttribute("data-presence"),
  }))
  const selected = document.querySelector(".an-roster-member[data-selected='true'], .an-roster-member[aria-current='true'], .an-roster-member.selected")
  const selectedPresence =
    selected?.querySelector(".an-roster-presence")?.getAttribute("data-presence") ||
    selected?.getAttribute("data-presence") ||
    null
  const counts = labels.reduce((acc, row) => {
    acc[row.presence || "missing"] = (acc[row.presence || "missing"] || 0) + 1
    return acc
  }, {})
  return { labels, counts, selectedPresence, unknownCount: labels.filter((l) => l.presence === "unknown").length }
})()`

await evaluate(`(() => {
  const btn = document.querySelector('.an-mode-btn[data-mode="conversation"]')
  if (btn) btn.click()
  const member = document.querySelector(".an-roster-member")
  if (member) member.click()
  return true
})()`)
await new Promise((r) => setTimeout(r, 800))

const focus = await evaluate(`(() => {
  const el =
    document.querySelector('.tiptap.ProseMirror') ||
    document.querySelector('[data-component="composer-editor"]') ||
    document.querySelector('[contenteditable="true"]')
  if (!el) return { ok: false }
  el.focus()
  el.click()
  return { ok: true }
})()`)
console.log("focus", JSON.stringify(focus))

if (focus?.ok) {
  await send("Input.dispatchKeyEvent", { type: "keyDown", windowsVirtualKeyCode: 65, modifiers: 2 })
  await send("Input.dispatchKeyEvent", { type: "keyUp", windowsVirtualKeyCode: 65, modifiers: 2 })
  await send("Input.insertText", { text: marker })
  await new Promise((r) => setTimeout(r, 200))
  await send("Input.dispatchKeyEvent", { type: "keyDown", windowsVirtualKeyCode: 13, key: "Enter", code: "Enter", text: "\r" })
  await send("Input.dispatchKeyEvent", { type: "keyUp", windowsVirtualKeyCode: 13, key: "Enter", code: "Enter" })
  await evaluate(`(() => {
    const sendBtn =
      document.querySelector('[data-action="composer-submit"]') ||
      [...document.querySelectorAll("button")].find((b) => /send/i.test(b.getAttribute("aria-label") || b.title || ""))
    if (!sendBtn || sendBtn.disabled) return { ok: false }
    sendBtn.click()
    return { ok: true }
  })()`)
}

let busy = null
for (let i = 0; i < 25; i++) {
  busy = await evaluate(presenceExpr)
  console.log("busyProbe", i, JSON.stringify(busy))
  const active = ["thinking", "speaking", "working", "waiting"].includes(busy?.selectedPresence)
  const anyBusy = ["thinking", "speaking", "working", "waiting"].some((k) => (busy?.counts?.[k] || 0) > 0)
  if (active || anyBusy) break
  await new Promise((r) => setTimeout(r, 400))
}

await shot("46-presence-busy-state.png")

const ok =
  busy &&
  busy.unknownCount === 0 &&
  (["thinking", "speaking", "working", "waiting"].includes(busy.selectedPresence) ||
    ["thinking", "speaking", "working", "waiting"].some((k) => (busy.counts?.[k] || 0) > 0))

const result = { ok: !!ok, marker, selectedPresence: busy?.selectedPresence ?? null, counts: busy?.counts ?? {}, unknownCount: busy?.unknownCount ?? -1 }
console.log("RESULT", JSON.stringify(result))
process.exit(ok ? 0 : 4)
