/**
 * AP-STAGE4-4E live CDP: open Contraptions nav under AnShell; verify mount + ownership markers.
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

const probeExpr = `(() => {
  const shell = document.querySelector('[data-component="an-shell"]')
  const nav = [...document.querySelectorAll('.an-nav-item')]
  const contraptionsNav = nav.find((b) => (b.getAttribute('aria-label') || b.title || '').toLowerCase().includes('contraption'))
  const panel = document.querySelector('[data-an-part="contraptions"]')
  const flows = document.querySelector('[data-component="aporia-flows"]')
  const dock = document.querySelector('[data-component="session-composer-dock"]')
  const streamOwn = document.querySelector('[data-an-own-conversation="true"]')
  const composerOnly = !!document.querySelector('.an-stream-legacy--composer-only')
  const sub = panel?.querySelector('.an-contraptions-sub')
  const redstone = sub?.getAttribute('title') || ''
  const bodyText = (panel?.innerText || '').slice(0, 400)
  return {
    hasShell: !!shell,
    navLabels: nav.map((b) => b.getAttribute('aria-label') || b.title || ''),
    hasContraptionsNav: !!contraptionsNav,
    navActive: contraptionsNav?.getAttribute('data-active') === 'true',
    panelOpen: !!panel,
    panelDisplay: panel ? getComputedStyle(panel).display : null,
    panelW: panel ? Math.round(panel.getBoundingClientRect().width) : 0,
    panelH: panel ? Math.round(panel.getBoundingClientRect().height) : 0,
    hasFlows: !!flows,
    subtitle: sub?.textContent?.trim() || null,
    redstone,
    bodyHasAutomations: /Automations\\s*&\\s*integrations/i.test(bodyText),
    bodyHasContraptions: /Contraptions/i.test(bodyText),
    ownedComposer: dock?.getAttribute('data-an-owned') || null,
    streamOwn: !!streamOwn,
    composerOnly,
  }
})()`

let before = await evaluate(probeExpr)
console.log("before", JSON.stringify(before, null, 2))

if (!before?.hasShell) {
  console.error("AnShell not mounted — cannot verify 4E")
  process.exit(2)
}

const opened = await evaluate(`(() => {
  const nav = [...document.querySelectorAll('.an-nav-item')]
  const btn = nav.find((b) => (b.getAttribute('aria-label') || b.title || '').toLowerCase().includes('contraption'))
  if (!btn) return { ok: false, reason: 'no Contraptions nav' }
  btn.click()
  return { ok: true }
})()`)
console.log("click", opened)

let after = null
for (let i = 0; i < 20; i++) {
  await new Promise((r) => setTimeout(r, 250))
  after = await evaluate(probeExpr)
  if (after?.panelOpen && after?.panelW > 200) break
}
console.log("after", JSON.stringify(after, null, 2))

await shot("25-contraptions-mounted-dev.png")

// Core 4E: Contraptions visible/usable under AnShell. Composer/stream ownership
// markers apply only when a session is open (STAGE4-11/12) — do not fail home/draft.
const mountOk =
  !!after?.hasShell &&
  !!after?.hasContraptionsNav &&
  !!after?.panelOpen &&
  after.panelW > 200 &&
  after.panelH > 200 &&
  !!after?.bodyHasContraptions &&
  !!after?.bodyHasAutomations &&
  /redstone/i.test(after?.redstone || "")

const sessionContext = !!after?.ownedComposer || !!after?.composerOnly || !!after?.streamOwn
const ownershipOk = !sessionContext
  ? true
  : after?.ownedComposer === "composer" && after?.composerOnly === true

const ok = mountOk && ownershipOk

console.log(
  "RESULT",
  JSON.stringify({
    ok,
    mountOk,
    ownershipOk,
    sessionContext,
    after: {
      hasContraptionsNav: after?.hasContraptionsNav,
      panelOpen: after?.panelOpen,
      panelW: after?.panelW,
      panelH: after?.panelH,
      subtitle: after?.subtitle,
      redstone: after?.redstone,
      ownedComposer: after?.ownedComposer,
      composerOnly: after?.composerOnly,
      streamOwn: after?.streamOwn,
      hasFlows: after?.hasFlows,
    },
  }),
)

ws.close()
process.exit(ok ? 0 : 3)
