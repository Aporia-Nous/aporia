/**
 * AP-BF-05 live CDP: Create consented pixel target → external attach → wait for
 * real screencast frames in Computer View → Disconnect clears. Local iframe path non-regress.
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

/** Consented user-launched Edge on loopback (separate from Aporetic Electron CDP :9222). */
const ENDPOINT = "http://127.0.0.1:9333"

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

const edgeList = await fetch(`${ENDPOINT}/json/list`).then((r) => r.json())
const pixelPage =
  edgeList.find((p) => p.type === "page" && (p.title || "").includes("AP-BF-05")) ??
  edgeList.find((p) => p.type === "page")
if (!pixelPage?.id || !pixelPage?.webSocketDebuggerUrl) {
  console.error("No consented Edge page on :9333 — launch Edge with --remote-debugging-port=9333 first")
  process.exit(1)
}
const REGION = pixelPage.id
console.log("pixelPage", pixelPage.id, pixelPage.title, (pixelPage.url || "").slice(0, 80))
console.log("REGION", REGION)

const { ws, send } = await connect(aporeticPage.webSocketDebuggerUrl)
await send("Page.enable")
await send("Runtime.enable")
await send("Page.reload", { ignoreCache: true })
await sleep(2500)

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

const probe = `(() => {
  const shell = document.querySelector('[data-component="an-shell"]')
  const panel = document.querySelector('[data-an-part="computer-attach"]')
  const badge = panel?.querySelector('.an-computer-badge')
  const cursor = panel?.querySelector('[data-an-part="computer-cursor"]')
  const feed = panel?.querySelector('[data-an-part="computer-feed"]')
  const frame = panel?.querySelector('[data-an-part="computer-screencast-frame"]')
  const status = panel?.querySelector('[data-an-part="computer-screencast-status"]')
  const composer = document.querySelector('[data-an-owned="composer"]')
  const stream = document.querySelector('[data-an-own-conversation="true"]')
  const contraptionsNav = document.querySelector('[data-nav="contraptions"], [data-an-nav="contraptions"], button[data-id="contraptions"]')
  const src = frame?.getAttribute('src') || ''
  return {
    mode: shell?.getAttribute('data-mode') || null,
    live: badge?.getAttribute('data-live') || null,
    phase: panel?.getAttribute('data-attach-phase') || null,
    path: panel?.getAttribute('data-attach-path') || null,
    backend: panel?.getAttribute('data-backend') || null,
    externalEndpoint: panel?.getAttribute('data-external-endpoint') || null,
    externalRegion: panel?.getAttribute('data-external-region') || null,
    pixelSource: panel?.getAttribute('data-pixel-source') || null,
    screencastPhase: panel?.getAttribute('data-screencast-phase') || null,
    screencastFrames: panel?.getAttribute('data-screencast-frames') || null,
    controller: panel?.getAttribute('data-controller') || null,
    userInput: panel?.getAttribute('data-user-input') || null,
    hasCursor: !!cursor,
    hasFeed: !!feed,
    hasScreencastFrame: !!frame,
    frameSrcLen: src.length,
    frameIsDataUrl: src.startsWith('data:image/'),
    statusText: status?.textContent?.slice(0, 120) || null,
    feedActive: panel?.getAttribute('data-feed-active') || null,
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
await sleep(1000)

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

await evaluate(`((endpoint, region) => {
  const family = document.querySelector('[data-action="computer-external-family"]')
  if (family) {
    family.value = 'chrome'
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
  return { endpoint: ep?.value || null, region: reg?.value || null }
})(${JSON.stringify(ENDPOINT)}, ${JSON.stringify(REGION)})`)
await sleep(300)

await shot("56-bf05-external-consent.png")

await evaluate(`(() => {
  const btn = document.querySelector('[data-action="computer-confirm"]')
  if (btn) btn.click()
  return !!btn
})()`)

let streaming = null
for (let i = 0; i < 20; i++) {
  await sleep(500)
  streaming = await evaluate(probe)
  console.log("wait", i, {
    live: streaming?.live,
    phase: streaming?.screencastPhase,
    pixelSource: streaming?.pixelSource,
    frames: streaming?.screencastFrames,
    frameSrcLen: streaming?.frameSrcLen,
    status: streaming?.statusText,
  })
  if (
    streaming?.live === "true" &&
    streaming?.screencastPhase === "streaming" &&
    streaming?.pixelSource === "cdp-screencast" &&
    streaming?.frameIsDataUrl &&
    streaming?.frameSrcLen > 200
  ) {
    break
  }
}

console.log("streaming", streaming)
await shot("57-bf05-screencast-live.png")

await evaluate(`(() => {
  const btn = document.querySelector('.an-mode-btn[data-mode="takeover"]')
  if (btn) btn.click()
  return !!btn
})()`)
await sleep(450)
const takeover = await evaluate(probe)
console.log("takeover", takeover)
await shot("58-bf05-screencast-takeover.png")

await evaluate(`(() => {
  const btn = document.querySelector('[data-action="computer-stop-takeover"]')
  if (btn) btn.click()
  return !!btn
})()`)
await sleep(350)

await evaluate(`(() => {
  const btn = document.querySelector('[data-action="computer-disconnect"]')
  if (btn) btn.click()
  return !!btn
})()`)
await sleep(450)

const afterDisconnect = await evaluate(probe)
console.log("afterDisconnect", afterDisconnect)
await shot("59-bf05-screencast-disconnected.png")

// Local iframe pixel path non-regress
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
await sleep(500)
const liveLocal = await evaluate(probe)
console.log("liveLocal", liveLocal)
await evaluate(`(() => {
  const btn = document.querySelector('[data-action="computer-disconnect"]')
  if (btn) btn.click()
  return !!btn
})()`)
await sleep(300)

const marker = `AP-BF-05 screencast ${Date.now()}`
const screencastOk =
  streaming?.live === "true" &&
  streaming?.backend === "external-chromium" &&
  streaming?.externalEndpoint === ENDPOINT &&
  streaming?.externalRegion === REGION &&
  streaming?.screencastPhase === "streaming" &&
  streaming?.pixelSource === "cdp-screencast" &&
  streaming?.hasScreencastFrame === true &&
  streaming?.frameIsDataUrl === true &&
  Number(streaming?.screencastFrames || 0) >= 1 &&
  streaming?.composerOwned === true &&
  streaming?.streamOwned === true

const takeoverOk =
  takeover?.live === "true" &&
  takeover?.controller === "user" &&
  takeover?.userInput === "true" &&
  takeover?.hasCursor === false

const disconnectOk =
  afterDisconnect?.live === "false" &&
  afterDisconnect?.phase === "disconnected" &&
  afterDisconnect?.screencastPhase === "idle" &&
  afterDisconnect?.hasScreencastFrame === false &&
  afterDisconnect?.hasFeed === false

const localOk =
  liveLocal?.live === "true" &&
  liveLocal?.backend === "local-browser" &&
  liveLocal?.pixelSource === "iframe"

const ok = screencastOk && takeoverOk && disconnectOk && localOk
console.log(
  "RESULT",
  JSON.stringify({
    ok,
    screencastOk,
    takeoverOk,
    disconnectOk,
    localOk,
    marker,
    endpoint: ENDPOINT,
    region: REGION,
    frames: streaming?.screencastFrames,
    frameSrcLen: streaming?.frameSrcLen,
  }),
)

ws.close()
process.exit(ok ? 0 : 2)
