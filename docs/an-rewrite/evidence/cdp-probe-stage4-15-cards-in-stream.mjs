import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import WebSocket from "ws"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, "screenshots-2026-10-18")
const marker = `AP-STAGE4-15 cards-in-stream ${Date.now()}`

const list = await fetch("http://127.0.0.1:9222/json/list").then((r) => r.json())
const page =
  list.find((p) => p.type === "page" && (p.url || "").includes("5173")) ??
  list.find((p) => p.type === "page") ??
  list[0]
if (!page?.webSocketDebuggerUrl) {
  console.error("No CDP page")
  process.exit(1)
}
console.log("page", page.title, page.url)

const ws = new WebSocket(page.webSocketDebuggerUrl)
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
await new Promise((resolve, reject) => {
  ws.on("open", resolve)
  ws.on("error", reject)
})
await send("Page.enable")
await send("Runtime.enable")

async function evaluate(expression) {
  const res = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })
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

const rect = (el) => {
  if (!el) return null
  const r = el.getBoundingClientRect()
  const cs = getComputedStyle(el)
  return {
    w: Math.round(r.width),
    h: Math.round(r.height),
    top: Math.round(r.top),
    display: cs.display,
    maxHeight: cs.maxHeight,
  }
}

const probeExpr = `(() => {
  const rect = (el) => {
    if (!el) return null
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    return {
      w: Math.round(r.width),
      h: Math.round(r.height),
      top: Math.round(r.top),
      display: cs.display,
      maxHeight: cs.maxHeight,
    }
  }
  const shell = document.querySelector('[data-component="an-shell"]')
  const mission = document.querySelector(".an-mission")
  const stream = document.querySelector(".an-stream")
  const stack = document.querySelector('[data-component="an-stream-cards"]')
  const conv = document.querySelector('[data-component="an-conversation"]')
  const inCards = [...document.querySelectorAll('[data-an-part="in-conversation-card"]')]
  const turns = [...document.querySelectorAll(".an-turn")]
  const userTurns = [...document.querySelectorAll('.an-turn[data-role="user"]')]
  const composer = document.querySelector('[data-an-owned="composer"]')
  const timeline = document.querySelector('[data-an-part="opencode-timeline"]')
  const cardTypes = inCards.map((el) => el.getAttribute("data-card-type"))
  const presenceLabels = [...document.querySelectorAll(".an-roster-presence")].map((el) => ({
    text: (el.textContent || "").trim(),
    presence: el.getAttribute("data-presence"),
  }))
  const unknownCount = presenceLabels.filter((r) => r.presence === "unknown" || r.text === "Unknown").length
  return {
    marker: ${JSON.stringify(marker)},
    hasShell: !!shell,
    shellMode: shell?.getAttribute("data-mode") ?? null,
    missionCompact: mission?.getAttribute("data-an-mission") === "compact",
    missionCollapsed: mission?.getAttribute("data-collapsed") === "true",
    mission: rect(mission),
    streamCardsInStream: stream?.getAttribute("data-an-cards-in-stream") === "true",
    ownConversation: stream?.getAttribute("data-an-own-conversation") === "true",
    stackPresent: !!stack,
    stackCollapsed: stack?.getAttribute("data-collapsed") === "true",
    stack: rect(stack),
    conv: rect(conv),
    convCardsInStream: conv?.getAttribute("data-an-cards-in-stream") === "true",
    inConversationCardCount: inCards.length,
    cardTypes,
    turnCount: turns.length,
    userTurnCount: userTurns.length,
    userTexts: userTurns.slice(-3).map((el) => (el.querySelector("[data-slot='an-turn-text']")?.textContent || "").trim().slice(0, 120)),
    composerOwned: !!composer,
    timelineDisplay: timeline ? getComputedStyle(timeline).display : "missing",
    unknownCount,
    presenceSample: presenceLabels.slice(0, 5),
  }
})()`

let value = null
for (let i = 0; i < 40; i++) {
  value = await evaluate(probeExpr)
  console.log("probe", i, JSON.stringify(value))
  if (value?.hasShell && value?.ownConversation) break
  await new Promise((r) => setTimeout(r, 1000))
}

if (!value?.hasShell) {
  console.error("AnShell not ready")
  process.exit(2)
}

await shot("47-before-cards-in-stream.png")

// Open first mission/session if on home without own conversation
if (!value.ownConversation) {
  const opened = await evaluate(`(() => {
    const missions = document.querySelector('[data-nav="missions"], button[data-nav-id="missions"], .an-nav button')
    const sessionRow = document.querySelector('[data-component="session-row"], a[href*="session"], .session-list a, [data-testid="session"]')
    const clickable = sessionRow || document.querySelector('.an-roster-member[data-selected="true"], .an-roster-member')
    if (clickable) { clickable.click(); return { clicked: true, tag: clickable.tagName } }
    return { clicked: false }
  })()`)
  console.log("openSession", opened)
  await new Promise((r) => setTimeout(r, 2000))
  value = await evaluate(probeExpr)
  console.log("probeAfterOpen", JSON.stringify(value))
}

await shot("48-cards-in-conversation.png")

// Switch Computer View briefly to prove non-regression of three-state
await evaluate(`(() => {
  const btn = [...document.querySelectorAll(".an-mode-btn")].find((b) => (b.textContent || "").toLowerCase().includes("view") || (b.textContent || "").toLowerCase().includes("computer"))
  btn?.click()
  return !!btn
})()`)
await new Promise((r) => setTimeout(r, 800))
const viewProbe = await evaluate(probeExpr)
console.log("viewProbe", JSON.stringify(viewProbe))
await shot("49-cards-in-stream-computer-view.png")

await evaluate(`(() => {
  const btn = [...document.querySelectorAll(".an-mode-btn")].find((b) => (b.textContent || "").toLowerCase().includes("conversation"))
  btn?.click()
  return !!btn
})()`)
await new Promise((r) => setTimeout(r, 800))
value = await evaluate(probeExpr)
console.log("finalProbe", JSON.stringify(value))
await shot("50-cards-in-stream-conversation.png")

const ok =
  !!value?.hasShell &&
  value?.missionCompact === true &&
  value?.streamCardsInStream === true &&
  value?.convCardsInStream === true &&
  value?.ownConversation === true &&
  (!value?.stackPresent || value?.stackCollapsed === true) &&
  value?.composerOwned === true &&
  value?.timelineDisplay === "none" &&
  value?.inConversationCardCount >= 1 &&
  (value?.cardTypes || []).includes("computer") &&
  value?.unknownCount === 0

const result = {
  ok,
  marker,
  missionCompact: value?.missionCompact,
  streamCardsInStream: value?.streamCardsInStream,
  inConversationCardCount: value?.inConversationCardCount,
  cardTypes: value?.cardTypes,
  stackPresent: value?.stackPresent,
  stackCollapsed: value?.stackCollapsed,
  stackH: value?.stack?.h ?? 0,
  convH: value?.conv?.h ?? 0,
  turnCount: value?.turnCount,
  composerOwned: value?.composerOwned,
  timelineDisplay: value?.timelineDisplay,
  unknownCount: value?.unknownCount,
  shellMode: value?.shellMode,
}
console.log("RESULT", JSON.stringify(result))
ws.close()
process.exit(ok ? 0 : 3)
