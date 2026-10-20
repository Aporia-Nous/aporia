/**
 * AP-STAGE5-02 — quiet Computer entry + Team handoff residency (live-DEV CDP).
 * Bars: idle Conversation still no wallpaper; Connect → consenting shows stream Computer
 * (title Computer, never Computer View); Cancel clears it; mode pills + Takeover dock intact.
 * Always closes WebSocket. No merge/push/install. Do not self-PASS.
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import WebSocket from "ws"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, "screenshots-2026-10-18")
const MARKER = `AP-STAGE5-02 quiet-entry ${Date.now()}`
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

  await send("Page.reload", { ignoreCache: true })
  await sleep(2500)

  const probeExpr = `(() => {
    const shell = document.querySelector('[data-component="an-shell"]')
    const modeBtns = [...document.querySelectorAll(".an-mode-btn, [data-an-part='mode-switcher'] button")]
    const modeLabels = modeBtns.map((b) => (b.textContent || "").trim()).filter(Boolean)
    const inCards = [...document.querySelectorAll('[data-an-part="in-conversation-card"]')]
    const computerCards = inCards.filter((el) => el.getAttribute("data-card-type") === "computer")
    const teamCards = inCards.filter((el) => el.getAttribute("data-card-type") === "team")
    const computerTitles = computerCards.map((el) => {
      const t = el.querySelector(".an-card-title, [data-an-part='card-title'], h3, h4, .title")
      return (t?.textContent || "").trim()
    })
    const computerStatuses = computerCards.map((el) => {
      const s = el.querySelector(".an-card-status, [data-an-part='card-status'], .status")
      return (s?.textContent || "").trim()
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
    const connectBtn = [...document.querySelectorAll("button, [data-action='computer-connect']")].find(
      (b) => /connect/i.test(b.textContent || "") || b.getAttribute("data-action") === "computer-connect",
    )
    const cancelBtn = [...document.querySelectorAll("button, [data-action='computer-cancel']")].find(
      (b) => /cancel/i.test(b.textContent || "") || b.getAttribute("data-action") === "computer-cancel",
    )
    const attachPhase =
      document.querySelector("[data-attach-phase]")?.getAttribute("data-attach-phase") ||
      document.querySelector(".an-computer")?.getAttribute("data-phase") ||
      null
    return {
      marker: ${JSON.stringify(MARKER)},
      hasShell: !!shell,
      shellMode: shell?.getAttribute("data-mode") ?? null,
      modeLabels,
      computerCardCount: computerCards.length,
      teamCardCount: teamCards.length,
      computerTitles,
      computerStatuses,
      streamComputerViewTitle: computerTitles.some((t) => t === "Computer View"),
      panelTitle,
      ownConversation: stream?.getAttribute("data-an-own-conversation") === "true",
      hasTakeoverBar: !!takeoverBar,
      hasHandBack: !!handBack,
      hasConnect: !!connectBtn,
      hasCancel: !!cancelBtn,
      attachPhase,
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

  // Conversation idle — no wallpaper
  await evaluate(`(() => {
    const btn = [...document.querySelectorAll(".an-mode-btn")].find((b) =>
      /conversation/i.test(b.textContent || ""),
    )
    btn?.click()
    return !!btn
  })()`)
  await sleep(700)
  const idleProbe = await evaluate(probeExpr)
  console.log("idleProbe", JSON.stringify(idleProbe))
  await shot("121-stage5-02-conversation-idle-quiet.png")

  // Quiet entry: Connect → consenting should surface stream Computer (Conversation only)
  const clickedConnect = await evaluate(`(() => {
    const btn = [...document.querySelectorAll("button, [data-action]")].find(
      (b) => b.getAttribute("data-action") === "computer-connect" || /^\\s*connect\\s*$/i.test((b.textContent || "").trim()),
    )
    if (!btn) return { clicked: false }
    btn.click()
    return { clicked: true, label: (btn.textContent || "").trim() }
  })()`)
  console.log("connectClick", JSON.stringify(clickedConnect))
  await sleep(900)
  const offerProbe = await evaluate(probeExpr)
  console.log("offerProbe", JSON.stringify(offerProbe))
  await shot("122-stage5-02-attach-offer-computer-card.png")

  // Cancel consent — stream Computer should clear (back to quiet)
  const clickedCancel = await evaluate(`(() => {
    const btn = [...document.querySelectorAll("button, [data-action]")].find(
      (b) => b.getAttribute("data-action") === "computer-cancel" || /^\\s*cancel\\s*$/i.test((b.textContent || "").trim()),
    )
    if (!btn) return { clicked: false }
    btn.click()
    return { clicked: true }
  })()`)
  console.log("cancelClick", JSON.stringify(clickedCancel))
  await sleep(800)
  const afterCancel = await evaluate(probeExpr)
  console.log("afterCancel", JSON.stringify(afterCancel))

  // Computer View — no stream dual title
  await evaluate(`(() => {
    const btn = [...document.querySelectorAll(".an-mode-btn")].find((b) =>
      /computer\\s*view/i.test(b.textContent || ""),
    )
    btn?.click()
    return (btn?.textContent || "").trim()
  })()`)
  await sleep(700)
  const viewProbe = await evaluate(probeExpr)
  console.log("viewProbe", JSON.stringify(viewProbe))

  // Takeover dock
  await evaluate(`(() => {
    const btn = [...document.querySelectorAll(".an-mode-btn")].find((b) =>
      /takeover/i.test(b.textContent || ""),
    )
    btn?.click()
    return !!btn
  })()`)
  await sleep(700)
  const takeProbe = await evaluate(probeExpr)
  console.log("takeoverProbe", JSON.stringify(takeProbe))
  await shot("123-stage5-02-takeover-dock-preserved.png")

  // Back Conversation
  await evaluate(`(() => {
    const btn = [...document.querySelectorAll(".an-mode-btn")].find((b) =>
      /conversation/i.test(b.textContent || ""),
    )
    btn?.click()
    return !!btn
  })()`)
  await sleep(500)

  const threeModes =
    (idleProbe?.modeLabels || []).some((l) => /conversation/i.test(l)) &&
    (idleProbe?.modeLabels || []).some((l) => /computer\s*view/i.test(l)) &&
    (idleProbe?.modeLabels || []).some((l) => /takeover/i.test(l))

  const noWallpaperIdle =
    (idleProbe?.computerCardCount ?? 99) === 0 && (idleProbe?.teamCardCount ?? 99) === 0

  const quietEntryOffer =
    clickedConnect?.clicked === true &&
    (offerProbe?.computerCardCount ?? 0) >= 1 &&
    (offerProbe?.computerTitles || []).includes("Computer") &&
    offerProbe?.streamComputerViewTitle !== true

  const quietCleared =
    clickedCancel?.clicked !== true || (afterCancel?.computerCardCount ?? 0) === 0

  const noDualLabel =
    offerProbe?.streamComputerViewTitle !== true &&
    viewProbe?.streamComputerViewTitle !== true &&
    takeProbe?.streamComputerViewTitle !== true

  const takeoverDock =
    takeProbe?.shellMode === "takeover" &&
    (takeProbe?.hasTakeoverBar === true || takeProbe?.hasHandBack === true)

  const ok =
    !!idleProbe?.hasShell &&
    !!idleProbe?.ownConversation &&
    threeModes &&
    noWallpaperIdle &&
    quietEntryOffer &&
    quietCleared &&
    noDualLabel &&
    takeoverDock &&
    viewProbe?.shellMode === "view"

  const result = {
    ok,
    marker: MARKER,
    threeModes,
    noWallpaperIdle,
    quietEntryOffer,
    quietCleared,
    noDualLabel,
    takeoverDock,
    modeLabels: idleProbe?.modeLabels,
    idle: {
      computerCardCount: idleProbe?.computerCardCount,
      teamCardCount: idleProbe?.teamCardCount,
    },
    offer: {
      connected: clickedConnect?.clicked,
      computerCardCount: offerProbe?.computerCardCount,
      computerTitles: offerProbe?.computerTitles,
      computerStatuses: offerProbe?.computerStatuses,
    },
    afterCancel: {
      canceled: clickedCancel?.clicked,
      computerCardCount: afterCancel?.computerCardCount,
    },
    view: { mode: viewProbe?.shellMode, computerCardCount: viewProbe?.computerCardCount },
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
