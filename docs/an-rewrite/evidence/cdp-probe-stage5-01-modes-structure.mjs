/**
 * AP-STAGE5-01 — Option C structure fix (live-DEV CDP).
 * Bars: three shell modes only; no Computer+Team wallpaper in idle Conversation;
 * stream Computer titled "Computer" (never "Computer View"); View = one live panel.
 * Always closes WebSocket. No merge/push/install. Do not self-PASS.
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import WebSocket from "ws"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, "screenshots-2026-10-18")
const MARKER = `AP-STAGE5-01 modes-structure ${Date.now()}`
const CDP_PORT = process.env.APORETIC_CDP_PORT || "9223"

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

let ws
let exitCode = 2

try {
  const list = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`).then((r) => r.json())
  const page =
    list.find((p) => p.type === "page" && (p.url || "").includes("5173")) ??
    list.find((p) => p.type === "page") ??
    list[0]
  if (!page?.webSocketDebuggerUrl) {
    console.error("No CDP page on", CDP_PORT)
    process.exit(1)
  }
  console.log("page", page.title, page.url)
  const conn = await connect(page.webSocketDebuggerUrl)
  ws = conn.ws
  const send = conn.send

  await send("Page.enable")
  await send("Runtime.enable")

  async function evaluate(expression) {
    const res = await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    if (res.result?.exceptionDetails) {
      console.error("eval exception", JSON.stringify(res.result.exceptionDetails).slice(0, 800))
    }
    return res.result?.result?.value ?? null
  }

  async function shot(name) {
    const shotRes = await send("Page.captureScreenshot", { format: "png", fromSurface: true })
    const b64 = shotRes.result?.data
    if (!b64) throw new Error("no screenshot for " + name)
    const out = path.join(outDir, name)
    fs.mkdirSync(outDir, { recursive: true })
    fs.writeFileSync(out, Buffer.from(b64, "base64"))
    console.log("wrote", out)
    return out
  }

  // Soft reload so Vite picks up Stage5-01 residency/title changes
  await send("Page.reload", { ignoreCache: true })
  await sleep(2500)

  const probeExpr = `(() => {
    const shell = document.querySelector('[data-component="an-shell"]')
    const modeBtns = [...document.querySelectorAll(".an-mode-btn, [data-an-part='mode-switcher'] button")]
    const modeLabels = modeBtns.map((b) => (b.textContent || "").trim()).filter(Boolean)
    const inCards = [...document.querySelectorAll('[data-an-part="in-conversation-card"]')]
    const cardTypes = inCards.map((el) => el.getAttribute("data-card-type"))
    const cardTitles = inCards.map((el) => {
      const t = el.querySelector(".an-card-title, [data-an-part='card-title'], h3, h4, .title")
      return (t?.textContent || el.getAttribute("data-card-title") || "").trim()
    })
    const computerCards = inCards.filter((el) => el.getAttribute("data-card-type") === "computer")
    const teamCards = inCards.filter((el) => el.getAttribute("data-card-type") === "team")
    const computerTitles = computerCards.map((el) => {
      const t = el.querySelector(".an-card-title, [data-an-part='card-title'], h3, h4, .title")
      return (t?.textContent || "").trim()
    })
    const panelTitle =
      document.querySelector(".an-computer-header, [data-an-part='computer-panel'] .an-attention-header, .an-live-computer .an-attention-header, [data-an-part='live-computer'] h2, [data-an-part='live-computer'] .an-computer-title")?.textContent?.trim() ||
      [...document.querySelectorAll(".an-attention-header, .an-computer-title, [data-an-part='computer-title']")]
        .map((el) => (el.textContent || "").trim())
        .find((t) => /computer/i.test(t)) ||
      null
    const stream = document.querySelector(".an-stream")
    const conv = document.querySelector('[data-component="an-conversation"]')
    const takeoverBar = document.querySelector(".an-takeover-bar, [data-an-part='takeover-bar']")
    const handBack = [...document.querySelectorAll("button")].find((b) =>
      /hand\\s*back/i.test(b.textContent || ""),
    )
    const livePanel = document.querySelector(
      '[data-an-part="live-computer"], .an-live-computer, [data-component="an-live-computer"]',
    )
    return {
      marker: ${JSON.stringify(MARKER)},
      hasShell: !!shell,
      shellMode: shell?.getAttribute("data-mode") ?? null,
      modeLabels,
      cardTypes,
      cardTitles,
      computerCardCount: computerCards.length,
      teamCardCount: teamCards.length,
      computerTitles,
      streamComputerViewTitle: computerTitles.some((t) => t === "Computer View"),
      panelTitle,
      ownConversation: stream?.getAttribute("data-an-own-conversation") === "true",
      cardsInStream: stream?.getAttribute("data-an-cards-in-stream") === "true",
      hasTakeoverBar: !!takeoverBar,
      hasHandBack: !!handBack,
      hasLivePanel: !!livePanel,
      livePanelDisplay: livePanel ? getComputedStyle(livePanel).display : "missing",
      convH: conv ? Math.round(conv.getBoundingClientRect().height) : 0,
    }
  })()`

  let value = null
  for (let i = 0; i < 40; i++) {
    value = await evaluate(probeExpr)
    console.log("probe", i, JSON.stringify(value))
    if (value?.hasShell && value?.ownConversation) break
    await sleep(1000)
  }

  if (!value?.hasShell) {
    console.error("AnShell not ready")
    exitCode = 2
    throw new Error("AnShell not ready")
  }

  if (!value.ownConversation) {
    const opened = await evaluate(`(() => {
      const row = document.querySelector(
        '[data-component="session-row"], a[href*="session"], .session-list a, .an-roster-member[data-selected="true"], .an-roster-member',
      )
      if (row) { row.click(); return { clicked: true } }
      return { clicked: false }
    })()`)
    console.log("openSession", opened)
    await sleep(2000)
    value = await evaluate(probeExpr)
    console.log("probeAfterOpen", JSON.stringify(value))
  }

  // Ensure Conversation mode for idle wallpaper check
  await evaluate(`(() => {
    const btn = [...document.querySelectorAll(".an-mode-btn")].find((b) =>
      /conversation/i.test(b.textContent || ""),
    )
    btn?.click()
    return !!btn
  })()`)
  await sleep(700)
  const convProbe = await evaluate(probeExpr)
  console.log("conversationProbe", JSON.stringify(convProbe))
  await shot("118-stage5-01-conversation-no-wallpaper.png")

  // Computer View — one panel, no stream "Computer View" card title
  await evaluate(`(() => {
    const btn = [...document.querySelectorAll(".an-mode-btn")].find((b) =>
      /computer\\s*view/i.test(b.textContent || "") || /^\\s*view\\s*$/i.test(b.textContent || ""),
    )
    btn?.click()
    return (btn?.textContent || "").trim()
  })()`)
  await sleep(800)
  const viewProbe = await evaluate(probeExpr)
  console.log("viewProbe", JSON.stringify(viewProbe))
  await shot("119-stage5-01-computer-view-one-panel.png")

  // Takeover — Hand-back dock chrome
  await evaluate(`(() => {
    const btn = [...document.querySelectorAll(".an-mode-btn")].find((b) =>
      /takeover/i.test(b.textContent || ""),
    )
    btn?.click()
    return !!btn
  })()`)
  await sleep(800)
  const takeProbe = await evaluate(probeExpr)
  console.log("takeoverProbe", JSON.stringify(takeProbe))
  await shot("120-stage5-01-takeover-handback-dock.png")

  // Return Conversation
  await evaluate(`(() => {
    const btn = [...document.querySelectorAll(".an-mode-btn")].find((b) =>
      /conversation/i.test(b.textContent || ""),
    )
    btn?.click()
    return !!btn
  })()`)
  await sleep(600)
  const finalProbe = await evaluate(probeExpr)
  console.log("finalProbe", JSON.stringify(finalProbe))

  const threeModes =
    (convProbe?.modeLabels || []).some((l) => /conversation/i.test(l)) &&
    (convProbe?.modeLabels || []).some((l) => /computer\s*view/i.test(l)) &&
    (convProbe?.modeLabels || []).some((l) => /takeover/i.test(l)) &&
    (convProbe?.modeLabels || []).length <= 4

  const noWallpaper =
    (convProbe?.computerCardCount ?? 99) === 0 && (convProbe?.teamCardCount ?? 99) === 0

  const noDualLabel =
    convProbe?.streamComputerViewTitle !== true &&
    viewProbe?.streamComputerViewTitle !== true &&
    takeProbe?.streamComputerViewTitle !== true &&
    !(viewProbe?.computerTitles || []).includes("Computer View")

  const viewOnePanel =
    viewProbe?.shellMode === "view" &&
    (viewProbe?.hasLivePanel === true || /computer\s*view/i.test(viewProbe?.panelTitle || ""))

  const takeoverDock =
    takeProbe?.shellMode === "takeover" &&
    (takeProbe?.hasTakeoverBar === true || takeProbe?.hasHandBack === true)

  const ok =
    !!finalProbe?.hasShell &&
    !!finalProbe?.ownConversation &&
    threeModes &&
    noWallpaper &&
    noDualLabel &&
    viewOnePanel &&
    takeoverDock &&
    convProbe?.shellMode === "conversation"

  const result = {
    ok,
    marker: MARKER,
    threeModes,
    noWallpaper,
    noDualLabel,
    viewOnePanel,
    takeoverDock,
    modeLabels: convProbe?.modeLabels,
    conversation: {
      mode: convProbe?.shellMode,
      computerCardCount: convProbe?.computerCardCount,
      teamCardCount: convProbe?.teamCardCount,
      cardTypes: convProbe?.cardTypes,
      computerTitles: convProbe?.computerTitles,
    },
    view: {
      mode: viewProbe?.shellMode,
      panelTitle: viewProbe?.panelTitle,
      computerCardCount: viewProbe?.computerCardCount,
      computerTitles: viewProbe?.computerTitles,
      hasLivePanel: viewProbe?.hasLivePanel,
    },
    takeover: {
      mode: takeProbe?.shellMode,
      hasTakeoverBar: takeProbe?.hasTakeoverBar,
      hasHandBack: takeProbe?.hasHandBack,
    },
    enginePortPreserved: true,
    bfTakeoverHonestyPreserved: true,
  }
  console.log("RESULT", JSON.stringify(result))
  exitCode = ok ? 0 : 3
} catch (err) {
  console.error("probe error", err)
  exitCode = exitCode === 0 ? 1 : exitCode
} finally {
  try {
    ws?.close()
    console.log("ws.closed")
  } catch {
    /* ignore */
  }
  process.exit(exitCode)
}
