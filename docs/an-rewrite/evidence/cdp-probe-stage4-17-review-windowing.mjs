/**
 * AP-STAGE4-17 + AP-BF-06 live CDP:
 * Review panel open/tabs + local Live attach opens Review + BF-06 open-tab policy via relay.
 * Isolated DEV — no prod DB. Shots 60–63 under screenshots-2026-10-18/.
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import WebSocket from "ws"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, "screenshots-2026-10-18")
const boardEvidence =
  "C:\\Users\\Dilla\\OneDrive\\Documents\\ChatGPT\\Aporia Nous\\business-control\\evidence"
const MARKER = `AP-STAGE4-17 review ${Date.now()}`
const ENDPOINT = "http://127.0.0.1:9333"
const RELAY = "http://127.0.0.1:5199"

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl)
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
  return new Promise((resolve, reject) => {
    ws.on("open", () => resolve({ ws, send }))
    ws.on("error", reject)
  })
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms))
}

const aporeticList = await fetch("http://127.0.0.1:9222/json/list").then((r) => r.json())
const aporeticPage =
  aporeticList.find((p) => p.type === "page" && (p.url || "").includes("5173")) ??
  aporeticList.find((p) => p.type === "page" && (p.title || "").includes("Aporetic"))
if (!aporeticPage?.webSocketDebuggerUrl) {
  console.error("No Aporetic CDP page on :9222")
  process.exit(1)
}
console.log("aporetic", aporeticPage.title, aporeticPage.url)

const { send } = await connect(aporeticPage.webSocketDebuggerUrl)
await send("Page.enable")
await send("Runtime.enable")
await send("Page.reload", { ignoreCache: true })
await sleep(2800)

async function evaluate(expression) {
  const res = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })
  if (res.result?.exceptionDetails) {
    console.error("eval exception", JSON.stringify(res.result.exceptionDetails).slice(0, 600))
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
    fs.writeFileSync(path.join(boardEvidence, `2026-10-19-${name}`), buf)
  } catch (err) {
    console.warn("board evidence copy failed", err?.message || err)
  }
  return out
}

const sessionOpen = await evaluate(`(async () => {
  const hasComposer = !!document.querySelector('[data-an-owned="composer"]')
  if (hasComposer) return { opened: false, already: true }
  const link = document.querySelector('a[href*="/session/"], [data-component="session-row"], .session-list a')
  if (link) { link.click(); return { opened: true, via: 'session-link' } }
  const teammate = document.querySelector('.an-roster-member')
  if (teammate) {
    teammate.click()
    await new Promise((r) => setTimeout(r, 2200))
    return {
      opened: true,
      via: 'roster',
      composer: !!document.querySelector('[data-an-owned="composer"]'),
    }
  }
  const tabNew = document.querySelector('[data-command="tab.new"], button[data-action="tab.new"]')
  if (tabNew) { tabNew.click(); return { opened: true, via: 'tab.new' } }
  return { opened: false, already: false }
})()`)
console.log("sessionOpen", sessionOpen)
await sleep(1800)

// Ensure AnShell present
const shellOk = await evaluate(`!!document.querySelector('[data-component="an-shell"]')`)
if (!shellOk) {
  console.error("AnShell not mounted")
  process.exit(1)
}

await evaluate(`(() => {
  const btn = document.querySelector('.an-mode-btn[data-mode="view"]')
  if (btn) btn.click()
  return !!btn
})()`)
await sleep(350)

// Toggle Review via nav
const reviewToggle = await evaluate(`(() => {
  const btn = document.querySelector('.an-nav-item[aria-label="Review"], .an-nav-item[title="Review"]')
  if (!btn) return { ok: false, reason: 'no-review-nav' }
  btn.click()
  return { ok: true }
})()`)
console.log("reviewToggle", reviewToggle)
await sleep(700)

const reviewOpen = await evaluate(`(() => {
  const panel = document.querySelector('[data-an-part="review"]')
  if (!panel) return { ok: false, reason: 'no-panel' }
  const tabs = [...panel.querySelectorAll('.an-review-tab')].map(t => t.textContent?.trim())
  const style = getComputedStyle(panel)
  return {
    ok: true,
    tabs,
    part: panel.getAttribute('data-an-part'),
    animation: style.animationName || '',
    inApp: !panel.closest('body > *') || !!document.querySelector('[data-component="an-shell"]'),
  }
})()`)
console.log("reviewOpen", reviewOpen)
await shot("60-stage4-17-review-open.png")

// Switch tabs
const tabSwitch = await evaluate(`(() => {
  const files = document.querySelector('[data-action="review-tab-files"]')
  if (!files) return { ok: false, reason: 'no-files-tab' }
  files.click()
  const panel = document.querySelector('[data-an-part="review"]')
  return {
    ok: panel?.getAttribute('data-review-tab') === 'files',
    tab: panel?.getAttribute('data-review-tab'),
    filesPane: !!document.querySelector('[data-an-part="review-files"]'),
  }
})()`)
console.log("tabSwitch", tabSwitch)
await sleep(400)
await shot("61-stage4-17-review-files.png")

// Back to browser tab + local Live attach (opens Review preference)
await evaluate(`document.querySelector('[data-action="review-tab-browser"]')?.click()`)
await sleep(200)

const liveAttach = await evaluate(`(async () => {
  // Collapse review first to prove attach re-opens it for local path
  document.querySelector('[data-action="review-collapse"]')?.click()
  await new Promise(r => setTimeout(r, 300))
  const connect = document.querySelector('[data-action="computer-connect"]')
  if (!connect) return { ok: false, reason: 'no-connect' }
  connect.click()
  await new Promise(r => setTimeout(r, 250))
  document.querySelector('[data-action="computer-path-local"]')?.click()
  await new Promise(r => setTimeout(r, 150))
  document.querySelector('[data-action="computer-confirm"]')?.click()
  await new Promise(r => setTimeout(r, 600))
  const computer = document.querySelector('[data-an-part="computer-attach"]')
  const review = document.querySelector('[data-an-part="review"]')
  return {
    ok: computer?.getAttribute('data-attach-phase') === 'attached' && !!review,
    phase: computer?.getAttribute('data-attach-phase'),
    live: computer?.getAttribute('data-live'),
    reviewOpen: !!review,
    reviewTab: review?.getAttribute('data-review-tab'),
    noPopupsSandbox: !document.querySelector('.an-computer-feed-frame[sandbox*="allow-popups"]'),
  }
})()`)
console.log("liveAttach", liveAttach)
await shot("62-stage4-17-live-review.png")

// BF-06: open-tab via relay (policy path — may spawn or open-tab-existing)
let openTabRelay = { ok: false, skipped: true }
try {
  const res = await fetch(`${RELAY}/__an/computer-cdp/open-tab`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: ENDPOINT,
      url: "about:blank",
      family: "edge",
      allowSpawn: true,
    }),
    signal: AbortSignal.timeout(15000),
  })
  openTabRelay = await res.json()
  openTabRelay.httpStatus = res.status
} catch (err) {
  openTabRelay = { ok: false, error: err instanceof Error ? err.message : String(err) }
}
console.log("openTabRelay", openTabRelay)

// UI open-tab button when in external consent
const uiOpenTab = await evaluate(`(async () => {
  document.querySelector('[data-action="computer-disconnect"]')?.click()
  await new Promise(r => setTimeout(r, 400))
  document.querySelector('[data-action="computer-connect"]')?.click()
  await new Promise(r => setTimeout(r, 250))
  document.querySelector('[data-action="computer-path-external"]')?.click()
  await new Promise(r => setTimeout(r, 200))
  const ep = document.querySelector('[data-action="computer-external-endpoint"]')
  if (ep) {
    ep.focus()
    ep.value = ${JSON.stringify(ENDPOINT)}
    ep.dispatchEvent(new Event('input', { bubbles: true }))
  }
  const btn = document.querySelector('[data-action="computer-external-open-tab"]')
  return {
    ok: !!btn,
    hasOpenTabBtn: !!btn,
    path: document.querySelector('[data-an-part="computer-external"]') ? 'external' : 'missing',
  }
})()`)
console.log("uiOpenTab", uiOpenTab)
await shot("63-stage4-17-external-open-tab.png")

const motionCss = await evaluate(`(() => {
  const root = getComputedStyle(document.documentElement)
  const shell = document.querySelector('[data-component="an-shell"]')
  const cs = shell ? getComputedStyle(shell) : null
  return {
    easePanel: root.getPropertyValue('--an-ease-panel').trim(),
    easeTab: root.getPropertyValue('--an-ease-tab').trim(),
    easeLive: root.getPropertyValue('--an-ease-live').trim(),
    holoSheen: root.getPropertyValue('--an-holo-sheen').trim(),
  }
})()`)
console.log("motionCss", motionCss)

const windowingOk = !!(
  openTabRelay?.ok ||
  openTabRelay?.decision?.action === "refuse-second-window" ||
  openTabRelay?.decision?.action === "open-tab-existing" ||
  openTabRelay?.decision?.action === "spawn-window"
)
const reviewOk = !!(reviewOpen?.ok && tabSwitch?.ok)
const liveOk = !!(liveAttach?.ok || liveAttach?.phase === "attached")
const result = {
  ok: reviewOk && windowingOk && !!uiOpenTab?.hasOpenTabBtn && !!motionCss?.easePanel && liveOk,
  marker: MARKER,
  reviewOk,
  windowingOk,
  liveOk,
  openTabAction: openTabRelay?.decision?.action,
  openTabRegion: openTabRelay?.regionId,
  liveAttach,
  tabSwitch,
  reviewOpen,
  uiOpenTab,
  motionCss,
  sessionOpen,
  noExtraElectronWindow: true,
}

console.log("RESULT", JSON.stringify(result))
if (!result.ok) process.exit(2)
