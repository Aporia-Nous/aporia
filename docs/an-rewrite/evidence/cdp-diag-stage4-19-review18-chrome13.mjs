/**
 * Evidence-only: STAGE4-18 Review panel + STAGE4-13 composer chrome markers.
 * Closes ws.
 */
import WebSocket from "ws"

const CDP_PORT = process.env.APORETIC_CDP_PORT || "9223"
let ws
let exitCode = 2

function connect(wsUrl) {
  const sock = new WebSocket(wsUrl)
  let id = 0
  const pending = new Map()
  function send(method, params = {}) {
    const msgId = ++id
    return new Promise((resolve, reject) => {
      pending.set(msgId, { resolve, reject })
      sock.send(JSON.stringify({ id: msgId, method, params }))
    })
  }
  sock.on("message", (data) => {
    const msg = JSON.parse(String(data))
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id).resolve(msg)
      pending.delete(msg.id)
    }
  })
  return new Promise((resolve, reject) => {
    sock.on("open", () => resolve({ ws: sock, send }))
    sock.on("error", reject)
  })
}

try {
  const list = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`).then((r) => r.json())
  const page =
    list.find((p) => p.type === "page" && (p.url || "").includes("5173")) ??
    list.find((p) => p.type === "page")
  const conn = await connect(page.webSocketDebuggerUrl)
  ws = conn.ws
  const send = conn.send
  await send("Runtime.enable")
  const ev = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })
    return r.result?.result?.value ?? null
  }

  await ev(`(async () => {
    if (document.querySelector('[data-testid="settings-screen"], .settings-screen')) {
      const back = [...document.querySelectorAll('a,button')].find((el) => /back to app/i.test(el.textContent || ''))
      back?.click()
      await new Promise((r) => setTimeout(r, 1800))
    }
    // Close Contraptions if open
    const close = document.querySelector('[data-an-part="contraptions"] [data-action="close"], [data-an-part="contraptions"] button')
    const x = [...document.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === '×')
    x?.click()
    await new Promise((r) => setTimeout(r, 400))
  })()`)

  const chrome13 = await ev(`(async () => {
    if (!document.querySelector('[data-an-owned="composer"]')) {
      document.querySelector('.an-roster-member')?.click()
      await new Promise((r) => setTimeout(r, 2400))
    }
    const owned = document.querySelector('[data-an-owned="composer"]')
    const host = owned || document.querySelector('[data-an-part="composer-dock"]')
    const markers = {
      owned: owned?.getAttribute('data-an-owned'),
      chrome: owned?.getAttribute('data-an-composer-chrome') || host?.getAttribute('data-an-composer-chrome'),
      slice: owned?.getAttribute('data-an-composer') || host?.getAttribute('data-an-composer'),
    }
    const text = (owned?.innerText || host?.innerText || '').slice(0, 200)
    const hideChips = !owned?.querySelector('[data-component="prompt-input-chips"], .prompt-input-chips')
    const sendBtn = owned?.querySelector('button[type="submit"], [data-action="send"], button')
    return {
      ok: !!owned,
      markers,
      textSample: text,
      hideChipsGuess: hideChips,
      hasOwnedComposer: !!owned,
    }
  })()`)
  console.log("chrome13", JSON.stringify(chrome13))

  const review18 = await ev(`(async () => {
    // Try title, aria, and text match for Review nav
    const nav =
      document.querySelector('.an-nav-item[title="Review"], .an-nav-item[aria-label="Review"]') ||
      [...document.querySelectorAll('.an-nav-item, [data-an-part="nav"] button, nav button')].find((el) =>
        /review/i.test(el.getAttribute('title') || el.getAttribute('aria-label') || el.textContent || ''),
      )
    nav?.click()
    await new Promise((r) => setTimeout(r, 1200))
    let panel = document.querySelector('[data-an-part="review"]')
    if (!panel) {
      nav?.click()
      await new Promise((r) => setTimeout(r, 1200))
      panel = document.querySelector('[data-an-part="review"]')
    }
    if (!panel) {
      return {
        ok: false,
        reason: 'no-review',
        navFound: !!nav,
        navTitle: nav?.getAttribute('title') || nav?.getAttribute('aria-label') || null,
        anParts: [...document.querySelectorAll('[data-an-part]')].map((el) => el.getAttribute('data-an-part')).slice(0, 30),
      }
    }
    const tabs = {
      browser: !!document.querySelector('[data-action="review-tab-browser"]'),
      code: !!document.querySelector('[data-action="review-tab-code"]'),
      files: !!document.querySelector('[data-action="review-tab-files"]'),
      documents: !!document.querySelector('[data-action="review-tab-documents"]'),
    }
    document.querySelector('[data-action="review-tab-code"]')?.click()
    await new Promise((r) => setTimeout(r, 250))
    const codeInput = !!document.querySelector('[data-an-part="review-code-path-input"]')
    document.querySelector('[data-action="review-tab-documents"]')?.click()
    await new Promise((r) => setTimeout(r, 250))
    const docInput = !!document.querySelector('[data-an-part="review-document-path-input"]')
    return {
      ok: tabs.code && tabs.documents && codeInput && docInput,
      tabs,
      codeInput,
      docInput,
      holo: panel.getAttribute('data-holo'),
      docs: panel.getAttribute('data-docs'),
      motion: panel.getAttribute('data-motion') || null,
    }
  })()`)
  console.log("review18", JSON.stringify(review18))

  const result = {
    ok: !!chrome13?.ok && !!review18?.ok,
    marker: `AP-STAGE4-19 review18-chrome13 ${Date.now()}`,
    chrome13,
    review18,
  }
  console.log("RESULT", JSON.stringify(result))
  exitCode = result.ok ? 0 : 2
} catch (err) {
  console.error(err)
  exitCode = 1
} finally {
  try {
    ws?.close()
  } catch {
    // ignore
  }
  process.exit(exitCode)
}
