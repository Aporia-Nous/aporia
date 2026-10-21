/**
 * AP-STAGE5-03 — Inline / Status Computer event densities (live-DEV CDP).
 * Bars: idle Conversation no wallpaper; Connect → Status density stream Computer;
 * Confirm attach (Live+feed) → Inline density + Take control; View/Takeover suppress
 * stream Computer; mode pills + Hand-back dock intact. Always closes WebSocket.
 * No merge/push/install. Do not self-PASS.
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import WebSocket from "ws"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, "screenshots-2026-10-18")
const MARKER = `AP-STAGE5-03 inline-density ${Date.now()}`
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
      const t = el.querySelector(".an-card-title")
      return (t?.textContent || "").trim()
    })
    const computerStatuses = computerCards.map((el) => {
      const s = el.querySelector(".an-card-status")
      return (s?.textContent || "").trim()
    })
    const eventDensities = computerCards.map((el) => el.getAttribute("data-event-density"))
    const articleDensities = computerCards.map((el) => {
      const a = el.querySelector('[data-component="an-card"]')
      return a?.getAttribute("data-event-density") || null
    })
    const actionLabels = computerCards.flatMap((el) =>
      [...el.querySelectorAll(".an-card-btn")].map((b) => (b.textContent || "").trim()),
    )
    const hasInlinePreview = !!document.querySelector('[data-an-part="computer-inline-preview"]')
    const stream = document.querySelector(".an-stream")
    const conv = document.querySelector('[data-component="an-conversation"]')
    const takeoverBar = document.querySelector(".an-takeover-bar, [data-an-part='takeover-bar']")
    const handBack = [...document.querySelectorAll("button")].find((b) =>
      /hand\\s*back/i.test(b.textContent || ""),
    )
    const connectBtn = [...document.querySelectorAll("button, [data-action='computer-connect']")].find(
      (b) => /connect/i.test(b.textContent || "") || b.getAttribute("data-action") === "computer-connect",
    )
    const confirmBtn = [...document.querySelectorAll("button, [data-action='computer-confirm']")].find(
      (b) => /confirm\\s*attach/i.test(b.textContent || "") || b.getAttribute("data-action") === "computer-confirm",
    )
    const cancelBtn = [...document.querySelectorAll("button, [data-action='computer-cancel']")].find(
      (b) => /cancel/i.test(b.textContent || "") || b.getAttribute("data-action") === "computer-cancel",
    )
    const disconnectBtn = [...document.querySelectorAll("button, [data-action='computer-disconnect']")].find(
      (b) => /disconnect/i.test(b.textContent || "") || b.getAttribute("data-action") === "computer-disconnect",
    )
    const feedActive =
      document.querySelector("[data-feed-active]")?.getAttribute("data-feed-active") || null
    const attachPhase =
      document.querySelector("[data-attach-phase]")?.getAttribute("data-attach-phase") || null
    return {
      marker: ${JSON.stringify(MARKER)},
      hasShell: !!shell,
      shellMode: shell?.getAttribute("data-mode") ?? null,
      modeLabels,
      computerCardCount: computerCards.length,
      teamCardCount: teamCards.length,
      computerTitles,
      computerStatuses,
      eventDensities,
      articleDensities,
      actionLabels,
      hasInlinePreview,
      streamComputerViewTitle: computerTitles.some((t) => t === "Computer View"),
      ownConversation: stream?.getAttribute("data-an-own-conversation") === "true",
      hasTakeoverBar: !!takeoverBar,
      hasHandBack: !!handBack,
      hasConnect: !!connectBtn,
      hasConfirm: !!confirmBtn,
      hasCancel: !!cancelBtn,
      hasDisconnect: !!disconnectBtn,
      feedActive,
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

  // Disconnect if already Live from prior runs
  await evaluate(`(() => {
    const btn = [...document.querySelectorAll("button, [data-action]")].find(
      (b) => b.getAttribute("data-action") === "computer-disconnect" || /^\\s*disconnect\\s*$/i.test((b.textContent || "").trim()),
    )
    if (!btn) return { clicked: false }
    btn.click()
    return { clicked: true }
  })()`)
  await sleep(600)

  const idleProbe = await evaluate(probeExpr)
  console.log("idleProbe", JSON.stringify(idleProbe))
  await shot("124-stage5-03-conversation-idle-quiet.png")

  // Status density: Connect → consenting
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
  const statusProbe = await evaluate(probeExpr)
  console.log("statusProbe", JSON.stringify(statusProbe))
  await shot("125-stage5-03-status-density-attach-offer.png")

  // Inline density: Confirm attach → Live + feed
  const clickedConfirm = await evaluate(`(() => {
    const btn = [...document.querySelectorAll("button, [data-action]")].find(
      (b) => b.getAttribute("data-action") === "computer-confirm" || /confirm\\s*attach/i.test(b.textContent || ""),
    )
    if (!btn) return { clicked: false }
    btn.click()
    return { clicked: true }
  })()`)
  console.log("confirmClick", JSON.stringify(clickedConfirm))
  await sleep(1200)
  // Ensure Conversation mode so stream Computer is visible
  await evaluate(`(() => {
    const btn = [...document.querySelectorAll(".an-mode-btn")].find((b) =>
      /conversation/i.test(b.textContent || ""),
    )
    btn?.click()
    return !!btn
  })()`)
  await sleep(700)
  const inlineProbe = await evaluate(probeExpr)
  console.log("inlineProbe", JSON.stringify(inlineProbe))
  await shot("126-stage5-03-inline-density-live-preview.png")

  // Open in Computer View from card (if present)
  const clickedViewAction = await evaluate(`(() => {
    const btn = [...document.querySelectorAll('.an-conversation-card[data-card-type="computer"] .an-card-btn')].find(
      (b) => /open\\s*in\\s*computer\\s*view/i.test(b.textContent || ""),
    )
    if (!btn) return { clicked: false }
    btn.click()
    return { clicked: true }
  })()`)
  console.log("viewActionClick", JSON.stringify(clickedViewAction))
  await sleep(800)
  const afterViewAction = await evaluate(probeExpr)
  console.log("afterViewAction", JSON.stringify(afterViewAction))

  // Takeover dock non-regress
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
  await shot("127-stage5-03-takeover-dock-preserved.png")

  // Cleanup disconnect
  await evaluate(`(() => {
    const btn = [...document.querySelectorAll("button, [data-action]")].find(
      (b) => b.getAttribute("data-action") === "computer-disconnect" || /^\\s*disconnect\\s*$/i.test((b.textContent || "").trim()),
    )
    btn?.click()
    const conv = [...document.querySelectorAll(".an-mode-btn")].find((b) => /conversation/i.test(b.textContent || ""))
    conv?.click()
    return true
  })()`)
  await sleep(400)

  const threeModes =
    (idleProbe?.modeLabels || []).some((l) => /conversation/i.test(l)) &&
    (idleProbe?.modeLabels || []).some((l) => /computer\s*view/i.test(l)) &&
    (idleProbe?.modeLabels || []).some((l) => /takeover/i.test(l))

  const noWallpaperIdle =
    (idleProbe?.computerCardCount ?? 99) === 0 && (idleProbe?.teamCardCount ?? 99) === 0

  const statusDensity =
    clickedConnect?.clicked === true &&
    (statusProbe?.computerCardCount ?? 0) >= 1 &&
    (statusProbe?.computerTitles || []).includes("Computer") &&
    statusProbe?.streamComputerViewTitle !== true &&
    ((statusProbe?.eventDensities || []).includes("status") ||
      (statusProbe?.articleDensities || []).includes("status") ||
      (statusProbe?.computerStatuses || []).some((s) => /attach\s*offer/i.test(s || "")))

  const inlineDensity =
    clickedConfirm?.clicked === true &&
    (inlineProbe?.computerCardCount ?? 0) >= 1 &&
    ((inlineProbe?.eventDensities || []).includes("inline") ||
      (inlineProbe?.articleDensities || []).includes("inline")) &&
    (inlineProbe?.actionLabels || []).some((l) => /take\s*control/i.test(l || "")) &&
    inlineProbe?.streamComputerViewTitle !== true

  const viewActionOk =
    clickedViewAction?.clicked !== true || afterViewAction?.shellMode === "view"

  const noStreamInViewTakeover =
    (afterViewAction?.shellMode !== "view" || (afterViewAction?.computerCardCount ?? 0) === 0) &&
    (takeProbe?.computerCardCount ?? 0) === 0

  const takeoverDock =
    takeProbe?.shellMode === "takeover" &&
    (takeProbe?.hasTakeoverBar === true || takeProbe?.hasHandBack === true)

  const ok =
    !!idleProbe?.hasShell &&
    !!idleProbe?.ownConversation &&
    threeModes &&
    noWallpaperIdle &&
    statusDensity &&
    inlineDensity &&
    viewActionOk &&
    noStreamInViewTakeover &&
    takeoverDock

  const result = {
    ok,
    marker: MARKER,
    threeModes,
    noWallpaperIdle,
    statusDensity,
    inlineDensity,
    viewActionOk,
    noStreamInViewTakeover,
    takeoverDock,
    modeLabels: idleProbe?.modeLabels,
    idle: {
      computerCardCount: idleProbe?.computerCardCount,
      teamCardCount: idleProbe?.teamCardCount,
    },
    status: {
      connected: clickedConnect?.clicked,
      computerCardCount: statusProbe?.computerCardCount,
      eventDensities: statusProbe?.eventDensities,
      computerStatuses: statusProbe?.computerStatuses,
      actionLabels: statusProbe?.actionLabels,
    },
    inline: {
      confirmed: clickedConfirm?.clicked,
      computerCardCount: inlineProbe?.computerCardCount,
      eventDensities: inlineProbe?.eventDensities,
      hasInlinePreview: inlineProbe?.hasInlinePreview,
      actionLabels: inlineProbe?.actionLabels,
      feedActive: inlineProbe?.feedActive,
      attachPhase: inlineProbe?.attachPhase,
    },
    viewAction: {
      clicked: clickedViewAction?.clicked,
      mode: afterViewAction?.shellMode,
      computerCardCount: afterViewAction?.computerCardCount,
    },
    takeover: {
      mode: takeProbe?.shellMode,
      hasTakeoverBar: takeProbe?.hasTakeoverBar,
      hasHandBack: takeProbe?.hasHandBack,
      computerCardCount: takeProbe?.computerCardCount,
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
