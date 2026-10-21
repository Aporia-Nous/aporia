/**
 * AP-STAGE5-ACCEPT — Option C acceptance against Review-sidebar UX (STAGE5-08).
 *
 * Required gates (PASS/FAIL): C1–C14
 * Acceptable residuals (not FAIL): R1 native capture BLOCKED; R2 global OS hook UNSUPPORTED
 *
 * Always closes WebSocket. No merge/push/install. Do not self-PASS the board.
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import WebSocket from "ws"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, "screenshots-2026-10-18")
const MARKER = `AP-STAGE5-ACCEPT option-c ${Date.now()}`
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
    const visibleModePills = modeBtns.filter((b) => {
      const s = getComputedStyle(b)
      return s.display !== "none" && s.visibility !== "hidden" && b.offsetParent !== null
    })
    const modeLabels = visibleModePills.map((b) => (b.textContent || "").trim()).filter(Boolean)
    const reviewChrome = document.querySelector('[data-an-part="review-chrome"], [data-action="review-toggle"]')
    const review = document.querySelector('[data-component="an-review"], [data-an-part="review"]')
    const reviewComputer = document.querySelector('[data-an-part="review-computer"], [data-hosts-computer-view="true"]')
    const computerInReview = review?.querySelector('[data-an-part="computer-attach"], .an-computer')
    const panel = document.querySelector(".an-computer[data-an-scope], .an-computer")
    const workspace = document.querySelector(".an-computer-workspace")
    const scopeBanner = document.querySelector('[data-an-part="computer-scope"]')
    const stream = document.querySelector(".an-stream[data-conversation-primary='true'], .an-stream")
    const inCards = [...document.querySelectorAll('[data-an-part="in-conversation-card"]')]
    const computerCards = inCards.filter((el) => el.getAttribute("data-card-type") === "computer")
    const teamCards = inCards.filter((el) => el.getAttribute("data-card-type") === "team")
    const computerTitles = computerCards.map((el) => {
      const t = el.querySelector(".an-card-title")
      return (t?.textContent || "").trim()
    })
    const actionLabels = computerCards.flatMap((el) =>
      [...el.querySelectorAll(".an-card-btn")].map((b) => (b.textContent || "").trim()),
    )
    const takeoverDock = document.querySelector(
      '[data-an-part="review-takeover-dock"], .an-review-takeover-dock, [data-an-part="takeover-bar"], .an-takeover-bar',
    )
    const handBack = [...document.querySelectorAll("button")].find((b) =>
      /hand\\s*back/i.test(b.textContent || ""),
    )
    const stopBtn = [...document.querySelectorAll("button")].find((b) =>
      /^\\s*stop\\s*$/i.test((b.textContent || "").trim()),
    )
    const pauseBtn = [...document.querySelectorAll("button, [data-action]")].find(
      (b) => b.getAttribute("data-action") === "computer-pause" || /^\\s*pause\\s*$/i.test((b.textContent || "").trim()),
    )
    const resumeBtn = [...document.querySelectorAll("button, [data-action]")].find(
      (b) => b.getAttribute("data-action") === "computer-resume" || /^\\s*resume\\s*$/i.test((b.textContent || "").trim()),
    )
    const takeOverBtn = [...document.querySelectorAll("button, [data-action]")].find(
      (b) => b.getAttribute("data-action") === "computer-takeover" || /^\\s*take\\s*over\\s*$/i.test((b.textContent || "").trim()),
    )
    const computerTitle =
      computerInReview?.querySelector(".an-computer-header strong, .an-computer-title")?.textContent?.trim() ||
      panel?.querySelector(".an-computer-header strong, .an-computer-title")?.textContent?.trim() ||
      null
    const brand =
      document.querySelector(".an-roster-header strong, .an-nav-brand, [data-an-part='product-name']")?.textContent?.trim() ||
      null
    const enginePort =
      document.querySelector("[data-an-engine-port]")?.getAttribute("data-an-engine-port") ||
      shell?.getAttribute("data-an-engine-port") ||
      null
    const bannerText = (scopeBanner?.textContent || "").trim()
    const controllingMatch = bannerText.match(/([A-Za-z][\\w .'-]{0,40})\\s+is controlling/i)
    const pausedMatch = bannerText.match(/([A-Za-z][\\w .'-]{0,40})\\s+paused/i)
    return {
      hasShell: !!shell,
      conversationPrimary: shell?.getAttribute("data-conversation-primary") === "true",
      reviewHostsComputer: shell?.getAttribute("data-review-hosts-computer") === "true",
      peerModePillsAttr: shell?.getAttribute("data-peer-mode-pills"),
      shellUx: shell?.getAttribute("data-shell-ux") || null,
      mode: shell?.getAttribute("data-mode") || null,
      visibleModePillCount: visibleModePills.length,
      modeLabels,
      hasReviewChrome: !!reviewChrome,
      reviewOpen: !!review,
      hasReviewComputer: !!reviewComputer || !!computerInReview,
      computerTitle,
      streamPrimary: stream?.getAttribute("data-conversation-primary") === "true" || !!stream,
      ownConversation: stream?.getAttribute("data-an-own-conversation") === "true",
      computerCardCount: computerCards.length,
      teamCardCount: teamCards.length,
      computerTitles,
      streamComputerViewTitle: computerTitles.some((t) => t === "Computer View"),
      actionLabels,
      hasInlineOpenView: actionLabels.some((l) => /open\\s*in\\s*computer\\s*view/i.test(l)),
      hasTakeControl: actionLabels.some((l) => /take\\s*control/i.test(l)),
      scopeKind: panel?.getAttribute("data-scope-kind") ?? null,
      scopeTarget: panel?.getAttribute("data-scope-target") ?? null,
      boundary: panel?.getAttribute("data-boundary") ?? workspace?.getAttribute("data-boundary") ?? null,
      botPaused: panel?.getAttribute("data-bot-paused") ?? null,
      attachPhase: panel?.getAttribute("data-attach-phase") ?? null,
      feedActive: panel?.getAttribute("data-feed-active") ?? null,
      scopeBannerText: bannerText,
      controllingName: controllingMatch?.[1]?.trim() || null,
      pausedName: pausedMatch?.[1]?.trim() || null,
      hasTakeoverDock: !!takeoverDock,
      hasHandBack: !!handBack,
      hasStop: !!stopBtn,
      hasPause: !!pauseBtn,
      hasResume: !!resumeBtn,
      hasTakeOver: !!takeOverBtn,
      brand,
      enginePort,
      productAporetic: /aporetic/i.test(document.body?.innerText || "") || /aporetic/i.test(brand || ""),
    }
  })()`

  let value = null
  for (let i = 0; i < 40; i++) {
    value = await evaluate(probeExpr)
    console.log("probe", i, JSON.stringify(value))
    if (value?.hasShell && value?.conversationPrimary) break
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

  // Collapse Review + disconnect → idle Conversation
  await evaluate(`(() => {
    const btn = document.querySelector('[data-action="review-toggle"]')
    if (btn && btn.getAttribute("data-active") === "true") btn.click()
    const close = document.querySelector('[data-action="review-collapse"]')
    if (close) close.click()
    return true
  })()`)
  await sleep(600)
  await evaluate(`(() => {
    const btn = [...document.querySelectorAll("button, [data-action]")].find(
      (b) => b.getAttribute("data-action") === "computer-disconnect" || /^\\s*disconnect\\s*$/i.test((b.textContent || "").trim()),
    )
    btn?.click()
    return !!btn
  })()`)
  await sleep(500)

  const idleProbe = await evaluate(probeExpr)
  console.log("idleProbe", JSON.stringify(idleProbe))
  await shot("150-stage5-accept-idle-conversation.png")

  // Isolation + OS residual gate (same API shapes as STAGE5-06/07 probes; no peer pills)
  const gateProbe = await evaluate(`(() => {
    const iso = window.__anCdpIsolation
    const osp = window.__anOsPointerPause
    if (!iso || !osp) return { ok: false, reason: "missing probe hooks" }
    const scope = {
      kind: "tab-group",
      tabIds: ["tab_ok", "tab_two"],
      targetName: "Mission pair",
      sessionID: "ses_accept",
    }
    const authorizeOk = iso.authorizeCdpRegionAction(scope, "tab_ok")
    const rejectOutsider = iso.authorizeCdpRegionAction(scope, "tab_outsider")
    const widen = iso.refuseSilentTabGroupWiden(scope, ["tab_ok", "extra"])
    const native = iso.attemptNativeWindowCapture({ windowId: "win_x" })
    const driving = {
      sessionID: "ses_accept",
      controller: "bot",
      botPaused: false,
      userInputGranted: false,
      needsFreshObservation: false,
    }
    const chromeOk = osp.shouldApplyComputerChromeAutoPause(true, driving) === true
    const focusAlways =
      osp.shouldApplyExternalPageAutoPause({
        live: true,
        control: driving,
        aporeticWindowFocused: true,
        page: { ok: true, installed: true, hit: true, kinds: ["focus"] },
      }) === true
    const pointerBlurOnly =
      osp.shouldApplyExternalPageAutoPause({
        live: true,
        control: driving,
        aporeticWindowFocused: true,
        page: { ok: true, installed: true, hit: true, kinds: ["pointer"] },
      }) === false &&
      osp.shouldApplyExternalPageAutoPause({
        live: true,
        control: driving,
        aporeticWindowFocused: false,
        page: { ok: true, installed: true, hit: true, kinds: ["pointer"] },
      }) === true
    return {
      ok: true,
      authorizeOk: authorizeOk?.ok === true && authorizeOk.regionId === "tab_ok",
      rejectOutsider: rejectOutsider?.ok === false && /Unauthorized|not widened/i.test(rejectOutsider?.error || ""),
      widenRefused: widen?.ok === false,
      nativeBlocked: native?.ok === false && native?.status === "BLOCKED",
      nativeStatus: native?.status || null,
      chromeOk,
      focusAlways,
      pointerBlurOnly,
      chromePauseOn: osp.surface?.computerChromeAutoPause === true,
      cdpPagePauseOn: osp.surface?.cdpPageAutoPause === true,
      globalHookOff: osp.surface?.globalOsPointerHook === false,
      globalHookStatus: osp.surface?.globalOsPointerHookStatus || null,
      tabIsolation: iso.surface?.browserTabGroupIsolation === true,
    }
  })()`)
  console.log("gateProbe", JSON.stringify(gateProbe))

  // Open Review → Computer View sidebar
  const openedReview = await evaluate(`(() => {
    const btn = document.querySelector('[data-action="review-toggle"]')
    if (!btn) return { clicked: false, reason: "no-toggle" }
    btn.click()
    return { clicked: true }
  })()`)
  console.log("openReview", JSON.stringify(openedReview))
  await sleep(900)

  const reviewProbe = await evaluate(probeExpr)
  console.log("reviewProbe", JSON.stringify(reviewProbe))
  await shot("151-stage5-accept-review-computer.png")

  // Connect + confirm attach
  await evaluate(`(() => {
    const btn = [...document.querySelectorAll("button, [data-action]")].find(
      (b) => b.getAttribute("data-action") === "computer-connect" || /^\\s*connect\\s*$/i.test((b.textContent || "").trim()),
    )
    btn?.click()
    return !!btn
  })()`)
  await sleep(800)
  await evaluate(`(() => {
    const btn = [...document.querySelectorAll("button, [data-action]")].find(
      (b) => b.getAttribute("data-action") === "computer-confirm" || /confirm\\s*attach/i.test(b.textContent || ""),
    )
    btn?.click()
    return !!btn
  })()`)
  await sleep(1200)

  // Ensure bot driving (resume if stuck paused)
  await evaluate(`(() => {
    const btn = [...document.querySelectorAll("button, [data-action]")].find(
      (b) => b.getAttribute("data-action") === "computer-resume" || /^\\s*resume\\s*$/i.test((b.textContent || "").trim()),
    )
    btn?.click()
    return !!btn
  })()`)
  await sleep(500)

  const liveProbe = await evaluate(probeExpr)
  console.log("liveProbe", JSON.stringify(liveProbe))
  await shot("152-stage5-accept-live-named-boundary.png")

  // Pause without Takeover
  const pauseClick = await evaluate(`(() => {
    const btn = [...document.querySelectorAll("button, [data-action]")].find(
      (b) => b.getAttribute("data-action") === "computer-pause" || /^\\s*pause\\s*$/i.test((b.textContent || "").trim()),
    )
    if (!btn) return { clicked: false }
    btn.click()
    return { clicked: true }
  })()`)
  console.log("pauseClick", JSON.stringify(pauseClick))
  await sleep(800)
  const pauseProbe = await evaluate(probeExpr)
  console.log("pauseProbe", JSON.stringify(pauseProbe))
  await shot("153-stage5-accept-pause-resume.png")

  // Resume then Takeover in-view
  await evaluate(`(() => {
    const btn = [...document.querySelectorAll("button, [data-action]")].find(
      (b) => b.getAttribute("data-action") === "computer-resume" || /^\\s*resume\\s*$/i.test((b.textContent || "").trim()),
    )
    btn?.click()
    return !!btn
  })()`)
  await sleep(500)

  const takeOver = await evaluate(`(() => {
    const btn = [...document.querySelectorAll("button, [data-action]")].find(
      (b) => b.getAttribute("data-action") === "computer-takeover" || /^\\s*take\\s*over\\s*$/i.test((b.textContent || "").trim()),
    )
    if (!btn) return { clicked: false }
    btn.click()
    return { clicked: true }
  })()`)
  console.log("takeOver", JSON.stringify(takeOver))
  await sleep(900)
  const takeoverProbe = await evaluate(probeExpr)
  console.log("takeoverProbe", JSON.stringify(takeoverProbe))
  await shot("154-stage5-accept-takeover-in-review.png")

  // Hand back
  await evaluate(`(() => {
    const btn = [...document.querySelectorAll("button")].find((b) => /hand\\s*back/i.test(b.textContent || ""))
    btn?.click()
    return !!btn
  })()`)
  await sleep(800)
  const handbackProbe = await evaluate(probeExpr)
  console.log("handbackProbe", JSON.stringify(handbackProbe))
  await shot("155-stage5-accept-handback-primary.png")

  // Optional: collapse Review and check Status/Inline card density from Conversation
  await evaluate(`(() => {
    const btn = document.querySelector('[data-action="review-toggle"]')
    if (btn && btn.getAttribute("data-active") === "true") btn.click()
    const close = document.querySelector('[data-action="review-collapse"]')
    if (close) close.click()
    return true
  })()`)
  await sleep(700)
  const streamLiveProbe = await evaluate(probeExpr)
  console.log("streamLiveProbe", JSON.stringify(streamLiveProbe))

  const gates = {
    C1_shell_branding:
      idleProbe?.hasShell === true &&
      (idleProbe?.productAporetic === true || /aporetic/i.test(idleProbe?.brand || "") || idleProbe?.brand === "AN"),
    C2_conversation_primary:
      idleProbe?.conversationPrimary === true &&
      liveProbe?.conversationPrimary === true &&
      takeoverProbe?.conversationPrimary === true &&
      handbackProbe?.conversationPrimary === true,
    C3_no_peer_mode_pills:
      (idleProbe?.visibleModePillCount ?? 99) === 0 &&
      idleProbe?.peerModePillsAttr === "false" &&
      !(idleProbe?.modeLabels || []).some((l) => /computer\s*view|takeover/i.test(l)),
    C4_review_hosts_computer_view:
      idleProbe?.hasReviewChrome === true &&
      idleProbe?.reviewHostsComputer === true &&
      reviewProbe?.reviewOpen === true &&
      (reviewProbe?.hasReviewComputer === true || liveProbe?.hasReviewComputer === true) &&
      (!liveProbe?.computerTitle || liveProbe.computerTitle === "Computer View"),
    C5_idle_quiet_no_wallpaper:
      (idleProbe?.computerCardCount ?? 99) === 0 && (idleProbe?.teamCardCount ?? 99) === 0,
    C6_no_dual_computer_view_title:
      idleProbe?.streamComputerViewTitle !== true &&
      liveProbe?.streamComputerViewTitle !== true &&
      streamLiveProbe?.streamComputerViewTitle !== true,
    C7_live_scope_gold_named:
      liveProbe?.boundary === "electric-gold" &&
      /is controlling/i.test(liveProbe?.scopeBannerText || "") &&
      !!liveProbe?.controllingName &&
      liveProbe.controllingName !== "Bot" &&
      !/^Bot\b/i.test(liveProbe.controllingName),
    C8_pause_resume_without_takeover:
      pauseClick?.clicked === true &&
      pauseProbe?.hasResume === true &&
      pauseProbe?.botPaused === "true" &&
      /paused/i.test(pauseProbe?.scopeBannerText || "") &&
      !!pauseProbe?.pausedName &&
      pauseProbe.pausedName !== "Bot" &&
      pauseProbe?.mode !== "takeover" &&
      pauseProbe?.hasHandBack !== true,
    C9_takeover_in_view_dock:
      takeOver?.clicked === true &&
      (takeoverProbe?.hasTakeoverDock === true || takeoverProbe?.hasHandBack === true) &&
      takeoverProbe?.hasHandBack === true &&
      takeoverProbe?.streamPrimary === true &&
      takeoverProbe?.conversationPrimary === true,
    C10_handback_keeps_primary_review:
      handbackProbe?.conversationPrimary === true &&
      handbackProbe?.reviewOpen === true &&
      (handbackProbe?.mode === "view" || handbackProbe?.mode === "conversation") &&
      handbackProbe?.hasHandBack !== true,
    C11_cdp_isolation_gates:
      gateProbe?.ok === true &&
      gateProbe?.authorizeOk === true &&
      gateProbe?.rejectOutsider === true &&
      gateProbe?.widenRefused === true,
    C12_os_pointer_surfaces:
      gateProbe?.ok === true &&
      gateProbe?.chromePauseOn === true &&
      gateProbe?.cdpPagePauseOn === true &&
      gateProbe?.chromeOk === true &&
      gateProbe?.focusAlways === true &&
      gateProbe?.pointerBlurOnly === true,
    C13_engine_port_path:
      idleProbe?.enginePort === "03" ||
      liveProbe?.enginePort === "03" ||
      takeoverProbe?.enginePort === "03" ||
      handbackProbe?.enginePort === "03",
    C14_shell_ux_stage5_08:
      idleProbe?.shellUx === "AP-STAGE5-08" || liveProbe?.shellUx === "AP-STAGE5-08",
  }

  const residuals = {
    R1_native_capture_blocked_acceptable:
      gateProbe?.nativeBlocked === true && gateProbe?.nativeStatus === "BLOCKED",
    R2_global_os_hook_unsupported_acceptable:
      gateProbe?.globalHookOff === true &&
      (gateProbe?.globalHookStatus === "UNSUPPORTED" || gateProbe?.globalHookStatus == null),
  }

  // Optional density observation (not hard-fail if Live stream card absent while Review hosts Computer)
  const densityObs = {
    streamLiveHasComputerCard: (streamLiveProbe?.computerCardCount ?? 0) > 0,
    hasInlineOpenView: streamLiveProbe?.hasInlineOpenView === true,
    hasTakeControl: streamLiveProbe?.hasTakeControl === true,
  }

  const requiredPass = Object.values(gates).every(Boolean)
  const residualsHonest = Object.values(residuals).every(Boolean)
  const ok = requiredPass && residualsHonest

  const result = {
    ok,
    marker: MARKER,
    overall: ok ? "GATE PASS" : "GATE FAIL",
    stage5CompleteTechnical: ok,
    gates,
    residuals,
    densityObs,
    probes: {
      idleProbe,
      gateProbe,
      reviewProbe,
      liveProbe,
      pauseProbe,
      takeoverProbe,
      handbackProbe,
      streamLiveProbe,
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
