/**
 * AP-BF-02 live CDP: Connect → Confirm attach → page feed active (workspace srcdoc)
 * + labeled Bot cursor; navigate chrome; Disconnect clears Live + feed.
 * Non-regression: composer/stream ownership markers.
 * Isolated DEV only — no prod DB. Screenshots under screenshots-2026-10-18/.
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

const probePanel = `(() => {
  const panel = document.querySelector('[data-an-part="computer-attach"]')
  const badge = panel?.querySelector('.an-computer-badge')
  const cursor = panel?.querySelector('[data-an-part="computer-cursor"]')
  const feed = panel?.querySelector('[data-an-part="computer-feed"]')
  const frame = panel?.querySelector('[data-an-part="computer-feed-frame"]')
  const feedBar = panel?.querySelector('[data-an-part="computer-feed-bar"]')
  const connect = panel?.querySelector('[data-action="computer-connect"]')
  const confirm = panel?.querySelector('[data-action="computer-confirm"]')
  const disconnect = panel?.querySelector('[data-action="computer-disconnect"]')
  const composer = document.querySelector('[data-an-owned="composer"]')
  const stream = document.querySelector('[data-an-own-conversation="true"]')
  const pe = frame ? getComputedStyle(frame).pointerEvents : null
  return {
    hasPanel: !!panel,
    phase: panel?.getAttribute('data-attach-phase') || null,
    backend: panel?.getAttribute('data-backend') || null,
    feedActiveAttr: panel?.getAttribute('data-feed-active') || null,
    live: badge?.getAttribute('data-live') || null,
    badge: badge?.textContent?.trim() || null,
    hasCursor: !!cursor,
    cursorLabel: cursor?.getAttribute('aria-label') || cursor?.textContent?.trim() || null,
    hasFeed: !!feed,
    hasFeedFrame: !!frame,
    hasFeedBar: !!feedBar,
    feedWatchOnly: feed?.getAttribute('data-watch-only') || null,
    feedCursorInCapture: feed?.getAttribute('data-cursor-in-capture') || null,
    feedMode: frame?.getAttribute('data-feed-mode') || null,
    feedUrl: feed?.getAttribute('data-feed-url') || null,
    framePointerEvents: pe,
    hasConnect: !!connect,
    hasConfirm: !!confirm,
    hasDisconnect: !!disconnect,
    composerOwned: !!composer,
    streamOwned: !!stream,
  }
})()`

await evaluate(`(() => {
  const btn = document.querySelector('.an-mode-btn[data-mode="view"]')
  if (btn) btn.click()
  return !!btn
})()`)
await sleep(400)

let before = await evaluate(probePanel)
console.log("before", before)

// Ensure disconnected start
if (before?.live === "true") {
  await evaluate(`(() => {
    const btn = document.querySelector('[data-action="computer-disconnect"]')
    if (btn) btn.click()
    return !!btn
  })()`)
  await sleep(400)
  before = await evaluate(probePanel)
  console.log("forcedDisconnect", before)
}

const opened = await evaluate(`(() => {
  const hasSession = !!document.querySelector('[data-component="an-shell-session"]') &&
    !!document.querySelector('[data-an-owned="composer"]')
  if (hasSession) return { opened: false, already: true }
  const link = document.querySelector('a[href*="/session/"], [data-component="session-row"], .session-list a')
  if (link) { link.click(); return { opened: true, via: 'session-link' } }
  const missions = document.querySelector('.an-nav-item[title="Missions"], .an-nav-item[aria-label="Missions"]')
  if (missions) { missions.click(); return { opened: true, via: 'missions' } }
  return { opened: false, already: false }
})()`)
console.log("sessionOpen", opened)
await sleep(1000)

await evaluate(`(() => {
  const btn = document.querySelector('.an-mode-btn[data-mode="view"]')
  if (btn) btn.click()
  return !!btn
})()`)
await sleep(350)

await evaluate(`(() => {
  const btn = document.querySelector('[data-action="computer-connect"]')
  if (btn) btn.click()
  return !!btn
})()`)
await sleep(350)
const consenting = await evaluate(probePanel)
console.log("consenting", consenting)

await evaluate(`(() => {
  const btn = document.querySelector('[data-action="computer-confirm"]')
  if (btn) btn.click()
  return !!btn
})()`)
await sleep(600)
const live = await evaluate(probePanel)
console.log("live", live)
await shot("28-bf02-computer-feed-live.png")

// Navigate to example.com via feed chrome (watch-only page; pointer-events none on iframe)
const nav = await evaluate(`(() => {
  const input = document.querySelector('[data-an-part="computer-feed-url"]')
  const go = document.querySelector('[data-action="computer-feed-go"]')
  if (!input || !go) return { ok: false, reason: 'no-feed-chrome' }
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, 'https://example.com')
  input.dispatchEvent(new Event('input', { bubbles: true }))
  go.click()
  return { ok: true }
})()`)
console.log("navigate", nav)
await sleep(1200)
const afterNav = await evaluate(probePanel)
console.log("afterNav", afterNav)
await shot("29-bf02-computer-feed-example.png")

await evaluate(`(() => {
  const btn = document.querySelector('[data-action="computer-disconnect"]')
  if (btn) btn.click()
  return !!btn
})()`)
await sleep(400)
const afterDisconnect = await evaluate(probePanel)
console.log("afterDisconnect", afterDisconnect)
await shot("30-bf02-computer-feed-disconnected.png")

const feedOk =
  live?.live === "true" &&
  live?.hasFeed === true &&
  live?.hasFeedFrame === true &&
  live?.feedActiveAttr === "true" &&
  live?.feedWatchOnly === "true" &&
  live?.feedCursorInCapture === "false" &&
  live?.hasCursor === true &&
  live?.cursorLabel === "Bot cursor" &&
  live?.framePointerEvents === "none" &&
  live?.backend === "local-browser"

const navOk =
  afterNav?.live === "true" &&
  afterNav?.hasFeed === true &&
  (afterNav?.feedUrl || "").includes("example.com") &&
  afterNav?.feedMode === "src" &&
  afterNav?.feedCursorInCapture === "false"

const disconnectOk =
  afterDisconnect?.live === "false" &&
  afterDisconnect?.hasFeed !== true &&
  afterDisconnect?.hasCursor === false &&
  afterDisconnect?.feedActiveAttr === "false"

const ownershipOk = live?.composerOwned === true && live?.streamOwned === true

const ok = feedOk && navOk && disconnectOk && ownershipOk

console.log(
  "RESULT",
  JSON.stringify({
    ok,
    feedOk,
    navOk,
    disconnectOk,
    ownershipOk,
    liveUrl: live?.feedUrl,
    afterNavUrl: afterNav?.feedUrl,
    composerOwned: live?.composerOwned,
    streamOwned: live?.streamOwned,
    marker: `AP-BF-02 feed ${Date.now()}`,
  }),
)

ws.close()
process.exit(ok ? 0 : 2)
