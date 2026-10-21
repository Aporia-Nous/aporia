/**
 * Light STAGE4-13 check on :9223 — ownership, controls hide, placeholder.
 * Navigates home first to avoid Settings remount flake. Closes ws.
 */
import WebSocket from "ws"

const CDP_PORT = process.env.APORETIC_CDP_PORT || "9223"
const MARKER = `AP-STAGE4-13 light ${Date.now()}`
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
  const page = list.find((p) => p.type === "page" && (p.url || "").includes("5173"))
  const conn = await connect(page.webSocketDebuggerUrl)
  ws = conn.ws
  const send = conn.send
  await send("Page.enable")
  await send("Runtime.enable")
  const ev = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })
    return r.result?.result?.value ?? null
  }

  // Hard navigate home (not Settings) then open teammate
  await send("Page.navigate", { url: "http://localhost:5173/" })
  await new Promise((r) => setTimeout(r, 3500))
  for (let i = 0; i < 15; i++) {
    const ready = await ev(`!!document.querySelector('[data-component="an-shell"]')`)
    if (ready) break
    // leave settings if restored
    await ev(`(async () => {
      const back = [...document.querySelectorAll('a,button')].find((el) => /back to app/i.test(el.textContent || ''))
      if (back) { back.click(); await new Promise((r) => setTimeout(r, 1200)) }
    })()`)
    await new Promise((r) => setTimeout(r, 400))
  }

  await ev(`(async () => {
    document.querySelector('.an-roster-member')?.click()
    await new Promise((r) => setTimeout(r, 2800))
  })()`)

  let probe = null
  for (let i = 0; i < 20; i++) {
    probe = await ev(`(() => {
      const dock = document.querySelector('[data-component="session-composer-dock"]')
      const controls = document.querySelector('[data-an-owned="composer"] [data-slot="composer-controls"]')
        || document.querySelector('[data-slot="composer-controls"]')
      const modelBtn = document.querySelector('[data-an-owned="composer"] [data-action="composer-model"]')
      const mic = document.querySelector('[data-an-owned="composer"] [data-aporia-mic]')
      const callBtn = document.querySelector('[data-an-owned="composer"] [data-aporia-call-inline]')
      const placeholder = document.querySelector('[data-an-owned="composer"] [data-slot="composer-placeholder"]')
        || document.querySelector('[data-slot="composer-placeholder"]')
      const submit = document.querySelector('[data-an-owned="composer"] [data-action="composer-submit"]')
        || document.querySelector('[data-action="composer-submit"]')
      const placeText = (placeholder?.textContent || '').trim()
      const csSubmit = submit ? getComputedStyle(submit) : null
      return {
        hasShell: !!document.querySelector('[data-component="an-shell"]'),
        owned: dock?.getAttribute('data-an-owned') || document.querySelector('[data-an-owned="composer"]')?.getAttribute('data-an-owned'),
        controlsHidden: controls ? getComputedStyle(controls).display === 'none' : true,
        modelHidden: modelBtn ? getComputedStyle(modelBtn).display === 'none' : true,
        micAbsentOrHidden: !mic || getComputedStyle(mic).display === 'none',
        callAbsentOrHidden: !callBtn || getComputedStyle(callBtn).display === 'none',
        placeholderText: placeText.slice(0, 80),
        placeholderIsAn: /^Message .+…$/.test(placeText) || /^Message .+\\.\\.\\.$/.test(placeText),
        placeholderNotOc: !/Ask anything/i.test(placeText) && !/for commands/i.test(placeText),
        submitVisible: !!submit,
        submitGoldish: csSubmit
          ? /240|198|109|215|154|46|d79a2e|f0c66d/i.test(
              (csSubmit.backgroundImage || '') + (csSubmit.backgroundColor || '') + (csSubmit.boxShadow || ''),
            ) || (csSubmit.backgroundImage || '').includes('linear-gradient')
          : false,
      }
    })()`)
    console.log("probe", i, JSON.stringify(probe))
    if (probe?.hasShell && probe?.owned === "composer" && probe?.placeholderText) break
    await new Promise((r) => setTimeout(r, 400))
  }

  const ok =
    !!probe?.hasShell &&
    probe?.owned === "composer" &&
    !!probe?.controlsHidden &&
    !!probe?.modelHidden &&
    !!probe?.micAbsentOrHidden &&
    !!probe?.callAbsentOrHidden &&
    !!probe?.placeholderIsAn &&
    !!probe?.placeholderNotOc
  const result = { ok, marker: MARKER, probe }
  console.log("RESULT", JSON.stringify(result))
  exitCode = ok ? 0 : 2
} catch (err) {
  console.error(err)
  exitCode = 1
} finally {
  try {
    ws?.close()
  } catch {}
  process.exit(exitCode)
}
