/**
 * AP-STAGE4-18 live CDP:
 * Deeper holographic ice motion + Review Code/Documents bind to real viewable content.
 * Isolated DEV — no prod DB. Shots 64–67 under screenshots-2026-10-18/.
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import WebSocket from "ws"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, "screenshots-2026-10-18")
const boardEvidence =
  "C:\\Users\\Dilla\\OneDrive\\Documents\\ChatGPT\\Aporia Nous\\business-control\\evidence"
const MARKER = `AP-STAGE4-18 holo-bind ${Date.now()}`

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

const CDP_PORT = process.env.APORETIC_CDP_PORT || "9223"
const aporeticList = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`).then((r) => r.json())
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
await sleep(4500)

// Wait for AnShell (home or session) after hard reload
for (let i = 0; i < 12; i++) {
  const ready = await evaluate(`!!document.querySelector('[data-component="an-shell"]')`)
  if (ready) break
  await sleep(500)
}

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
  const hasOwned = !!document.querySelector('[data-an-owned="composer"]')
  const alreadySession = /\\/session\\//.test(location.href) || hasOwned
  if (alreadySession && hasOwned) return { opened: false, already: true, href: location.href }
  const link = document.querySelector('a[href*="/session/"], [data-component="session-row"], .session-list a')
  if (link) {
    link.click()
    await new Promise((r) => setTimeout(r, 2200))
    return { opened: true, via: 'session-link', href: location.href, composer: !!document.querySelector('[data-an-owned="composer"]') }
  }
  const teammate = document.querySelector('.an-roster-member')
  if (teammate) {
    teammate.click()
    await new Promise((r) => setTimeout(r, 2800))
    return {
      opened: true,
      via: 'roster',
      href: location.href,
      composer: !!document.querySelector('[data-an-owned="composer"]'),
    }
  }
  return { opened: false, already: false, href: location.href }
})()`)
console.log("sessionOpen", sessionOpen)
await sleep(1200)

const shellOk = await evaluate(`!!document.querySelector('[data-component="an-shell"]')`)
if (!shellOk) {
  console.error("AnShell not mounted")
  process.exit(1)
}

// Prefer a real workspace directory for Review file reads (home directory is empty).
if (!sessionOpen?.composer && !/session/.test(sessionOpen?.href || "")) {
  const forceRoster = await evaluate(`(async () => {
    const teammate = document.querySelector('.an-roster-member')
    if (!teammate) return { ok: false }
    teammate.click()
    await new Promise((r) => setTimeout(r, 2800))
    return { ok: true, href: location.href, composer: !!document.querySelector('[data-an-owned="composer"]') }
  })()`)
  console.log("forceRoster", forceRoster)
  await sleep(800)
}

const reviewToggle = await evaluate(`(() => {
  const btn = document.querySelector('.an-nav-item[aria-label="Review"], .an-nav-item[title="Review"]')
  if (!btn) return { ok: false, reason: 'no-review-nav' }
  btn.click()
  return { ok: true }
})()`)
console.log("reviewToggle", reviewToggle)
await sleep(900)

const holoOpen = await evaluate(`(() => {
  const panel = document.querySelector('[data-an-part="review"]')
  if (!panel) return { ok: false, reason: 'no-panel' }
  const root = getComputedStyle(document.documentElement)
  const style = getComputedStyle(panel)
  const sweep = panel.querySelector('.an-review-holo-sweep')
  return {
    ok: true,
    holoAttr: panel.getAttribute('data-holo'),
    hasSweep: !!sweep,
    animation: style.animationName || '',
    easePanel: root.getPropertyValue('--an-ease-panel').trim(),
    easeHolo: root.getPropertyValue('--an-ease-holo').trim(),
    holoSheen: root.getPropertyValue('--an-holo-sheen').trim(),
    holoSweep: root.getPropertyValue('--an-holo-sweep').trim(),
    holoDepth: root.getPropertyValue('--an-holo-depth').trim(),
  }
})()`)
console.log("holoOpen", holoOpen)
await shot("64-stage4-18-holo-review-open.png")

// Absolute Stage4 worktree paths — binds even when session workspace ≠ this repo.
const ABS_CODE =
  "C:/Users/Dilla/.cursor/worktrees/opt/cursor-aporetic-stage4/packages/app/src/shell/an/tokens.ts"
const ABS_DOC =
  "C:/Users/Dilla/.cursor/worktrees/opt/cursor-aporetic-stage4/docs/an-rewrite/CURSOR-AP-STAGE4-17.md"

const codeBind = await evaluate(`(async () => {
  if (!document.querySelector('[data-an-part="review"]')) {
    document.querySelector('.an-nav-item[title="Review"]')?.click()
    await new Promise((r) => setTimeout(r, 700))
  }
  document.querySelector('[data-action="review-tab-code"]')?.click()
  await new Promise((r) => setTimeout(r, 300))
  const input = document.querySelector('[data-an-part="review-code-path-input"]')
  if (!input) return { ok: false, reason: 'no-code-input' }
  const path = ${JSON.stringify(ABS_CODE)}
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, path)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  document.querySelector('[data-action="review-code-open"]')?.click()
  await new Promise((r) => setTimeout(r, 2200))
  const editor = document.querySelector('[data-an-part="review-code-editor"]')
  const body = document.querySelector('[data-an-part="review-code-body"]')
  const status = editor?.getAttribute('data-status')
  const textSample = body?.textContent?.slice(0, 160) || ''
  const lineCount = body ? body.querySelectorAll('.an-review-code-line').length : 0
  const err = document.querySelector('[data-an-part="review-code-error"]')?.textContent || ''
  return {
    ok: status === 'ready' && lineCount > 5 && /AN |AN_|export|const|Stage 4/.test(textSample),
    status,
    lineCount,
    err,
    pathShown: document.querySelector('[data-an-part="review-code-path"]')?.textContent?.trim() || '',
    textSample,
    emptyShell: !!document.querySelector('[data-an-part="review-code-empty"]'),
  }
})()`)
console.log("codeBind", codeBind)
await sleep(300)
await shot("65-stage4-18-code-bound.png")

const docBind = await evaluate(`(async () => {
  if (!document.querySelector('[data-an-part="review"]')) {
    document.querySelector('.an-nav-item[title="Review"]')?.click()
    await new Promise((r) => setTimeout(r, 700))
  }
  document.querySelector('[data-action="review-tab-documents"]')?.click()
  await new Promise((r) => setTimeout(r, 300))
  const input = document.querySelector('[data-an-part="review-document-path-input"]')
  if (!input) return { ok: false, reason: 'no-doc-input' }
  const path = ${JSON.stringify(ABS_DOC)}
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, path)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  document.querySelector('[data-action="review-document-open"]')?.click()
  await new Promise((r) => setTimeout(r, 2200))
  const preview = document.querySelector('[data-an-part="review-document-preview"]')
  const body = document.querySelector('[data-an-part="review-document-body"]')
  const status = preview?.getAttribute('data-status')
  const htmlSample = body?.innerHTML?.slice(0, 180) || ''
  const err = document.querySelector('[data-an-part="review-document-error"]')?.textContent || ''
  return {
    ok: status === 'ready' && !!body && (htmlSample.includes('<h') || htmlSample.includes('<p')),
    status,
    hasBody: !!body,
    err,
    htmlSample,
    emptyShell: !!document.querySelector('[data-an-part="review-document-empty"]'),
    pathShown: document.querySelector('[data-an-part="review-document-title"]')?.textContent?.trim() || '',
  }
})()`)
console.log("docBind", docBind)
await sleep(300)
await shot("66-stage4-18-documents-bound.png")

// Files tab still present + non-regress STAGE4-12 composer ownership
const filesAndComposer = await evaluate(`(() => {
  document.querySelector('[data-action="review-tab-files"]')?.click()
  const files = document.querySelector('[data-an-part="review-files"]')
  return {
    filesOk: !!files,
    composerOwned: !!document.querySelector('[data-an-owned="composer"]'),
    reviewStillOpen: !!document.querySelector('[data-an-part="review"]'),
  }
})()`)
console.log("filesAndComposer", filesAndComposer)
await sleep(250)
await shot("67-stage4-18-files-holo.png")

const motionOk = !!(
  holoOpen?.ok &&
  holoOpen?.hasSweep &&
  holoOpen?.holoAttr === "stage4-18" &&
  holoOpen?.easePanel &&
  holoOpen?.easeHolo &&
  holoOpen?.holoSweep
)
const bindOk = !!(codeBind?.ok && docBind?.ok)
const result = {
  ok: motionOk && bindOk && !!filesAndComposer?.composerOwned,
  marker: MARKER,
  motionOk,
  bindOk,
  holoOpen,
  codeBind,
  docBind,
  filesAndComposer,
  sessionOpen,
}

console.log("RESULT", JSON.stringify(result))
if (!result.ok) process.exit(2)
