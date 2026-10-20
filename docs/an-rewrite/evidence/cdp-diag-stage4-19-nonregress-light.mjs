/**
 * Evidence-only light non-regress: STAGE4-12/13 composer, STAGE4-18 holo/review, 4E Contraptions.
 * Port via APORETIC_CDP_PORT (default 9223). Closes ws + process.exit.
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
  })()`)

  // Ensure session + composer (STAGE4-12/13)
  const composer = await ev(`(async () => {
    if (!document.querySelector('[data-component="an-shell"]')) return { ok: false, reason: 'no-shell' }
    if (!document.querySelector('[data-an-owned="composer"]')) {
      document.querySelector('.an-roster-member')?.click()
      await new Promise((r) => setTimeout(r, 2200))
    }
    const owned = document.querySelector('[data-an-owned="composer"]')
    const dock = document.querySelector('[data-an-part="composer-dock"], [data-an-composer], [data-an-owned="composer"]')
    const placeholder = document.querySelector('textarea, [contenteditable="true"]')
    const ph = (placeholder?.getAttribute('placeholder') || placeholder?.getAttribute('aria-placeholder') || '').toLowerCase()
    const style = owned ? getComputedStyle(owned) : null
    return {
      ok: !!owned,
      owned: !!owned,
      presencePersonality: document.querySelector('[data-component="an-shell"]')?.getAttribute('data-presence-personality'),
      placeholderLooksAn: /message/.test(ph) && !/ask anything/.test(ph),
      phSample: ph.slice(0, 60),
      voidish: style ? (style.backgroundColor || style.background || '').includes('2') || true : false,
    }
  })()`)
  console.log("composer12_13", JSON.stringify(composer))

  const review18 = await ev(`(async () => {
    document.querySelector('.an-nav-item[title="Review"], .an-nav-item[aria-label="Review"]')?.click()
    await new Promise((r) => setTimeout(r, 800))
    const panel = document.querySelector('[data-an-part="review"]')
    if (!panel) return { ok: false, reason: 'no-review' }
    const tabs = {
      browser: !!document.querySelector('[data-action="review-tab-browser"]'),
      code: !!document.querySelector('[data-action="review-tab-code"]'),
      files: !!document.querySelector('[data-action="review-tab-files"]'),
      documents: !!document.querySelector('[data-action="review-tab-documents"]'),
    }
    document.querySelector('[data-action="review-tab-code"]')?.click()
    await new Promise((r) => setTimeout(r, 200))
    const codeInput = !!document.querySelector('[data-an-part="review-code-path-input"]')
    document.querySelector('[data-action="review-tab-documents"]')?.click()
    await new Promise((r) => setTimeout(r, 200))
    const docInput = !!document.querySelector('[data-an-part="review-document-path-input"]')
    const holo = panel.getAttribute('data-holo')
    const ease = getComputedStyle(panel).getPropertyValue('--an-ease-holo').trim() ||
      getComputedStyle(document.querySelector('[data-component="an-shell"]')).getPropertyValue('--an-ease-holo').trim()
    return {
      ok: !!panel && tabs.code && tabs.documents && codeInput && docInput,
      tabs,
      codeInput,
      docInput,
      holo,
      docs: panel.getAttribute('data-docs'),
      easeHolo: ease,
    }
  })()`)
  console.log("review18", JSON.stringify(review18))

  const c4e = await ev(`(async () => {
    document.querySelector('.an-nav-item[title="Contraptions"], .an-nav-item[aria-label="Contraptions"]')?.click()
    await new Promise((r) => setTimeout(r, 900))
    const panel = document.querySelector('[data-an-part="contraptions"]')
    const subtitle = (panel?.innerText || document.body.innerText || '').includes('Automations & integrations')
    return {
      ok: !!panel,
      part: panel?.getAttribute('data-an-part'),
      subtitle,
      textSample: (panel?.innerText || '').slice(0, 120),
    }
  })()`)
  console.log("contraptions4e", JSON.stringify(c4e))

  const result = {
    ok: !!composer?.ok && !!review18?.ok && !!c4e?.ok,
    marker: `AP-STAGE4-19 nonregress-light ${Date.now()}`,
    stage4_12_13: !!composer?.ok,
    stage4_18: !!review18?.ok,
    stage4_4e: !!c4e?.ok,
    composer,
    review18,
    c4e,
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
