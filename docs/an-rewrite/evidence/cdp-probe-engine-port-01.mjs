/**
 * AP-ENGINE-PORT-01 live CDP:
 * EnginePort markers + send → YOU via OcServerEnginePort; composer owned; OC timeline hidden.
 * Light non-regress STAGE4-12/13 composer + 4E Contraptions open.
 * Isolated DEV — always closes WebSocket (avoid exit -1 hang).
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import WebSocket from "ws"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, "screenshots-2026-10-18")
const boardEvidence =
  "C:\\Users\\Dilla\\OneDrive\\Documents\\ChatGPT\\Aporia Nous\\business-control\\evidence"
const MARKER = `AP-ENGINE-PORT-01 send ${Date.now()}`

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
  await send("Page.navigate", { url: "http://localhost:5173/" })
  await sleep(3500)

  async function evaluate(expression) {
    const res = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })
    if (res.result?.exceptionDetails) {
      console.error("eval exception", JSON.stringify(res.result.exceptionDetails).slice(0, 600))
    }
    return res.result?.result?.value ?? null
  }

  await evaluate(`(async () => {
    const back = [...document.querySelectorAll('a,button')].find((el) => /back to app/i.test(el.textContent || ''))
    if (back) {
      back.click()
      await new Promise((r) => setTimeout(r, 1600))
    }
  })()`)

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

  const probeExpr = `(() => {
    const root = document.querySelector('[data-component="an-shell-session"]')
    const shell = document.querySelector('[data-component="an-shell"]')
    const dock = document.querySelector('[data-component="session-composer-dock"]')
    const timeline = document.querySelector('[data-an-part="opencode-timeline"]')
    const placeholder = document.querySelector('[data-slot="composer-placeholder"]')
    const placeText = (placeholder?.textContent || "").trim()
    const userTurns = [...document.querySelectorAll('.an-turn[data-role="user"]')]
    const conv = document.querySelector('[data-component="an-conversation"]')
    return {
      hasShell: !!shell,
      engine: root?.getAttribute("data-an-engine"),
      enginePort: root?.getAttribute("data-an-engine-port"),
      owned: dock?.getAttribute("data-an-owned"),
      composerOnly: !!document.querySelector(".an-stream-legacy--composer-only"),
      ownConv: document.querySelector(".an-stream")?.getAttribute("data-an-own-conversation"),
      timelineDisplay: timeline ? getComputedStyle(timeline).display : null,
      placeholderText: placeText.slice(0, 80),
      placeholderIsAn: /^Message .+…$/.test(placeText) || /^Message .+\\.\\.\\.$/.test(placeText),
      userTurnCount: userTurns.length,
      userTexts: userTurns.slice(-3).map((el) =>
        (el.querySelector("[data-slot='an-turn-text']")?.textContent || "").trim().slice(0, 160),
      ),
      convH: conv ? Math.round(conv.getBoundingClientRect().height) : 0,
      href: location.href,
    }
  })()`

  let probe = null
  for (let i = 0; i < 25; i++) {
    probe = await evaluate(probeExpr)
    console.log("probe", i, JSON.stringify({
      hasShell: probe?.hasShell,
      engine: probe?.engine,
      owned: probe?.owned,
      ownConv: probe?.ownConv,
    }))
    if (probe?.hasShell && probe?.engine === "oc-server") break
    await sleep(400)
  }

  if (!probe?.hasShell) {
    console.error("AnShell not ready")
    exitCode = 2
    throw new Error("no-shell")
  }

  if (probe?.ownConv !== "true" || probe?.owned !== "composer") {
    const openMember = await evaluate(`(() => {
      const btn = document.querySelector(".an-roster-member")
      if (!btn) return { ok: false }
      btn.click()
      return { ok: true }
    })()`)
    console.log("openMember", JSON.stringify(openMember))
    await sleep(2000)
    probe = await evaluate(probeExpr)
  }

  await shot("72-engine-port-01-before-send.png")

  const focus = await evaluate(`(() => {
    const el =
      document.querySelector('.tiptap.ProseMirror') ||
      document.querySelector('[data-component="composer-editor"]') ||
      document.querySelector('[contenteditable="true"]') ||
      document.querySelector('textarea')
    if (!el) return { ok: false, reason: "no composer" }
    el.focus()
    el.click()
    return { ok: true, tag: el.tagName }
  })()`)
  console.log("focus", JSON.stringify(focus))

  if (focus?.ok) {
    await send("Input.dispatchKeyEvent", { type: "keyDown", windowsVirtualKeyCode: 65, modifiers: 2 })
    await send("Input.dispatchKeyEvent", { type: "keyUp", windowsVirtualKeyCode: 65, modifiers: 2 })
    await send("Input.insertText", { text: MARKER })
    await sleep(250)

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
    await sleep(350)

    const clickedSend = await evaluate(`(() => {
      const sendBtn =
        document.querySelector('[data-action="composer-submit"]') ||
        [...document.querySelectorAll("button")].find((b) =>
          /send/i.test(b.getAttribute("aria-label") || b.title || ""),
        )
      if (!sendBtn || sendBtn.disabled) return { ok: false, disabled: !!sendBtn?.disabled }
      sendBtn.click()
      return { ok: true }
    })()`)
    console.log("sendClick", JSON.stringify(clickedSend))
  }

  let after = null
  for (let i = 0; i < 24; i++) {
    after = await evaluate(probeExpr)
    const hit = after?.userTexts?.some((t) => String(t).includes("AP-ENGINE-PORT-01"))
    console.log("afterSend", i, JSON.stringify({
      userTurnCount: after?.userTurnCount,
      userTexts: after?.userTexts,
      hit,
      engine: after?.engine,
      owned: after?.owned,
      timelineDisplay: after?.timelineDisplay,
    }))
    if (hit) break
    await sleep(450)
  }

  await shot("73-engine-port-01-after-send-you.png")

  // Light 4E: Contraptions open
  const contraptions = await evaluate(`(async () => {
    const nav =
      document.querySelector('.an-nav-item[title="Contraptions"], .an-nav-item[aria-label="Contraptions"]') ||
      document.querySelector('[data-an-nav="contraptions"], [data-nav-id="contraptions"]')
    nav?.click()
    await new Promise((r) => setTimeout(r, 900))
    const panel = document.querySelector('[data-an-part="contraptions"]')
    return {
      ok: !!panel,
      part: panel?.getAttribute("data-an-part"),
      label: panel?.textContent?.slice(0, 80) || null,
    }
  })()`)
  console.log("contraptions", JSON.stringify(contraptions))
  await shot("74-engine-port-01-contraptions-light.png")

  // Close Contraptions so shell stays usable
  await evaluate(`(async () => {
    const close = document.querySelector('[data-an-part="contraptions"] [data-action="close"], [data-an-part="contraptions"] button')
    close?.click()
    await new Promise((r) => setTimeout(r, 400))
  })()`)

  const sendOk =
    after?.engine === "oc-server" &&
    after?.enginePort === "01" &&
    after?.owned === "composer" &&
    after?.composerOnly === true &&
    after?.ownConv === "true" &&
    after?.timelineDisplay === "none" &&
    (after?.userTurnCount ?? 0) > 0 &&
    after?.userTexts?.some((t) => String(t).includes("AP-ENGINE-PORT-01")) &&
    (after?.convH ?? 0) > 40

  const stage413Light =
    after?.owned === "composer" &&
    (probe?.placeholderIsAn === true || after?.placeholderIsAn === true || !!after?.placeholderText) &&
    after?.timelineDisplay === "none"

  const ok = !!(sendOk && stage413Light && contraptions?.ok)
  exitCode = ok ? 0 : 4

  console.log(
    "RESULT",
    JSON.stringify(
      {
        ok,
        marker: MARKER,
        sendOk,
        stage412_13: {
          owned: after?.owned,
          composerOnly: after?.composerOnly,
          timelineDisplay: after?.timelineDisplay,
          placeholderText: after?.placeholderText ?? probe?.placeholderText,
        },
        contraptions4E: contraptions,
        engine: after?.engine,
        enginePort: after?.enginePort,
        userTexts: after?.userTexts,
        convH: after?.convH,
      },
      null,
      2,
    ),
  )
} catch (err) {
  console.error("probe failed", err?.message || err)
  if (exitCode === 2) exitCode = 3
} finally {
  try {
    ws?.close()
  } catch {
    /* ignore */
  }
  process.exit(exitCode)
}
