/**
 * AP-STAGE5-06 — multi-tab CDP isolation + native capture BLOCKED (live-DEV CDP).
 * Bars: idle quiet; Live isolation attrs; window probe authorize/reject + native BLOCKED;
 * auto-pause residual wired (feed Go) units covered separately; Takeover Hand-back preserved.
 * Native OS window capture NOT claimed (BLOCKED). Always closes WebSocket. No merge/push/install.
 * Do not self-PASS.
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import WebSocket from "ws"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, "screenshots-2026-10-18")
const MARKER = `AP-STAGE5-06 cdp-isolation ${Date.now()}`
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
    const isolationNote = document.querySelector('[data-an-part="computer-cdp-isolation"]')
    const scopeBanner = document.querySelector(".an-computer-scope-banner, [data-an-part='computer-scope']")
    const takeoverBar = document.querySelector(".an-takeover-bar")
    const handBack = [...document.querySelectorAll("button")].find((b) =>
      /hand\\s*back/i.test(b.textContent || ""),
    )
    const stream = document.querySelector(".an-stream")
    const probe = window.__anCdpIsolation
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
      cdpIsolation: panel?.getAttribute("data-cdp-isolation") ?? null,
      nativeCapture: panel?.getAttribute("data-native-capture") ?? null,
      isolationPart: panel?.getAttribute("data-an-part-isolation") ?? null,
      isolationNoteText: (isolationNote?.textContent || "").trim(),
      scopeBannerText: (scopeBanner?.textContent || "").trim(),
      hasTakeoverBar: !!takeoverBar,
      hasHandBack: !!handBack,
      hasIsolationProbe: !!probe,
      probeNativeBlocked: probe?.surface?.nativeWindowCaptureStatus === "BLOCKED",
      probeTabIsolation: probe?.surface?.browserTabGroupIsolation === true,
      attachPhase: panel?.getAttribute("data-attach-phase") ?? null,
      feedActive: panel?.getAttribute("data-feed-active") ?? null,
      botPaused: panel?.getAttribute("data-bot-paused") ?? null,
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
  await shot("136-stage5-06-conversation-idle-quiet.png")

  const gateProbe = await evaluate(`(() => {
    const p = window.__anCdpIsolation
    if (!p) return { ok: false, reason: "no-probe" }
    const scope = {
      kind: "tab-group",
      tabIds: ["tab_ok", "tab_two"],
      targetName: "Mission pair",
      sessionID: "ses_cdp",
    }
    const ok = p.authorizeCdpRegionAction(scope, "tab_ok")
    const bad = p.authorizeCdpRegionAction(scope, "tab_outsider")
    const native = p.attemptNativeWindowCapture({ windowId: "win_x" })
    const filtered = p.filterCdpTargetsToScope(scope, [
      { id: "tab_ok", webSocketDebuggerUrl: "ws://127.0.0.1/1" },
      { id: "noise", webSocketDebuggerUrl: "ws://127.0.0.1/n" },
      { id: "tab_two", webSocketDebuggerUrl: "ws://127.0.0.1/2" },
    ])
    const widen = p.refuseSilentTabGroupWiden(scope, ["tab_ok", "extra"])
    return {
      ok: true,
      authorizeOk: ok?.ok === true && ok.regionId === "tab_ok",
      rejectOutsider: bad?.ok === false && /Unauthorized|not widened/i.test(bad?.error || ""),
      nativeBlocked: native?.ok === false && native?.status === "BLOCKED",
      filteredIds: (filtered || []).map((t) => t.id),
      widenRefused: widen?.ok === false,
      surfaceBlocked: p.surface?.nativeWindowCaptureStatus === "BLOCKED",
      tabIsolation: p.surface?.browserTabGroupIsolation === true,
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
  await shot("137-stage5-06-isolation-live-local.png")

  // Feed Go while bot drives → auto-pause (STAGE5-06 residual from 05).
  const autoPause = await evaluate(`(() => {
    const input = document.querySelector('[data-an-part="computer-feed-url"]')
    const go = document.querySelector('[data-action="computer-feed-go"]')
    if (!input || !go) return { clicked: false, reason: "no-feed-bar" }
    input.focus()
    input.value = "about:blank"
    input.dispatchEvent(new Event("input", { bubbles: true }))
    go.click()
    return { clicked: true }
  })()`)
  console.log("autoPauseClick", JSON.stringify(autoPause))
  await sleep(900)

  const pauseProbe = await evaluate(probeExpr)
  console.log("pauseProbe", JSON.stringify(pauseProbe))
  await shot("138-stage5-06-auto-pause-feed-go.png")

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
  await shot("139-stage5-06-takeover-handback-preserved.png")

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
    gateProbe.authorizeOk === true &&
    gateProbe.rejectOutsider === true &&
    gateProbe.nativeBlocked === true &&
    gateProbe.widenRefused === true &&
    Array.isArray(gateProbe.filteredIds) &&
    gateProbe.filteredIds.join(",") === "tab_ok,tab_two" &&
    gateProbe.surfaceBlocked === true &&
    gateProbe.tabIsolation === true

  const liveIsolation =
    clickedConfirm?.clicked === true &&
    liveProbe?.nativeCapture === "blocked" &&
    liveProbe?.isolationPart === "computer-cdp-isolation" &&
    /Local workspace|CDP isolation|iframe/i.test(liveProbe?.isolationNoteText || "") &&
    liveProbe?.hasIsolationProbe === true &&
    liveProbe?.probeNativeBlocked === true

  const autoPauseOk =
    autoPause?.clicked === true &&
    (pauseProbe?.botPaused === "true" || /paused/i.test(pauseProbe?.scopeBannerText || ""))

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
    liveIsolation &&
    autoPauseOk &&
    takeoverOk &&
    noDualTitle

  const result = {
    marker: MARKER,
    ok,
    threeModes,
    noWallpaperIdle,
    gatesOk,
    liveIsolation,
    autoPauseOk,
    takeoverOk,
    noDualTitle,
    nativeCaptureClaimed: false,
    nativeCaptureStatus: "BLOCKED",
    gate: gateProbe,
    live: {
      isolation: liveProbe?.cdpIsolation,
      nativeCapture: liveProbe?.nativeCapture,
      note: liveProbe?.isolationNoteText,
      scopeKind: liveProbe?.scopeKind,
      boundary: liveProbe?.boundary,
    },
    pause: {
      botPaused: pauseProbe?.botPaused,
      banner: pauseProbe?.scopeBannerText,
    },
    takeover: {
      handBack: takeProbe?.hasHandBack,
      mode: takeProbe?.shellMode,
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
