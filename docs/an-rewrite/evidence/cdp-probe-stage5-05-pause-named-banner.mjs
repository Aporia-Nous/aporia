/**
 * AP-STAGE5-05 — Pause + named controlling banner (live-DEV CDP).
 * Bars: idle quiet; Live named banner (not generic "Bot is controlling" when
 * agent/roster name available); Pause → Resume + paused banner; Takeover Hand-back.
 * Native window capture NOT claimed. Always closes WebSocket. No merge/push/install.
 * Do not self-PASS.
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import WebSocket from "ws"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, "screenshots-2026-10-18")
const MARKER = `AP-STAGE5-05 pause-named-banner ${Date.now()}`
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
  await sleep(3000)

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
    const panel = document.querySelector(".an-computer[data-an-scope], .an-computer")
    const scopeBanner = document.querySelector(".an-computer-scope-banner, [data-an-part='computer-scope']")
    const drive = document.querySelector('[data-an-part="computer-drive-controls"]')
    const pauseBtn = document.querySelector('[data-action="computer-pause"]')
    const resumeBtn = document.querySelector('[data-action="computer-resume"]')
    const takeOverBtn = document.querySelector('[data-action="computer-take-over"]')
    const takeoverBar = document.querySelector(".an-takeover-bar")
    const handBack = [...document.querySelectorAll("button")].find((b) =>
      /hand\\s*back/i.test(b.textContent || ""),
    )
    const takeoverCopy = document.querySelector(".an-takeover-copy")
    const stream = document.querySelector(".an-stream")
    const selected = document.querySelector('.an-roster-member[data-selected="true"], [data-selected="true"].an-roster-member')
    const selectedName = (selected?.getAttribute("data-name") || selected?.querySelector(".an-roster-name")?.textContent || "").trim()
    const banner = (scopeBanner?.textContent || "").trim()
    const controllingMatch = banner.match(/^(.+?)\\s+is controlling/i)
    const pausedMatch = banner.match(/^(.+?)\\s+paused/i)
    return {
      marker: ${JSON.stringify(MARKER)},
      hasShell: !!shell,
      shellMode: shell?.getAttribute("data-mode") ?? null,
      modeLabels,
      computerCardCount: computerCards.length,
      teamCardCount: teamCards.length,
      computerTitles,
      streamComputerViewTitle: computerTitles.some((t) => t === "Computer View"),
      ownConversation: stream?.getAttribute("data-an-own-conversation") === "true",
      scopeKind: panel?.getAttribute("data-scope-kind") ?? null,
      boundary: panel?.getAttribute("data-boundary") ?? null,
      botPaused: panel?.getAttribute("data-bot-paused") ?? null,
      scopeBannerText: banner,
      controllingName: controllingMatch?.[1]?.trim() || null,
      pausedName: pausedMatch?.[1]?.trim() || null,
      selectedName: selectedName || null,
      hasDriveControls: !!drive,
      hasPause: !!pauseBtn,
      hasResume: !!resumeBtn,
      hasTakeOver: !!takeOverBtn,
      hasTakeoverBar: !!takeoverBar,
      hasHandBack: !!handBack,
      takeoverCopy: (takeoverCopy?.textContent || "").trim(),
      attachPhase: panel?.getAttribute("data-attach-phase") ?? null,
      feedActive: panel?.getAttribute("data-feed-active") ?? null,
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
  }

  await evaluate(`(() => {
    const btn = [...document.querySelectorAll(".an-mode-btn")].find((b) =>
      /conversation/i.test(b.textContent || ""),
    )
    btn?.click()
    return !!btn
  })()`)
  await sleep(700)

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
  await shot("132-stage5-05-conversation-idle-quiet.png")

  const clickedConnect = await evaluate(`(() => {
    const btn = [...document.querySelectorAll("button, [data-action]")].find(
      (b) => b.getAttribute("data-action") === "computer-connect" || /^\\s*connect\\s*$/i.test((b.textContent || "").trim()),
    )
    if (!btn) return { clicked: false }
    btn.click()
    return { clicked: true }
  })()`)
  console.log("connectClick", JSON.stringify(clickedConnect))
  await sleep(800)

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

  await evaluate(`(() => {
    const btn = [...document.querySelectorAll(".an-mode-btn")].find((b) =>
      /computer\\s*view/i.test(b.textContent || ""),
    )
    btn?.click()
    return !!btn
  })()`)
  await sleep(900)

  const liveProbe = await evaluate(probeExpr)
  console.log("liveProbe", JSON.stringify(liveProbe))
  await shot("133-stage5-05-named-banner-live.png")

  const clickedPause = await evaluate(`(() => {
    const btn = document.querySelector('[data-action="computer-pause"]')
    if (!btn) return { clicked: false }
    btn.click()
    return { clicked: true }
  })()`)
  console.log("pauseClick", JSON.stringify(clickedPause))
  await sleep(800)

  const pauseProbe = await evaluate(probeExpr)
  console.log("pauseProbe", JSON.stringify(pauseProbe))
  await shot("134-stage5-05-pause-resume-banner.png")

  await evaluate(`(() => {
    const btn = document.querySelector('[data-action="computer-resume"]')
    btn?.click()
    return !!btn
  })()`)
  await sleep(600)

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
  await shot("135-stage5-05-takeover-handback-preserved.png")

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

  const namedBanner =
    clickedConfirm?.clicked === true &&
    /is controlling/i.test(liveProbe?.scopeBannerText || "") &&
    liveProbe?.controllingName &&
    liveProbe.controllingName !== "Bot" &&
    !/^Bot\b/i.test(liveProbe.controllingName)

  const pauseOk =
    clickedPause?.clicked === true &&
    liveProbe?.hasPause === true &&
    liveProbe?.hasTakeOver === true &&
    pauseProbe?.hasResume === true &&
    pauseProbe?.botPaused === "true" &&
    /paused/i.test(pauseProbe?.scopeBannerText || "") &&
    pauseProbe?.pausedName &&
    pauseProbe.pausedName !== "Bot"

  const takeoverOk =
    takeProbe?.hasHandBack === true &&
    (takeProbe?.hasTakeoverBar === true || takeProbe?.shellMode === "takeover") &&
    (/You are controlling/i.test(takeProbe?.scopeBannerText || "") ||
      /You are controlling/i.test(takeProbe?.takeoverCopy || ""))

  const noDualTitle =
    liveProbe?.streamComputerViewTitle !== true &&
    pauseProbe?.streamComputerViewTitle !== true

  const ok = threeModes && noWallpaperIdle && namedBanner && pauseOk && takeoverOk && noDualTitle

  const result = {
    marker: MARKER,
    ok,
    threeModes,
    noWallpaperIdle,
    namedBanner,
    pauseOk,
    takeoverOk,
    noDualTitle,
    live: {
      banner: liveProbe?.scopeBannerText,
      controllingName: liveProbe?.controllingName,
      hasPause: liveProbe?.hasPause,
      hasTakeOver: liveProbe?.hasTakeOver,
      boundary: liveProbe?.boundary,
    },
    pause: {
      banner: pauseProbe?.scopeBannerText,
      pausedName: pauseProbe?.pausedName,
      botPaused: pauseProbe?.botPaused,
      hasResume: pauseProbe?.hasResume,
    },
    takeover: {
      banner: takeProbe?.scopeBannerText,
      copy: takeProbe?.takeoverCopy,
      handBack: takeProbe?.hasHandBack,
    },
  }

  console.log("RESULT", JSON.stringify(result, null, 2))
  exitCode = ok ? 0 : 3
} catch (err) {
  console.error("probe failed", err)
  exitCode = exitCode === 2 ? 2 : 1
} finally {
  try {
    ws?.close()
    console.log("ws.closed")
  } catch {
    /* ignore */
  }
  process.exit(exitCode)
}
