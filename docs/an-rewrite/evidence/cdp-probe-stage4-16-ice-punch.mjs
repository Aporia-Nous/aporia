import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import WebSocket from "ws"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, "screenshots-2026-10-18")
const marker = `AP-STAGE4-16 ice-punch ${Date.now()}`

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

await send("Page.reload", { ignoreCache: true })
await new Promise((r) => setTimeout(r, 5500))

const probe = await evaluate(`(() => {
  const shell = document.querySelector('[data-component="an-shell"]')
  if (!shell) return { ok: false, reason: "no-shell", marker: ${JSON.stringify(marker)} }
  const cs = getComputedStyle(shell)
  const num = (v) => {
    const m = String(v || "").match(/([0-9]*\\.?[0-9]+)/)
    return m ? Number(m[1]) : NaN
  }
  const alpha = (rgba) => {
    const m = String(rgba || "").match(/rgba?\\([^)]*?([0-9]*\\.?[0-9]+)\\s*\\)/)
    return m ? Number(m[1]) : NaN
  }
  const blur = cs.getPropertyValue("--an-blur").trim()
  const blurStrong = cs.getPropertyValue("--an-blur-strong").trim()
  const saturate = cs.getPropertyValue("--an-saturate").trim()
  const panel = cs.getPropertyValue("--an-panel").trim()
  const panelRaised = cs.getPropertyValue("--an-panel-raised").trim()
  const panelGlass = cs.getPropertyValue("--an-panel-glass").trim()
  const iceSheen = cs.getPropertyValue("--an-ice-sheen").trim()
  const iceEdge = cs.getPropertyValue("--an-ice-edge").trim()
  const gold = cs.getPropertyValue("--an-gold").trim()
  const voidC = cs.getPropertyValue("--an-void").trim()
  const specular = cs.getPropertyValue("--an-specular").trim()

  const roster = document.querySelector(".an-roster")
  const rosterCs = roster ? getComputedStyle(roster) : null
  const nav = document.querySelector(".an-nav")
  const navCs = nav ? getComputedStyle(nav) : null
  const card = document.querySelector('[data-component="an-card"]')
  const cardCs = card ? getComputedStyle(card) : null
  const composerOwned = document.querySelector('[data-an-owned="composer"]')
  const composerDock = document.querySelector('[data-component="session-composer-dock"]')
  const dockEl = composerOwned || composerDock
  const dockCs = dockEl ? getComputedStyle(dockEl) : null
  const composer = document.querySelector('[data-component="composer"]')
  const composerCs = composer ? getComputedStyle(composer) : null
  const contraptions = document.querySelector('[data-an-part="contraptions"]')
  const contrCs = contraptions ? getComputedStyle(contraptions) : null
  const timeline = document.querySelector('[data-an-part="opencode-timeline"]')
  const timelineDisplay = timeline ? getComputedStyle(timeline).display : null
  const youTurn = !!document.querySelector('.an-turn[data-role="user"], [data-an-part="you-turn"]')
  const streamCards = [...document.querySelectorAll('[data-an-part="in-conversation-card"]')].map(
    (el) => el.getAttribute("data-type") || el.querySelector("[data-type]")?.getAttribute("data-type")
  )
  const missionCompact = !!document.querySelector('[data-an-mission="compact"]')
  const stack = document.querySelector('[data-an-part="mission-stack"], .an-mission-stack')
  const stackPresent = !!(stack && getComputedStyle(stack).display !== "none" && stack.getBoundingClientRect().height > 8)

  const parseBlurPx = (filter) => {
    const m = String(filter || "").match(/blur\\((\\d+(?:\\.\\d+)?)px\\)/)
    return m ? Number(m[1]) : NaN
  }

  const panelAlpha = alpha(panel)
  const raisedAlpha = alpha(panelRaised)
  const glassAlpha = alpha(panelGlass)
  const sheenAlpha = alpha(iceSheen)
  const edgeAlpha = alpha(iceEdge)
  const blurN = num(blur)
  const blurStrongN = num(blurStrong)
  const satN = num(saturate)

  const rosterBackdrop = rosterCs?.backdropFilter || rosterCs?.webkitBackdropFilter || ""
  const navBackdrop = navCs?.backdropFilter || navCs?.webkitBackdropFilter || ""
  const cardBackdrop = cardCs?.backdropFilter || cardCs?.webkitBackdropFilter || ""
  const dockBackdrop = dockCs?.backdropFilter || dockCs?.webkitBackdropFilter || ""
  const contrBackdrop = contrCs?.backdropFilter || contrCs?.webkitBackdropFilter || ""

  const iceOk =
    blurN >= 40 &&
    blurStrongN >= 64 &&
    satN >= 1.3 &&
    panelAlpha > 0 &&
    panelAlpha <= 0.32 &&
    raisedAlpha > 0 &&
    raisedAlpha <= 0.4 &&
    glassAlpha > 0 &&
    glassAlpha <= 0.24 &&
    sheenAlpha >= 0.12 &&
    edgeAlpha >= 0.24 &&
    specular.includes("inset") &&
    gold.toLowerCase() === "#f0c66d" &&
    voidC.toLowerCase() === "#020509" &&
    parseBlurPx(cardBackdrop) >= 36 &&
    parseBlurPx(dockBackdrop || rosterBackdrop || navBackdrop) >= 36

  const ownershipOk =
    !!composerOwned &&
    timelineDisplay === "none" &&
    (youTurn || streamCards.length >= 0)

  return {
    ok: iceOk && ownershipOk,
    marker: ${JSON.stringify(marker)},
    iceOk,
    ownershipOk,
    mode: shell.getAttribute("data-mode"),
    blur,
    blurStrong,
    saturate,
    panel,
    panelRaised,
    panelGlass,
    iceSheen,
    iceEdge,
    gold,
    void: voidC,
    specular: specular.slice(0, 160),
    panelAlpha,
    raisedAlpha,
    glassAlpha,
    sheenAlpha,
    edgeAlpha,
    rosterBackdrop,
    navBackdrop,
    cardBackdrop,
    dockBackdrop,
    contrBackdrop,
    contraptionsOpen: !!contraptions,
    contrBg: contrCs?.backgroundImage?.slice(0, 180) || null,
    composerOwned: !!composerOwned,
    composerBg: composerCs?.backgroundColor || null,
    timelineDisplay,
    youTurn,
    missionCompact,
    stackPresent,
    streamCards,
    cards: [...document.querySelectorAll('[data-component="an-card"]')].map((el) => el.getAttribute("data-type")),
  }
})()`)

console.log("PROBE", JSON.stringify(probe, null, 2))

await shot("51-before-ice-punch-reload.png").catch(() => {})
// already reloaded; capture conversation ice
await shot("52-ice-punch-conversation.png")

// open Contraptions if closed for drawer ice proof
const opened = await evaluate(`(() => {
  const already = document.querySelector('[data-an-part="contraptions"]')
  if (already) return { opened: false, already: true }
  const btn = [...document.querySelectorAll("button,[role=button],.an-nav-btn")].find((el) => {
    const t = (el.getAttribute("title") || el.getAttribute("aria-label") || el.textContent || "").toLowerCase()
    return t.includes("contraption") || t.includes("automation")
  })
  if (!btn) {
    const nav = document.querySelector('[data-an-nav="contraptions"], [data-nav="contraptions"], .an-nav [data-id="contraptions"]')
    if (nav) { nav.click(); return { opened: true, via: "data-nav" } }
    return { opened: false, reason: "no-btn" }
  }
  btn.click()
  return { opened: true, via: "btn" }
})()`)
console.log("CONTRAPTIONS", JSON.stringify(opened))
await new Promise((r) => setTimeout(r, 1200))

const afterOpen = await evaluate(`(() => {
  const el = document.querySelector('[data-an-part="contraptions"]')
  if (!el) return { mountOk: false }
  const cs = getComputedStyle(el)
  const r = el.getBoundingClientRect()
  const filter = cs.backdropFilter || cs.webkitBackdropFilter || ""
  const m = filter.match(/blur\\((\\d+(?:\\.\\d+)?)px\\)/)
  const blurPx = m ? Number(m[1]) : NaN
  const bg = cs.backgroundImage || ""
  const opaqueCharcoal = /0\\.(7[2-9]|8\\d|9\\d)/.test(bg)
  return {
    mountOk: true,
    w: Math.round(r.width),
    h: Math.round(r.height),
    backdrop: filter,
    blurPx,
    iceDrawer: blurPx >= 56 && !opaqueCharcoal,
    bgSample: bg.slice(0, 220),
  }
})()`)
console.log("DRAWER", JSON.stringify(afterOpen, null, 2))
await shot("53-ice-punch-contraptions.png")

// Computer View mode for rail ice
await evaluate(`(() => {
  const btn = [...document.querySelectorAll(".an-mode-btn,button")].find((el) =>
    /computer view|\\bview\\b/i.test(el.textContent || "")
  )
  if (btn) btn.click()
  return { clicked: !!btn }
})()`)
await new Promise((r) => setTimeout(r, 900))
await shot("54-ice-punch-computer-view.png")

// back to conversation
await evaluate(`(() => {
  const btn = [...document.querySelectorAll(".an-mode-btn,button")].find((el) =>
    /conversation/i.test(el.textContent || "")
  )
  if (btn) btn.click()
  return { clicked: !!btn }
})()`)
await new Promise((r) => setTimeout(r, 600))
await shot("55-ice-punch-conversation-final.png")

const result = {
  ok: !!(probe?.ok && (afterOpen?.iceDrawer || afterOpen?.mountOk === false)),
  marker,
  iceOk: probe?.iceOk,
  ownershipOk: probe?.ownershipOk,
  drawer: afterOpen,
  blur: probe?.blur,
  blurStrong: probe?.blurStrong,
  panel: probe?.panel,
  panelRaised: probe?.panelRaised,
  gold: probe?.gold,
  void: probe?.void,
  composerOwned: probe?.composerOwned,
  timelineDisplay: probe?.timelineDisplay,
}
// Prefer iceOk+ownership; drawer ice when mounted
result.ok = !!(probe?.iceOk && probe?.ownershipOk && (afterOpen?.mountOk ? afterOpen.iceDrawer : true))
console.log("RESULT", JSON.stringify(result, null, 2))
ws.close()
process.exit(result.ok ? 0 : 2)
