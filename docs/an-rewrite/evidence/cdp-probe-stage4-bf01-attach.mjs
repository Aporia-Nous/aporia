/**
 * AP-BF-01 live CDP: open session if needed, Connect → Confirm attach,
 * verify computerLive + cursor; Disconnect clears Live.
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
  const connect = panel?.querySelector('[data-action="computer-connect"]')
  const confirm = panel?.querySelector('[data-action="computer-confirm"]')
  const disconnect = panel?.querySelector('[data-action="computer-disconnect"]')
  const composer = document.querySelector('[data-an-owned="composer"]')
  const stream = document.querySelector('[data-an-own-conversation="true"]')
  return {
    hasPanel: !!panel,
    phase: panel?.getAttribute('data-attach-phase') || null,
    backend: panel?.getAttribute('data-backend') || null,
    live: badge?.getAttribute('data-live') || null,
    badge: badge?.textContent?.trim() || null,
    hasCursor: !!cursor,
    hasConnect: !!connect,
    hasConfirm: !!confirm,
    hasDisconnect: !!disconnect,
    composerOwned: !!composer,
    streamOwned: !!stream,
  }
})()`

// Prefer Computer View mode for a larger panel
await evaluate(`(() => {
  const btn = document.querySelector('.an-mode-btn[data-mode="view"]')
  if (btn) btn.click()
  return !!btn
})()`)
await sleep(400)

let before = await evaluate(probePanel)
console.log("before", before)

// Open a session if home (no session) — click first mission/session nav if present
const opened = await evaluate(`(() => {
  const hasSession = !!document.querySelector('[data-component="an-shell-session"]') &&
    !!document.querySelector('[data-an-owned="composer"]')
  if (hasSession) return { opened: false, already: true }
  const mission = document.querySelector('.an-nav-item[data-id="missions"], .an-nav-item[title*="Mission"], button.an-nav-item')
  // Try recent session row / home card
  const link = document.querySelector('a[href*="/session/"], [data-component="session-row"], .session-list a')
  if (link) { link.click(); return { opened: true, via: 'session-link' } }
  const tabNew = document.querySelector('[data-command="tab.new"], button[data-action="tab.new"]')
  if (tabNew) { tabNew.click(); return { opened: true, via: 'tab.new' } }
  return { opened: false, already: false }
})()`)
console.log("sessionOpen", opened)
await sleep(900)

before = await evaluate(probePanel)
console.log("afterSession", before)

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
await sleep(450)
const live = await evaluate(probePanel)
console.log("live", live)
await shot("26-bf01-computer-live-attach.png")

await evaluate(`(() => {
  const btn = document.querySelector('[data-action="computer-disconnect"]')
  if (btn) btn.click()
  return !!btn
})()`)
await sleep(350)
const afterDisconnect = await evaluate(probePanel)
console.log("afterDisconnect", afterDisconnect)
await shot("27-bf01-computer-disconnected.png")

const ok =
  live?.hasPanel === true &&
  live?.backend === "local-browser" &&
  live?.live === "true" &&
  live?.hasCursor === true &&
  live?.hasDisconnect === true &&
  afterDisconnect?.live === "false" &&
  afterDisconnect?.hasCursor === false &&
  // ownership non-regression when session was open
  (live?.composerOwned === true || live?.streamOwned === true || opened?.already === false)

console.log(
  "RESULT",
  JSON.stringify({
    ok,
    mountOk: !!live?.hasPanel,
    liveOk: live?.live === "true" && live?.hasCursor === true,
    disconnectOk: afterDisconnect?.live === "false",
    backend: live?.backend,
    composerOwned: live?.composerOwned,
    streamOwned: live?.streamOwned,
    marker: `AP-BF-01 attach ${Date.now()}`,
  }),
)

ws.close()
process.exit(ok ? 0 : 2)
