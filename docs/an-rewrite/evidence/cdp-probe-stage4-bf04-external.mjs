/**
 * AP-BF-04 live CDP: Connect → My Edge/Chrome path → loopback endpoint + region → Confirm.
 * Verify external Live + feed + ownership; Disconnect clears. Local path non-regress brief.
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

const REGION = "AP_BF04_REGION_1"
const ENDPOINT = "http://127.0.0.1:9333"

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
  const badge = panel?.querySelector('.an-computer-badge')
  const cursor = panel?.querySelector('[data-an-part="computer-cursor"]')
  const feed = panel?.querySelector('[data-an-part="computer-feed"]')
  const pathExternal = panel?.querySelector('[data-action="computer-path-external"]')
  const pathLocal = panel?.querySelector('[data-action="computer-path-local"]')
  const composer = document.querySelector('[data-an-owned="composer"]')
  const stream = document.querySelector('[data-an-own-conversation="true"]')
  const contraptionsNav = document.querySelector('[data-nav="contraptions"], [data-an-nav="contraptions"], button[data-id="contraptions"]')
  return {
    mode: shell?.getAttribute('data-mode') || null,
    live: badge?.getAttribute('data-live') || null,
    phase: panel?.getAttribute('data-attach-phase') || null,
    path: panel?.getAttribute('data-attach-path') || null,
    backend: panel?.getAttribute('data-backend') || null,
    externalEndpoint: panel?.getAttribute('data-external-endpoint') || null,
    externalRegion: panel?.getAttribute('data-external-region') || null,
    controller: panel?.getAttribute('data-controller') || null,
    userInput: panel?.getAttribute('data-user-input') || null,
    hasCursor: !!cursor,
    hasFeed: !!feed,
    feedActive: panel?.getAttribute('data-feed-active') || null,
    pathExternalActive: pathExternal?.getAttribute('data-active') || null,
    pathLocalActive: pathLocal?.getAttribute('data-active') || null,
    composerOwned: !!composer,
    streamOwned: !!stream,
    hasContraptionsNav: !!contraptionsNav,
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
await sleep(350)

await evaluate(`(() => {
  const btn = document.querySelector('[data-action="computer-path-external"]')
  if (btn) btn.click()
  return !!btn
})()`)
await sleep(250)

const consenting = await evaluate(probe)
console.log("consentingExternal", consenting)
await shot("35-bf04-external-consent.png")

await evaluate(`((endpoint, region) => {
  const family = document.querySelector('[data-action="computer-external-family"]')
  if (family) {
    family.value = 'edge'
    family.dispatchEvent(new Event('change', { bubbles: true }))
  }
  const ep = document.querySelector('[data-action="computer-external-endpoint"]')
  if (ep) {
    ep.focus()
    ep.value = endpoint
    ep.dispatchEvent(new Event('input', { bubbles: true }))
  }
  const reg = document.querySelector('[data-action="computer-external-region"]')
  if (reg) {
    reg.focus()
    reg.value = region
    reg.dispatchEvent(new Event('input', { bubbles: true }))
  }
  return {
    family: family?.value || null,
    endpoint: ep?.value || null,
    region: reg?.value || null,
  }
})(${JSON.stringify(ENDPOINT)}, ${JSON.stringify(REGION)})`)
await sleep(300)

await evaluate(`(() => {
  const btn = document.querySelector('[data-action="computer-confirm"]')
  if (btn) btn.click()
  return !!btn
})()`)
await sleep(550)

const liveExternal = await evaluate(probe)
console.log("liveExternal", liveExternal)
await shot("36-bf04-external-live.png")

await evaluate(`(() => {
  const btn = document.querySelector('.an-mode-btn[data-mode="takeover"]')
  if (btn) btn.click()
  return !!btn
})()`)
await sleep(450)

const takeover = await evaluate(probe)
console.log("takeoverExternal", takeover)
await shot("37-bf04-external-takeover.png")

await evaluate(`(() => {
  const btn = document.querySelector('[data-action="computer-stop-takeover"]')
  if (btn) btn.click()
  return !!btn
})()`)
await sleep(400)

await evaluate(`(() => {
  const btn = document.querySelector('[data-action="computer-disconnect"]')
  if (btn) btn.click()
  return !!btn
})()`)
await sleep(400)

const afterDisconnect = await evaluate(probe)
console.log("afterDisconnect", afterDisconnect)
await shot("38-bf04-external-disconnected.png")

// Local path non-regress (BF-01 still works)
await evaluate(`(() => {
  const btn = document.querySelector('[data-action="computer-connect"]')
  if (btn) btn.click()
  return !!btn
})()`)
await sleep(300)
await evaluate(`(() => {
  const btn = document.querySelector('[data-action="computer-path-local"]')
  if (btn) btn.click()
  return !!btn
})()`)
await sleep(200)
await evaluate(`(() => {
  const btn = document.querySelector('[data-action="computer-confirm"]')
  if (btn) btn.click()
  return !!btn
})()`)
await sleep(450)
const liveLocal = await evaluate(probe)
console.log("liveLocal", liveLocal)
await evaluate(`(() => {
  const btn = document.querySelector('[data-action="computer-disconnect"]')
  if (btn) btn.click()
  return !!btn
})()`)
await sleep(300)

const marker = `AP-BF-04 external ${Date.now()}`
const externalOk =
  liveExternal?.live === "true" &&
  liveExternal?.backend === "external-chromium" &&
  liveExternal?.path === "external-chromium" &&
  liveExternal?.externalEndpoint === ENDPOINT &&
  liveExternal?.externalRegion === REGION &&
  liveExternal?.hasFeed === true &&
  liveExternal?.hasCursor === true &&
  liveExternal?.controller === "bot" &&
  liveExternal?.userInput === "false" &&
  liveExternal?.composerOwned === true &&
  liveExternal?.streamOwned === true

const takeoverOk =
  takeover?.live === "true" &&
  takeover?.controller === "user" &&
  takeover?.userInput === "true" &&
  takeover?.hasCursor === false

const disconnectOk =
  afterDisconnect?.live === "false" &&
  afterDisconnect?.phase === "disconnected" &&
  !afterDisconnect?.externalEndpoint &&
  afterDisconnect?.hasFeed === false

const localOk =
  liveLocal?.live === "true" &&
  liveLocal?.backend === "local-browser" &&
  liveLocal?.path === "local-browser"

const ownershipOk = liveExternal?.composerOwned === true && liveExternal?.streamOwned === true

const ok = externalOk && takeoverOk && disconnectOk && localOk && ownershipOk
console.log(
  "RESULT",
  JSON.stringify({
    ok,
    externalOk,
    takeoverOk,
    disconnectOk,
    localOk,
    ownershipOk,
    marker,
    endpoint: ENDPOINT,
    region: REGION,
  }),
)

ws.close()
process.exit(ok ? 0 : 2)
