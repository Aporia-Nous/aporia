/**
 * AP-ENGINE-E05 live-DEV non-regress (EnginePort send/stream surface).
 * Narrow settleStaleToolCalls is unit-proven; this only checks send/stream/EnginePort still work.
 * Always closes WebSocket (STAGE4-18 hang fix).
 */
import WebSocket from "ws"

const MARKER = `AP-ENGINE-E05 send ${Date.now()}`
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

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms))
}

try {
  const list = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`).then((r) => r.json())
  const page =
    list.find((p) => p.type === "page" && (p.url || "").includes("5173")) ??
    list.find((p) => p.type === "page" && (p.title || "").includes("Aporetic"))
  if (!page?.webSocketDebuggerUrl) {
    console.error("No Aporetic CDP page")
    process.exit(1)
  }
  console.log("aporetic", page.title, page.url)

  const conn = await connect(page.webSocketDebuggerUrl)
  ws = conn.ws
  const send = conn.send
  await send("Page.enable")
  await send("Runtime.enable")
  await send("Page.navigate", { url: "http://localhost:5173/" })
  await sleep(3000)

  async function evaluate(expression) {
    const res = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })
    if (res.result?.exceptionDetails) {
      console.error("eval exception", JSON.stringify(res.result.exceptionDetails).slice(0, 400))
    }
    return res.result?.result?.value ?? null
  }

  await evaluate(`(async () => {
    const back = [...document.querySelectorAll('a,button')].find((el) => /back to app/i.test(el.textContent || ''))
    if (back) {
      back.click()
      await new Promise((r) => setTimeout(r, 1400))
    }
  })()`)

  for (let i = 0; i < 12; i++) {
    if (await evaluate(`!!document.querySelector('[data-component="an-shell"]')`)) break
    await sleep(400)
  }

  const probeExpr = `(() => {
    const root = document.querySelector('[data-component="an-shell-session"]')
    const dock = document.querySelector('[data-component="session-composer-dock"]')
    const timeline = document.querySelector('[data-an-part="opencode-timeline"]')
    const userTurns = [...document.querySelectorAll('.an-turn[data-role="user"]')]
    return {
      hasShell: !!document.querySelector('[data-component="an-shell"]'),
      engine: root?.getAttribute("data-an-engine"),
      enginePort: root?.getAttribute("data-an-engine-port"),
      owned: dock?.getAttribute("data-an-owned"),
      timelineDisplay: timeline ? getComputedStyle(timeline).display : null,
      userTexts: userTurns.slice(-3).map((el) =>
        (el.querySelector("[data-slot='an-turn-text']")?.textContent || "").trim().slice(0, 160),
      ),
    }
  })()`

  let probe = null
  for (let i = 0; i < 20; i++) {
    probe = await evaluate(probeExpr)
    if (probe?.hasShell && probe?.engine === "oc-server") break
    await sleep(350)
  }

  if (!probe?.hasShell || probe?.engine !== "oc-server") {
    console.error("RESULT", JSON.stringify({ ok: false, reason: "no-engine-port", probe }))
    exitCode = 2
    throw new Error("no-engine-port")
  }

  if (probe?.owned !== "composer") {
    await evaluate(`(() => { document.querySelector(".an-roster-member")?.click(); return true })()`)
    await sleep(1800)
    probe = await evaluate(probeExpr)
  }

  const focus = await evaluate(`(() => {
    const el =
      document.querySelector('.tiptap.ProseMirror') ||
      document.querySelector('[data-component="composer-editor"]') ||
      document.querySelector('[contenteditable="true"]') ||
      document.querySelector('textarea')
    if (!el) return { ok: false }
    el.focus()
    el.click()
    return { ok: true }
  })()`)
  console.log("focus", JSON.stringify(focus))

  if (focus?.ok) {
    await send("Input.dispatchKeyEvent", { type: "keyDown", windowsVirtualKeyCode: 65, modifiers: 2 })
    await send("Input.dispatchKeyEvent", { type: "keyUp", windowsVirtualKeyCode: 65, modifiers: 2 })
    await send("Input.insertText", { text: MARKER })
    await sleep(200)
    await send("Input.dispatchKeyEvent", {
      type: "keyDown",
      windowsVirtualKeyCode: 13,
      key: "Enter",
      code: "Enter",
      text: "\r",
    })
    await send("Input.dispatchKeyEvent", {
      type: "keyUp",
      windowsVirtualKeyCode: 13,
      key: "Enter",
      code: "Enter",
    })
    await sleep(300)
    await evaluate(`(() => {
      const sendBtn =
        document.querySelector('[data-action="composer-submit"]') ||
        [...document.querySelectorAll("button")].find((b) =>
          /send/i.test(b.getAttribute("aria-label") || b.title || ""),
        )
      if (sendBtn && !sendBtn.disabled) sendBtn.click()
      return !!sendBtn
    })()`)
  }

  let after = null
  let hit = false
  for (let i = 0; i < 20; i++) {
    after = await evaluate(probeExpr)
    hit = !!after?.userTexts?.some((t) => String(t).includes("AP-ENGINE-E05"))
    console.log("afterSend", i, JSON.stringify({ hit, engine: after?.engine, owned: after?.owned }))
    if (hit) break
    await sleep(400)
  }

  const ok =
    hit &&
    after?.engine === "oc-server" &&
    after?.owned === "composer" &&
    (after?.timelineDisplay === "none" || after?.timelineDisplay === null)

  console.log(
    "RESULT",
    JSON.stringify({
      ok,
      marker: MARKER,
      engine: after?.engine,
      enginePort: after?.enginePort,
      owned: after?.owned,
      timelineDisplay: after?.timelineDisplay,
      note: "E05 narrow settleStaleToolCalls verified by packages/core unit; this is EnginePort send non-regress",
    }),
  )
  exitCode = ok ? 0 : 2
} catch (err) {
  console.error("probe error", err?.message || err)
  if (exitCode === 0) exitCode = 2
} finally {
  try {
    ws?.close()
  } catch {
    /* ignore */
  }
  process.exit(exitCode)
}
