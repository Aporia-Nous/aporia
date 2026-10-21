/**
 * AP-ENGINE-PORT-02 live CDP:
 * AN Settings panel via EnginePort (no OC Settings React); Aporetic by Aporia Nous chrome;
 * OpenCode fine print only; Providers/Models/BYOK surfaces present.
 * Light non-regress: EnginePort composer ownership + 4E Contraptions.
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
const MARKER = `AP-ENGINE-PORT-02 settings ${Date.now()}`

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

  // Ensure session shell (EnginePort provider) is mounted
  let shellReady = await evaluate(`!!document.querySelector('[data-component="an-shell-session"]')`)
  if (!shellReady) {
    const openMember = await evaluate(`(() => {
      const btn = document.querySelector(".an-roster-member")
      if (!btn) return { ok: false }
      btn.click()
      return { ok: true }
    })()`)
    console.log("openMember", JSON.stringify(openMember))
    await sleep(2000)
  }

  await shot("75-engine-port-02-before-settings.png")

  const settings = await evaluate(`(async () => {
    // Prefer AnShell nav Settings — must open in-shell panel, NOT /settings OC React route
    const nav =
      document.querySelector('.an-nav-item[title="Settings"], .an-nav-item[aria-label="Settings"]') ||
      [...document.querySelectorAll("button,.an-nav-item,[role='button']")].find((el) =>
        /^settings$/i.test((el.getAttribute("aria-label") || el.title || el.textContent || "").trim()),
      )
    nav?.click()
    await new Promise((r) => setTimeout(r, 900))

    const panel = document.querySelector('[data-an-part="settings"], [data-testid="an-settings-panel"]')
    const ocScreen = document.querySelector('[data-testid="settings-screen"], .settings-screen')
    const mark = document.querySelector('[data-an-part="settings-about-mark"]')
    const fine = document.querySelector('[data-an-part="settings-opencode-fineprint"]')
    const markText = (mark?.textContent || "").replace(/\\s+/g, " ").trim()
    const fineText = (fine?.textContent || "").trim()

    // Providers tab
    const providersTab = [...document.querySelectorAll(".an-settings-tab")].find((el) =>
      /providers/i.test(el.textContent || ""),
    )
    providersTab?.click()
    await new Promise((r) => setTimeout(r, 700))
    const providersList = document.querySelector('[data-an-part="settings-providers-list"]')
    const byok = document.querySelector('[data-an-part="settings-byok"]')

    // Models tab
    const modelsTab = [...document.querySelectorAll(".an-settings-tab")].find((el) =>
      /models/i.test(el.textContent || ""),
    )
    modelsTab?.click()
    await new Promise((r) => setTimeout(r, 700))
    const modelsList = document.querySelector('[data-an-part="settings-models-list"]')

    // Back to About for chrome shot
    const aboutTab = [...document.querySelectorAll(".an-settings-tab")].find((el) =>
      /about/i.test(el.textContent || ""),
    )
    aboutTab?.click()
    await new Promise((r) => setTimeout(r, 400))

    const owned = panel?.getAttribute("data-an-owned")
    const theme = panel?.getAttribute("data-an-theme")
    const enginePort = panel?.getAttribute("data-an-engine-port")
    const iceLike = panel ? /blur\\(/i.test(getComputedStyle(panel).backdropFilter || "") : false

    return {
      ok:
        !!panel &&
        owned === "settings" &&
        theme === "an" &&
        enginePort === "02" &&
        !ocScreen &&
        /Aporetic/i.test(markText) &&
        /Aporia Nous/i.test(markText) &&
        /OpenCode/i.test(fineText) &&
        !!providersList &&
        !!byok &&
        !!modelsList &&
        !location.pathname.includes("/settings"),
      owned,
      theme,
      enginePort,
      iceLike,
      href: location.href,
      markText: markText.slice(0, 80),
      fineText: fineText.slice(0, 100),
      hasOcScreen: !!ocScreen,
      providersRows: providersList?.querySelectorAll("li").length ?? 0,
      modelsRows: modelsList?.querySelectorAll("li").length ?? 0,
      hasByok: !!byok,
      panelPart: panel?.getAttribute("data-an-part"),
    }
  })()`)
  console.log("settings", JSON.stringify(settings))
  await shot("76-engine-port-02-settings-an.png")

  // Close settings
  await evaluate(`(async () => {
    const close = document.querySelector('.an-settings-close, [data-an-part="settings"] .an-settings-close')
    close?.click()
    await new Promise((r) => setTimeout(r, 500))
  })()`)

  const composer = await evaluate(`(() => {
    const dock = document.querySelector('[data-component="session-composer-dock"]')
    const timeline = document.querySelector('[data-an-part="opencode-timeline"]')
    const placeholder = document.querySelector('[data-slot="composer-placeholder"]')
    const placeText = (placeholder?.textContent || "").trim()
    return {
      owned: dock?.getAttribute("data-an-owned"),
      timelineDisplay: timeline ? getComputedStyle(timeline).display : null,
      placeholderIsAn: /^Message .+…$/.test(placeText) || /^Message .+\\.\\.\\.$/.test(placeText),
      placeholderText: placeText.slice(0, 80),
      engine: document.querySelector('[data-component="an-shell-session"]')?.getAttribute("data-an-engine"),
    }
  })()`)
  console.log("composer", JSON.stringify(composer))

  const contraptions = await evaluate(`(async () => {
    const nav =
      document.querySelector('.an-nav-item[title="Contraptions"], .an-nav-item[aria-label="Contraptions"]') ||
      document.querySelector('[data-an-nav="contraptions"], [data-nav-id="contraptions"]')
    nav?.click()
    await new Promise((r) => setTimeout(r, 900))
    const panel = document.querySelector('[data-an-part="contraptions"]')
    return { ok: !!panel, part: panel?.getAttribute("data-an-part") }
  })()`)
  console.log("contraptions", JSON.stringify(contraptions))
  await shot("77-engine-port-02-contraptions-light.png")

  await evaluate(`(async () => {
    const close = document.querySelector('[data-an-part="contraptions"] button')
    close?.click()
    await new Promise((r) => setTimeout(r, 300))
  })()`)

  const settingsOk = !!settings?.ok
  const composerOk = composer?.owned === "composer" && composer?.timelineDisplay === "none"
  const ok = settingsOk && composerOk && !!contraptions?.ok

  const result = {
    ok,
    marker: MARKER,
    settingsOk,
    composerOk,
    contraptionsOk: !!contraptions?.ok,
    settings,
    composer,
    contraptions,
  }
  console.log("RESULT", JSON.stringify(result))
  exitCode = ok ? 0 : 2
} catch (err) {
  console.error("probe failed", err)
  exitCode = 2
} finally {
  try {
    ws?.close()
  } catch {
    /* ignore */
  }
  process.exit(exitCode)
}
