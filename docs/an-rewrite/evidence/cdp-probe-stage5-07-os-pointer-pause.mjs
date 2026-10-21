/**
 * AP-STAGE5-07 — OS-pointer / CDP focus auto-pause (live-DEV CDP).
 * Bars: idle quiet; Live os-pointer-pause=on; chrome pointer → botPaused;
 * chrome focus → botPaused; __anOsPointerPause gates; native BLOCKED honest;
 * Takeover Hand-back preserved. External Edge page poll covered by units + relay;
 * not required when only local-workspace attached. Always closes WebSocket.
 * Do not self-PASS. No merge/push/install.
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import WebSocket from "ws"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, "screenshots-2026-10-18")
const MARKER = `AP-STAGE5-07 os-pointer-pause ${Date.now()}`
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
    const modeBtns = [...document.querySelectorAll(".an-mode-btn")]
    const modeLabels = modeBtns.map((b) => (b.textContent || "").trim()).filter(Boolean)
    const inCards = [...document.querySelectorAll('[data-an-part="in-conversation-card"]')]
    const computerCards = inCards.filter((el) => el.getAttribute("data-card-type") === "computer")
    const teamCards = inCards.filter((el) => el.getAttribute("data-card-type") === "team")
    const computerTitles = computerCards.map((el) => {
      const t = el.querySelector(".an-card-title")
      return (t?.textContent || "").trim()
    })
    const panel = document.querySelector(".an-computer")
    const scopeBanner = document.querySelector(".an-computer-scope-banner")
    const takeoverBar = document.querySelector(".an-takeover-bar")
    const handBack = [...document.querySelectorAll("button")].find((b) =>
      /hand\\s*back/i.test(b.textContent || ""),
    )
    const stream = document.querySelector(".an-stream")
    const iso = window.__anCdpIsolation
    const osp = window.__anOsPointerPause
    return {
      marker: ${JSON.stringify(MARKER)},
      hasShell: !!shell,
      shellMode: shell?.getAttribute("data-mode") ?? null,
      modeLabels,
      computerCardCount: computerCards.length,
      teamCardCount: teamCards.length,
      streamComputerViewTitle: computerTitles.some((t) => t === "Computer View"),
      ownConversation: stream?.getAttribute("data-an-own-conversation") === "true",
      nativeCapture: panel?.getAttribute("data-native-capture") ?? null,
      osPointerPause: panel?.getAttribute("data-os-pointer-pause") ?? null,
      osPointerPart: panel?.getAttribute("data-an-part-os-pointer") ?? null,
      scopeBannerText: (scopeBanner?.textContent || "").trim(),
      hasTakeoverBar: !!takeoverBar,
      hasHandBack: !!handBack,
      hasIsoProbe: !!iso,
      hasOsProbe: !!osp,
      nativeBlocked: iso?.surface?.nativeWindowCaptureStatus === "BLOCKED",
      chromePauseOn: osp?.surface?.computerChromeAutoPause === true,
      cdpPagePauseOn: osp?.surface?.cdpPageAutoPause === true,
      globalHookOff: osp?.surface?.globalOsPointerHook === false,
      botPaused: panel?.getAttribute("data-bot-paused") ?? null,
      feedActive: panel?.getAttribute("data-feed-active") ?? null,
      attachPhase: panel?.getAttribute("data-attach-phase") ?? null,
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
  await shot("140-stage5-07-conversation-idle-quiet.png")

  const gateProbe = await evaluate(`(() => {
    const p = window.__anOsPointerPause
    const iso = window.__anCdpIsolation
    if (!p || !iso) return { ok: false, reason: "no-probe" }
    const driving = {
      sessionID: "ses_os",
      controller: "bot",
      botPaused: false,
      userInputGranted: false,
      needsFreshObservation: false,
    }
    const chromeOk = p.shouldApplyComputerChromeAutoPause(true, driving) === true
    const focusAlways = p.shouldApplyExternalPageAutoPause({
      live: true,
      control: driving,
      aporeticWindowFocused: true,
      page: { ok: true, installed: true, hit: true, kinds: ["focus"] },
    }) === true
    const pointerBlurOnly =
      p.shouldApplyExternalPageAutoPause({
        live: true,
        control: driving,
        aporeticWindowFocused: true,
        page: { ok: true, installed: true, hit: true, kinds: ["pointer"] },
      }) === false &&
      p.shouldApplyExternalPageAutoPause({
        live: true,
        control: driving,
        aporeticWindowFocused: false,
        page: { ok: true, installed: true, hit: true, kinds: ["pointer"] },
      }) === true
    const native = iso.attemptNativeWindowCapture({ windowId: "win_x" })
    return {
      ok: true,
      chromeOk,
      focusAlways,
      pointerBlurOnly,
      nativeBlocked: native?.ok === false && native?.status === "BLOCKED",
      chromePauseOn: p.surface?.computerChromeAutoPause === true,
      cdpPagePauseOn: p.surface?.cdpPageAutoPause === true,
      globalHookOff: p.surface?.globalOsPointerHook === false,
    }
  })()`)
  console.log("gateProbe", JSON.stringify(gateProbe))

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
  await shot("141-stage5-07-live-os-pointer-on.png")

  // Ensure bot is driving (resume if a prior pause stuck).
  await evaluate(`(() => {
    const btn = [...document.querySelectorAll("button, [data-action]")].find(
      (b) => b.getAttribute("data-action") === "computer-resume" || /^\\s*resume\\s*$/i.test((b.textContent || "").trim()),
    )
    if (btn) btn.click()
    return { resumed: !!btn }
  })()`)
  await sleep(500)

  const pointerPause = await evaluate(`(() => {
    const surface = document.querySelector('[data-action="computer-feed-surface"]')
    if (!surface) return { clicked: false, reason: "no-feed-surface" }
    surface.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }))
    return { clicked: true }
  })()`)
  console.log("pointerPause", JSON.stringify(pointerPause))
  await sleep(900)

  const pauseProbe = await evaluate(probeExpr)
  console.log("pauseProbe", JSON.stringify(pauseProbe))
  await shot("142-stage5-07-chrome-pointer-auto-pause.png")

  // Resume (must clear pause), then focus feed URL → auto-pause again.
  const resumeClick = await evaluate(`(() => {
    const btn = [...document.querySelectorAll("button, [data-action]")].find(
      (b) => b.getAttribute("data-action") === "computer-resume" || /^\\s*resume\\s*$/i.test((b.textContent || "").trim()),
    )
    if (btn) btn.click()
    return { resumed: !!btn }
  })()`)
  console.log("resumeClick", JSON.stringify(resumeClick))
  await sleep(700)

  const resumedProbe = await evaluate(probeExpr)
  console.log("resumedProbe", JSON.stringify(resumedProbe))

  const focusPause = await evaluate(`(() => {
    const input = document.querySelector('[data-an-part="computer-feed-url"]')
    if (!input) return { focused: false }
    input.focus()
    input.dispatchEvent(new FocusEvent("focus", { bubbles: true }))
    return { focused: true }
  })()`)
  console.log("focusPause", JSON.stringify(focusPause))
  await sleep(900)

  const focusProbe = await evaluate(probeExpr)
  console.log("focusProbe", JSON.stringify(focusProbe))
  await shot("143-stage5-07-chrome-focus-auto-pause.png")

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
  await shot("144-stage5-07-takeover-handback-preserved.png")

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

  const gatesOk =
    gateProbe?.ok === true &&
    gateProbe.chromeOk === true &&
    gateProbe.focusAlways === true &&
    gateProbe.pointerBlurOnly === true &&
    gateProbe.nativeBlocked === true &&
    gateProbe.chromePauseOn === true &&
    gateProbe.cdpPagePauseOn === true &&
    gateProbe.globalHookOff === true

  const liveOsPointer =
    clickedConfirm?.clicked === true &&
    liveProbe?.osPointerPause === "on" &&
    liveProbe?.osPointerPart === "computer-os-pointer-pause" &&
    liveProbe?.hasOsProbe === true &&
    liveProbe?.nativeCapture === "blocked"

  const chromePointerOk =
    pointerPause?.clicked === true &&
    (pauseProbe?.botPaused === "true" || /paused/i.test(pauseProbe?.scopeBannerText || ""))

  const resumeOk = resumeClick?.resumed === true && resumedProbe?.botPaused === "false"

  const chromeFocusOk =
    resumeOk &&
    focusPause?.focused === true &&
    (focusProbe?.botPaused === "true" || /paused/i.test(focusProbe?.scopeBannerText || ""))

  const takeoverOk =
    takeProbe?.hasHandBack === true &&
    (takeProbe?.hasTakeoverBar === true || takeProbe?.shellMode === "takeover")

  const noDualTitle =
    liveProbe?.streamComputerViewTitle !== true &&
    pauseProbe?.streamComputerViewTitle !== true

  const ok =
    threeModes &&
    noWallpaperIdle &&
    gatesOk &&
    liveOsPointer &&
    chromePointerOk &&
    resumeOk &&
    chromeFocusOk &&
    takeoverOk &&
    noDualTitle

  const result = {
    marker: MARKER,
    ok,
    threeModes,
    noWallpaperIdle,
    gatesOk,
    liveOsPointer,
    chromePointerOk,
    resumeOk,
    chromeFocusOk,
    takeoverOk,
    noDualTitle,
    nativeCaptureClaimed: false,
    nativeCaptureStatus: "BLOCKED",
    globalOsPointerHook: false,
    gate: gateProbe,
    pause: {
      botPaused: pauseProbe?.botPaused,
      banner: pauseProbe?.scopeBannerText,
    },
    focus: {
      botPaused: focusProbe?.botPaused,
      banner: focusProbe?.scopeBannerText,
    },
    takeover: {
      handBack: takeProbe?.hasHandBack,
      mode: takeProbe?.shellMode,
    },
  }

  console.log("RESULT", JSON.stringify(result, null, 2))
  exitCode = ok ? 0 : 3
} catch (err) {
  console.error("FAIL", err)
  exitCode = 2
} finally {
  try {
    ws?.close()
  } catch {
    // ignore
  }
  console.log("ws.closed exit", exitCode)
  process.exit(exitCode)
}
