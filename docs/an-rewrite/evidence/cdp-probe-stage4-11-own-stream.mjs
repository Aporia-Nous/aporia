import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import WebSocket from "ws"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, "screenshots-2026-10-18")
const marker = `AP-STAGE4-11 visibility ${Date.now()}`

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

async function evaluate(expression) {
  const res = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })
  if (res.result?.exceptionDetails) {
    console.error("eval exception", JSON.stringify(res.result.exceptionDetails).slice(0, 500))
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
  const rect = (el) => {
    if (!el) return null
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    return {
      w: Math.round(r.width),
      h: Math.round(r.height),
      top: Math.round(r.top),
      display: cs.display,
      visibility: cs.visibility,
      opacity: cs.opacity,
      flex: cs.flex,
    }
  }
  const shell = document.querySelector('[data-component="an-shell"]')
  const conv = document.querySelector('[data-component="an-conversation"]')
  const cards = document.querySelector(".an-stream-cards")
  const legacy = document.querySelector(".an-stream-legacy")
  const timeline = document.querySelector('[data-an-part="opencode-timeline"]')
  const userTurns = [...document.querySelectorAll('.an-turn[data-role="user"]')]
  const asstTurns = [...document.querySelectorAll('.an-turn[data-role="assistant"]')]
  const composer =
    document.querySelector('[data-component="prompt-input"]') ||
    document.querySelector(".tiptap.ProseMirror") ||
    document.querySelector('[contenteditable="true"]') ||
    document.querySelector("textarea")
  return {
    hasShell: !!shell,
    shellMode: shell?.getAttribute("data-mode"),
    ownConv: document.querySelector(".an-stream")?.getAttribute("data-an-own-conversation"),
    cards: rect(cards),
    conv: rect(conv),
    legacy: { ...rect(legacy), composerOnly: legacy?.classList.contains("an-stream-legacy--composer-only") },
    timeline: rect(timeline),
    userTurnCount: userTurns.length,
    userTexts: userTurns.slice(-3).map((el) => (el.querySelector("[data-slot='an-turn-text']")?.textContent || "").trim().slice(0, 160)),
    asstTurnCount: asstTurns.length,
    composer: { ...rect(composer), tag: composer?.tagName, cls: (composer?.className || "").toString().slice(0, 80) },
    href: location.href,
  }
})()`

let before = null
for (let i = 0; i < 25; i++) {
  before = await evaluate(probeExpr)
  console.log("probe", i, JSON.stringify(before))
  if (before?.hasShell) break
  await new Promise((r) => setTimeout(r, 400))
}
if (!before?.hasShell) {
  console.error("AnShell not ready")
  process.exit(2)
}
await shot("19b-before-own-stream-home.png")

// Open first roster teammate (real session path)
const openMember = await evaluate(`(() => {
  const btn = document.querySelector(".an-roster-member")
  if (!btn) return { ok: false, reason: "no roster member" }
  btn.click()
  return { ok: true, label: (btn.getAttribute("aria-label") || btn.textContent || "").trim().slice(0, 80) }
})()`)
console.log("openMember", JSON.stringify(openMember))
await new Promise((r) => setTimeout(r, 1500))

let mid = await evaluate(probeExpr)
console.log("afterOpen", JSON.stringify(mid))
await shot("19c-after-open-session.png")

// If still no session (ownConv false), try New session / click welcome
if (mid?.ownConv !== "true") {
  const newSession = await evaluate(`(() => {
    const candidates = [...document.querySelectorAll("button, a, [role='button']")]
    const hit = candidates.find((el) => /new session/i.test(el.textContent || ""))
    if (!hit) return { ok: false, reason: "no new session control", texts: candidates.slice(0, 12).map(e => (e.textContent||"").trim().slice(0,40)) }
    hit.click()
    return { ok: true, text: (hit.textContent || "").trim().slice(0, 60) }
  })()`)
  console.log("newSession", JSON.stringify(newSession))
  await new Promise((r) => setTimeout(r, 2000))
  mid = await evaluate(probeExpr)
  console.log("afterNew", JSON.stringify(mid))
}

// Focus composer and type marker via Input.insertText / keyboard
const focus = await evaluate(`(() => {
  const el =
    document.querySelector('.tiptap.ProseMirror') ||
    document.querySelector('[contenteditable="true"]') ||
    document.querySelector('textarea') ||
    document.querySelector('[data-component="prompt-input"]')
  if (!el) return { ok: false, reason: "no composer" }
  el.focus()
  el.click()
  return { ok: true, tag: el.tagName, ce: el.getAttribute("contenteditable") }
})()`)
console.log("focus", JSON.stringify(focus))

if (focus?.ok) {
  // Clear then type
  await send("Input.dispatchKeyEvent", { type: "keyDown", windowsVirtualKeyCode: 65, modifiers: 2 }) // ctrl+a
  await send("Input.dispatchKeyEvent", { type: "keyUp", windowsVirtualKeyCode: 65, modifiers: 2 })
  await send("Input.insertText", { text: marker })
  await new Promise((r) => setTimeout(r, 300))

  // Prefer Enter to send (common in this app); also try send button
  await send("Input.dispatchKeyEvent", { type: "keyDown", windowsVirtualKeyCode: 13, key: "Enter", code: "Enter", text: "\r" })
  await send("Input.dispatchKeyEvent", { type: "keyUp", windowsVirtualKeyCode: 13, key: "Enter", code: "Enter" })
  await new Promise((r) => setTimeout(r, 400))

  const clickedSend = await evaluate(`(() => {
    const sendBtn =
      document.querySelector('[data-component="prompt-submit"]') ||
      document.querySelector('button[aria-label*="Send" i]') ||
      document.querySelector('button[title*="Send" i]') ||
      [...document.querySelectorAll("button")].find((b) => /send/i.test(b.getAttribute("aria-label") || b.title || ""))
    if (!sendBtn) return { ok: false }
    sendBtn.click()
    return { ok: true, label: sendBtn.getAttribute("aria-label") || sendBtn.title || "send" }
  })()`)
  console.log("sendClick", JSON.stringify(clickedSend))
}

let after = null
for (let i = 0; i < 20; i++) {
  after = await evaluate(probeExpr)
  console.log("afterSend", i, JSON.stringify({
    ownConv: after?.ownConv,
    userTurnCount: after?.userTurnCount,
    userTexts: after?.userTexts,
    cardsH: after?.cards?.h,
    convH: after?.conv?.h,
    timelineDisplay: after?.timeline?.display,
  }))
  if (after?.userTexts?.some((t) => t.includes("AP-STAGE4-11"))) break
  await new Promise((r) => setTimeout(r, 500))
}

await shot("20-after-message-visible.png")

const ok =
  after?.ownConv === "true" &&
  (after?.userTurnCount ?? 0) > 0 &&
  after?.userTexts?.some((t) => String(t).includes("AP-STAGE4-11")) &&
  (after?.conv?.h ?? 0) > 40 &&
  after?.timeline?.display === "none"

console.log("RESULT", JSON.stringify({ ok, marker, after }, null, 2))
ws.close()
process.exit(ok ? 0 : 4)
