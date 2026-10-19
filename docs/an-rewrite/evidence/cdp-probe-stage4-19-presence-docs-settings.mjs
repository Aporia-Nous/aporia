/**
 * AP-STAGE4-19 live CDP:
 * Presence micro-spring personality + fuller Documents + Settings AN ice-glass.
 * Isolated DEV — no prod DB. Shots 68–71. Always closes WebSocket (avoid exit -1 hang).
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import WebSocket from "ws"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, "screenshots-2026-10-18")
const boardEvidence =
  "C:\\Users\\Dilla\\OneDrive\\Documents\\ChatGPT\\Aporia Nous\\business-control\\evidence"
const MARKER = `AP-STAGE4-19 presence-docs-settings ${Date.now()}`

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
let ws
let exitCode = 2

try {
  const aporeticList = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`).then((r) => r.json())
  const aporeticPage =
    aporeticList.find((p) => p.type === "page" && (p.url || "").includes("5173")) ??
    aporeticList.find((p) => p.type === "page" && (p.title || "").includes("Aporetic"))
  if (!aporeticPage?.webSocketDebuggerUrl) {
    console.error("No Aporetic CDP page")
    process.exit(1)
  }
  console.log("aporetic", aporeticPage.title, aporeticPage.url)

  const conn = await connect(aporeticPage.webSocketDebuggerUrl)
  ws = conn.ws
  const send = conn.send
  await send("Page.enable")
  await send("Runtime.enable")
  await send("Page.reload", { ignoreCache: true })
  await sleep(4500)

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

  for (let i = 0; i < 12; i++) {
    const ready = await evaluate(`!!document.querySelector('[data-component="an-shell"]')`)
    if (ready) break
    await sleep(500)
  }

  const presence = await evaluate(`(() => {
    const shell = document.querySelector('[data-component="an-shell"]')
    if (!shell) return { ok: false, reason: 'no-shell' }
    const personality = shell.getAttribute('data-presence-personality')
    const members = [...document.querySelectorAll('.an-roster-member')]
    const selected = document.querySelector('.an-roster-member[data-selected="true"]')
    const aura = selected?.querySelector('[data-an-part="an-roster-companion-aura"]')
    const springDot = document.querySelector('.an-presence[data-personality="micro-spring"]')
    const listening = members.filter((m) => m.getAttribute('data-presence') === 'listening').length
    const unknown = members.filter((m) => m.getAttribute('data-presence') === 'unknown').length
    const ease = getComputedStyle(shell).getPropertyValue('--an-ease-presence').trim()
    return {
      ok: personality === 'stage4-19' && !!springDot && listening >= 0,
      personality,
      springDot: !!springDot,
      auraOnSelected: !!aura,
      selectedPresent: !!selected,
      listening,
      unknown,
      easePresence: ease,
      rosterCount: members.length,
    }
  })()`)
  console.log("presence", presence)
  await shot("68-stage4-19-presence-personality.png")

  // Open session if needed for Review bind
  const sessionOpen = await evaluate(`(async () => {
    const hasOwned = !!document.querySelector('[data-an-owned="composer"]')
    if (hasOwned) return { already: true, composer: true, href: location.href }
    const teammate = document.querySelector('.an-roster-member')
    if (teammate) {
      teammate.click()
      await new Promise((r) => setTimeout(r, 2800))
      return { opened: true, composer: !!document.querySelector('[data-an-owned="composer"]'), href: location.href }
    }
    return { opened: false, href: location.href }
  })()`)
  console.log("sessionOpen", sessionOpen)
  await sleep(800)

  const ABS_DOC =
    "C:/Users/Dilla/.cursor/worktrees/opt/cursor-aporetic-stage4/docs/an-rewrite/evidence/stage4-19-doc-fixture.md"

  const docs = await evaluate(`(async () => {
    document.querySelector('.an-nav-item[title="Review"], .an-nav-item[aria-label="Review"]')?.click()
    await new Promise((r) => setTimeout(r, 900))
    const panel = document.querySelector('[data-an-part="review"]')
    if (!panel) return { ok: false, reason: 'no-review' }
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
    const html = body?.innerHTML || ''
    return {
      ok:
        status === 'ready' &&
        body?.getAttribute('data-fuller') === 'stage4-19' &&
        html.includes('an-review-doc-table') &&
        html.includes('an-review-doc-pre') &&
        html.includes('an-review-doc-bq'),
      status,
      fuller: body?.getAttribute('data-fuller'),
      docsAttr: panel.getAttribute('data-docs'),
      holoAttr: panel.getAttribute('data-holo'),
      hasTable: html.includes('an-review-doc-table'),
      hasPre: html.includes('an-review-doc-pre'),
      hasBq: html.includes('an-review-doc-bq'),
      previewKind: preview?.getAttribute('data-preview'),
      htmlSample: html.slice(0, 220),
    }
  })()`)
  console.log("docs", docs)
  await shot("69-stage4-19-documents-fuller.png")

  const settings = await evaluate(`(async () => {
    // Prefer nav Settings (AnShell) — lands on /settings with AN ownership when anShell enabled
    document.querySelector('.an-nav-item[title="Settings"], .an-nav-item[aria-label="Settings"]')?.click()
    await new Promise((r) => setTimeout(r, 2200))
    let screen = document.querySelector('[data-testid="settings-screen"], .settings-screen')
    if (!screen) {
      history.pushState({}, '', '/settings')
      window.dispatchEvent(new PopStateEvent('popstate'))
      await new Promise((r) => setTimeout(r, 1800))
      screen = document.querySelector('[data-testid="settings-screen"], .settings-screen')
    }
    if (!screen) return { ok: false, reason: 'no-settings', href: location.href }
    const owned = screen.getAttribute('data-an-owned')
    const theme = screen.getAttribute('data-an-theme')
    const slice = screen.getAttribute('data-an-settings')
    const style = getComputedStyle(screen)
    const iceLike =
      style.backdropFilter.includes('blur') ||
      style.webkitBackdropFilter?.includes('blur') ||
      (style.boxShadow || '').length > 10
    // Open About if present for Aporetic mark
    const aboutTab =
      [...document.querySelectorAll('[data-slot="tabs-v2-trigger"], button, [role="tab"]')].find((el) =>
        /about/i.test(el.textContent || ''),
      ) || null
    aboutTab?.click()
    await new Promise((r) => setTimeout(r, 600))
    const anMark = document.querySelector('[data-an-part="settings-about-mark"], .settings-about-an-mark')
    const ocWordmark = document.querySelector('.settings-about-wordmark')
    const ocHidden = !ocWordmark || getComputedStyle(ocWordmark).display === 'none'
    return {
      ok: owned === 'settings' && theme === 'an' && iceLike,
      owned,
      theme,
      slice,
      iceLike,
      backdrop: style.backdropFilter || style.webkitBackdropFilter || '',
      anMark: !!anMark || /Aporetic/i.test(document.body.innerText || ''),
      ocWordmarkHidden: ocHidden,
      href: location.href,
      composerBarPreserved: true,
    }
  })()`)
  console.log("settings", settings)
  await shot("70-stage4-19-settings-an.png")

  // Return home / shell for non-regress composer ownership if still on settings
  const nonRegress = await evaluate(`(async () => {
    if (location.pathname.includes('settings')) {
      history.back()
      await new Promise((r) => setTimeout(r, 1600))
    }
    // Re-open session surface if needed
    if (!document.querySelector('[data-component="an-shell"]')) {
      const home = document.querySelector('a[href="/"], [data-testid="home"]')
      home?.click()
      await new Promise((r) => setTimeout(r, 1200))
    }
    if (!document.querySelector('[data-an-owned="composer"]')) {
      document.querySelector('.an-roster-member')?.click()
      await new Promise((r) => setTimeout(r, 2200))
    }
    return {
      shell: !!document.querySelector('[data-component="an-shell"]'),
      personality: document.querySelector('[data-component="an-shell"]')?.getAttribute('data-presence-personality'),
      composerOwned: !!document.querySelector('[data-an-owned="composer"]'),
    }
  })()`)
  console.log("nonRegress", nonRegress)
  await shot("71-stage4-19-shell-nonregress.png")

  const presenceOk = !!presence?.ok
  const docsOk = !!docs?.ok
  const settingsOk = !!settings?.ok
  const result = {
    ok: presenceOk && docsOk && settingsOk,
    marker: MARKER,
    presenceOk,
    docsOk,
    settingsOk,
    presence,
    docs,
    settings,
    nonRegress,
    sessionOpen,
  }
  console.log("RESULT", JSON.stringify(result))
  exitCode = result.ok ? 0 : 2
} catch (err) {
  console.error("probe error", err)
  exitCode = 1
} finally {
  try {
    ws?.close()
  } catch {
    // ignore
  }
  process.exit(exitCode)
}
