/**
 * AP-BF-03 live CDP: Connect → Confirm → Live watch-only feed → Takeover (user lock,
 * pointer-events auto, bot paused, Bot cursor hidden) → Hand back / Stop restore bot
 * watch-only → Disconnect clears. Non-regress ownership markers.
 * Isolated DEV only — no prod DB.
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import WebSocket from "ws"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, "screenshots-2026-10-18")
const boardEvidence =
  "C:\\Users\\Dilla\\OneDrive\\Documents\\ChatGPT\\Aporia Nous\\business-control\\evidence"

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
  const buf = Buffer.from(b64, "base64")
  fs.mkdirSync(outDir, { recursive: true })
  const out = path.join(outDir, name)
  fs.writeFileSync(out, buf)
  console.log("wrote", out)
  try {
    fs.mkdirSync(boardEvidence, { recursive: true })
    const boardOut = path.join(boardEvidence, `2026-10-19-${name}`)
    fs.writeFileSync(boardOut, buf)
    console.log("wrote board", boardOut)
  } catch (err) {
    console.warn("board evidence copy failed", err?.message || err)
  }
  return out
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms))
}

const probe = `(() => {
  const shell = document.querySelector('[data-component="an-shell"]')
  const panel = document.querySelector('[data-an-part="computer-attach"]')
  const stage = document.querySelector('[data-an-part="computer-control"]')
  const badge = panel?.querySelector('.an-computer-badge')
  const cursor = panel?.querySelector('[data-an-part="computer-cursor"]')
  const feed = panel?.querySelector('[data-an-part="computer-feed"]')
  const frame = panel?.querySelector('[data-an-part="computer-feed-frame"]')
  const pill = stage?.querySelector('.an-takeover-pill')
  const handback = document.querySelector('[data-action="computer-handback"]')
  const stop = document.querySelector('[data-action="computer-stop-takeover"]')
  const composer = document.querySelector('[data-an-owned="composer"]')
  const stream = document.querySelector('[data-an-own-conversation="true"]')
  const pe = frame ? getComputedStyle(frame).pointerEvents : null
  return {
    mode: shell?.getAttribute('data-mode') || null,
    live: badge?.getAttribute('data-live') || null,
    phase: panel?.getAttribute('data-attach-phase') || null,
    controller: panel?.getAttribute('data-controller') || stage?.getAttribute('data-controller') || null,
    botPaused: panel?.getAttribute('data-bot-paused') || stage?.getAttribute('data-bot-paused') || null,
    userInput: panel?.getAttribute('data-user-input') || stage?.getAttribute('data-user-input') || null,
    needsObservation: panel?.getAttribute('data-needs-observation') || null,
    feedWatchOnly: feed?.getAttribute('data-watch-only') || frame?.getAttribute('data-watch-only') || null,
    feedCursorInCapture: feed?.getAttribute('data-cursor-in-capture') || null,
    framePointerEvents: pe,
    hasCursor: !!cursor,
    cursorLabel: cursor?.getAttribute('aria-label') || null,
    hasFeed: !!feed,
    pill: pill?.textContent?.trim() || null,
    hasHandback: !!handback,
    hasStop: !!stop,
    composerOwned: !!composer,
    streamOwned: !!stream,
  }
})()`

await evaluate(`(() => {
  const btn = document.querySelector('.an-mode-btn[data-mode="view"]')
  if (btn) btn.click()
  return !!btn
})()`)
await sleep(350)

let before = await evaluate(probe)
console.log("before", before)

if (before?.live === "true") {
  await evaluate(`(() => {
    const btn = document.querySelector('[data-action="computer-disconnect"]')
    if (btn) btn.click()
    return !!btn
  })()`)
  await sleep(400)
}

const opened = await evaluate(`(() => {
  const hasSession = !!document.querySelector('[data-component="an-shell-session"]') &&
    !!document.querySelector('[data-an-owned="composer"]')
  if (hasSession) return { opened: false, already: true }
  const link = document.querySelector('a[href*="/session/"], [data-component="session-row"], .session-list a')
  if (link) { link.click(); return { opened: true, via: 'session-link' } }
  return { opened: false, already: false }
})()`)
console.log("sessionOpen", opened)
await sleep(900)

await evaluate(`(() => {
  const btn = document.querySelector('.an-mode-btn[data-mode="view"]')
  if (btn) btn.click()
  return !!btn
})()`)
await sleep(300)

await evaluate(`(() => {
  const btn = document.querySelector('[data-action="computer-connect"]')
  if (btn) btn.click()
  return !!btn
})()`)
await sleep(300)
await evaluate(`(() => {
  const btn = document.querySelector('[data-action="computer-confirm"]')
  if (btn) btn.click()
  return !!btn
})()`)
await sleep(500)

const liveView = await evaluate(probe)
console.log("liveView", liveView)
await shot("31-bf03-live-view-watch-only.png")

await evaluate(`(() => {
  const btn = document.querySelector('.an-mode-btn[data-mode="takeover"]')
  if (btn) btn.click()
  return !!btn
})()`)
await sleep(500)

const takeover = await evaluate(probe)
console.log("takeover", takeover)
await shot("32-bf03-takeover-user-control.png")

await evaluate(`(() => {
  const btn = document.querySelector('[data-action="computer-handback"]')
  if (btn) btn.click()
  return !!btn
})()`)
await sleep(450)

const handback = await evaluate(probe)
console.log("handback", handback)
await shot("33-bf03-handback-bot-lock.png")

// Re-enter Takeover then Stop → View
await evaluate(`(() => {
  const btn = document.querySelector('.an-mode-btn[data-mode="takeover"]')
  if (btn) btn.click()
  return !!btn
})()`)
await sleep(400)
await evaluate(`(() => {
  const btn = document.querySelector('[data-action="computer-stop-takeover"]')
  if (btn) btn.click()
  return !!btn
})()`)
await sleep(450)

const stopped = await evaluate(probe)
console.log("stopped", stopped)
await shot("34-bf03-stop-to-view.png")

await evaluate(`(() => {
  const btn = document.querySelector('[data-action="computer-disconnect"]')
  if (btn) btn.click()
  return !!btn
})()`)
await sleep(400)
const afterDisconnect = await evaluate(probe)
console.log("afterDisconnect", afterDisconnect)

const viewOk =
  liveView?.live === "true" &&
  liveView?.controller === "bot" &&
  liveView?.userInput === "false" &&
  liveView?.feedWatchOnly === "true" &&
  liveView?.framePointerEvents === "none" &&
  liveView?.hasCursor === true &&
  liveView?.hasFeed === true &&
  liveView?.feedCursorInCapture === "false"

const takeoverOk =
  takeover?.mode === "takeover" &&
  takeover?.live === "true" &&
  takeover?.controller === "user" &&
  takeover?.botPaused === "true" &&
  takeover?.userInput === "true" &&
  takeover?.feedWatchOnly === "false" &&
  takeover?.framePointerEvents === "auto" &&
  takeover?.hasCursor === false &&
  (takeover?.pill || "").toLowerCase().includes("you control") &&
  takeover?.hasHandback === true &&
  takeover?.hasStop === true

const handbackOk =
  handback?.mode === "conversation" &&
  handback?.live === "true" &&
  handback?.controller === "bot" &&
  handback?.userInput === "false" &&
  handback?.feedWatchOnly === "true" &&
  handback?.framePointerEvents === "none" &&
  handback?.needsObservation === "true" &&
  handback?.hasCursor === true

const stopOk =
  stopped?.mode === "view" &&
  stopped?.live === "true" &&
  stopped?.controller === "bot" &&
  stopped?.userInput === "false" &&
  stopped?.feedWatchOnly === "true" &&
  stopped?.framePointerEvents === "none" &&
  stopped?.needsObservation === "true"

const disconnectOk =
  afterDisconnect?.live === "false" &&
  afterDisconnect?.controller === "none" &&
  afterDisconnect?.userInput === "false" &&
  afterDisconnect?.hasFeed !== true

const ownershipOk = liveView?.composerOwned === true && liveView?.streamOwned === true

const ok = viewOk && takeoverOk && handbackOk && stopOk && disconnectOk && ownershipOk

console.log(
  "RESULT",
  JSON.stringify({
    ok,
    viewOk,
    takeoverOk,
    handbackOk,
    stopOk,
    disconnectOk,
    ownershipOk,
    marker: `AP-BF-03 control ${Date.now()}`,
  }),
)

ws.close()
process.exit(ok ? 0 : 2)
