/**
 * AP-STAGE5-08 — Review sidebar hosts Computer View; Takeover in-view (live-DEV CDP).
 * Bars: no peer mode pills; Conversation primary; Review Computer host; Takeover dock in Review.
 * Always closes WebSocket. No merge/push/install. Do not self-PASS.
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import WebSocket from "ws"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, "screenshots-2026-10-18")
const MARKER = `AP-STAGE5-08 review-sidebar ${Date.now()}`
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
  await sleep(2800)

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
    const stream = document.querySelector(".an-stream[data-conversation-primary='true'], .an-stream")
    const takeoverDock = document.querySelector(
      '[data-an-part="review-takeover-dock"], .an-review-takeover-dock, [data-an-part="takeover-bar"]',
    )
    const handBack = [...document.querySelectorAll("button")].find((b) =>
      /hand\\s*back/i.test(b.textContent || ""),
    )
    const computerTitle =
      computerInReview?.querySelector(".an-computer-header strong, .an-computer-title")?.textContent?.trim() ||
      null
    return {
      hasShell: !!shell,
      conversationPrimary: shell?.getAttribute("data-conversation-primary") === "true",
      reviewHostsComputer: shell?.getAttribute("data-review-hosts-computer") === "true",
      peerModePills: shell?.getAttribute("data-peer-mode-pills") === "false",
      shellUx: shell?.getAttribute("data-shell-ux") || null,
      mode: shell?.getAttribute("data-mode") || null,
      visibleModePillCount: visibleModePills.length,
      modeLabels,
      hasReviewChrome: !!reviewChrome,
      reviewOpen: !!review,
      reviewHostsAttr: review?.getAttribute("data-hosts-computer") || null,
      hasReviewComputer: !!reviewComputer || !!computerInReview,
      computerTitle,
      streamPrimary: stream?.getAttribute("data-conversation-primary") === "true" || !!stream,
      ownConversation: stream?.getAttribute("data-an-own-conversation") === "true",
      hasTakeoverDock: !!takeoverDock,
      hasHandBack: !!handBack,
      brand: document.querySelector(".an-roster-header strong, .an-nav-brand")?.textContent?.trim() || null,
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

  // Collapse Review if open → idle Conversation
  await evaluate(`(() => {
    const btn = document.querySelector('[data-action="review-toggle"]')
    if (btn && btn.getAttribute("data-active") === "true") btn.click()
    const close = document.querySelector('[data-action="review-collapse"]')
    if (close) close.click()
    return true
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
  await sleep(500)

  const idleProbe = await evaluate(probeExpr)
  console.log("idleProbe", JSON.stringify(idleProbe))
  await shot("145-stage5-08-conversation-primary-no-pills.png")

  // Open Review via chrome toggle
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
  await shot("146-stage5-08-review-computer-sidebar.png")

  // Connect + confirm attach so Computer View is Live inside Review
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

  const liveReviewProbe = await evaluate(probeExpr)
  console.log("liveReviewProbe", JSON.stringify(liveReviewProbe))
  await shot("147-stage5-08-review-computer-live.png")

  // Takeover from Computer View (in Review) — not a peer mode pill
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
  await shot("148-stage5-08-takeover-in-review-dock.png")

  // Hand back — stays watch-only in Review; Conversation still primary
  await evaluate(`(() => {
    const btn = [...document.querySelectorAll("button")].find((b) => /hand\\s*back/i.test(b.textContent || ""))
    btn?.click()
    return !!btn
  })()`)
  await sleep(800)

  const handbackProbe = await evaluate(probeExpr)
  console.log("handbackProbe", JSON.stringify(handbackProbe))
  await shot("149-stage5-08-handback-review-preserved.png")

  const checks = {
    conversationPrimary: idleProbe?.conversationPrimary === true && liveReviewProbe?.conversationPrimary === true,
    noPeerModePills:
      (idleProbe?.visibleModePillCount ?? 99) === 0 &&
      idleProbe?.peerModePills === true &&
      !(idleProbe?.modeLabels || []).some((l) => /computer\s*view|takeover/i.test(l)),
    hasReviewChrome: idleProbe?.hasReviewChrome === true,
    reviewHostsComputer:
      reviewProbe?.reviewOpen === true &&
      (reviewProbe?.hasReviewComputer === true || liveReviewProbe?.hasReviewComputer === true),
    computerTitleOk:
      !liveReviewProbe?.computerTitle || liveReviewProbe.computerTitle === "Computer View",
    streamStaysPrimary: liveReviewProbe?.streamPrimary === true && takeoverProbe?.streamPrimary === true,
    takeoverDockInReview: takeoverProbe?.hasTakeoverDock === true || takeoverProbe?.hasHandBack === true,
    handbackKeepsReview: handbackProbe?.reviewOpen === true && handbackProbe?.conversationPrimary === true,
  }

  const ok = Object.values(checks).every(Boolean)
  console.log(
    JSON.stringify(
      {
        ok,
        marker: MARKER,
        checks,
        idleProbe,
        reviewProbe,
        liveReviewProbe,
        takeoverProbe,
        handbackProbe,
      },
      null,
      2,
    ),
  )

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
