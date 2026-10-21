import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import WebSocket from "ws"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, "screenshots-2026-10-18")
const marker = `AP-STAGE4-12 composer ${Date.now()}`

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
      bg: cs.backgroundColor,
      bgImage: (cs.backgroundImage || "").slice(0, 80),
      border: cs.borderTopColor + " / " + cs.borderTopWidth,
      radius: cs.borderRadius,
      shadow: (cs.boxShadow || "").slice(0, 100),
      backdrop: cs.backdropFilter || "",
      anim: cs.animationName,
    }
  }
  const shell = document.querySelector('[data-component="an-shell"]')
  const dock = document.querySelector('[data-component="session-composer-dock"]')
  const composer = document.querySelector('[data-component="composer"]')
  const panel = document.querySelector('[data-an-part="session-panel-frame"]')
  const conv = document.querySelector('[data-component="an-conversation"]')
  const timeline = document.querySelector('[data-an-part="opencode-timeline"]')
  const userTurns = [...document.querySelectorAll('.an-turn[data-role="user"]')]
  const submit = document.querySelector('[data-action="composer-submit"]')
  const panelShadow = panel ? getComputedStyle(panel).boxShadow : null
  const panelBg = panel ? getComputedStyle(panel).backgroundImage + getComputedStyle(panel).backgroundColor : null
  return {
    hasShell: !!shell,
    mode: shell?.getAttribute("data-mode"),
    ownConv: document.querySelector(".an-stream")?.getAttribute("data-an-own-conversation"),
    composerOnly: !!document.querySelector(".an-stream-legacy--composer-only"),
    owned: dock?.getAttribute("data-an-owned"),
    dock: rect(dock),
    composer: rect(composer),
    panel: rect(panel),
    panelPassthrough: panel
      ? {
          shadowNone: !panelShadow || panelShadow === "none",
          bgTransparent:
            (getComputedStyle(panel).backgroundColor === "rgba(0, 0, 0, 0)" ||
              getComputedStyle(panel).backgroundColor === "transparent") &&
            (getComputedStyle(panel).backgroundImage === "none" || !getComputedStyle(panel).backgroundImage),
          backdropNone: !getComputedStyle(panel).backdropFilter || getComputedStyle(panel).backdropFilter === "none",
          animNone: getComputedStyle(panel).animationName === "none",
        }
      : null,
    dockOwnedIce: dock
      ? {
          hasRadius: parseFloat(getComputedStyle(dock).borderRadius) >= 14,
          hasBackdrop: (getComputedStyle(dock).backdropFilter || "").includes("blur"),
          notV2Slab: getComputedStyle(dock).backgroundColor !== "rgb(18, 27, 55)",
        }
      : null,
    conv: rect(conv),
    timelineDisplay: timeline ? getComputedStyle(timeline).display : null,
    userTurnCount: userTurns.length,
    userTexts: userTurns.slice(-3).map((el) => (el.querySelector("[data-slot='an-turn-text']")?.textContent || "").trim().slice(0, 160)),
    submit: rect(submit),
    href: location.href,
    panelBgSample: panelBg?.slice?.(0, 120) ?? panelBg,
  }
})()`

let probe = null
for (let i = 0; i < 25; i++) {
  probe = await evaluate(probeExpr)
  console.log("probe", i, JSON.stringify({
    hasShell: probe?.hasShell,
    ownConv: probe?.ownConv,
    owned: probe?.owned,
    composerOnly: probe?.composerOnly,
    panelPassthrough: probe?.panelPassthrough,
    dockOwnedIce: probe?.dockOwnedIce,
  }))
  if (probe?.hasShell && probe?.owned === "composer") break
  await new Promise((r) => setTimeout(r, 400))
}

if (!probe?.hasShell) {
  console.error("AnShell not ready")
  process.exit(2)
}

if (probe?.ownConv !== "true") {
  const openMember = await evaluate(`(() => {
    const btn = document.querySelector(".an-roster-member")
    if (!btn) return { ok: false }
    btn.click()
    return { ok: true }
  })()`)
  console.log("openMember", JSON.stringify(openMember))
  await new Promise((r) => setTimeout(r, 1500))
  probe = await evaluate(probeExpr)
}

await shot("22-after-composer-own.png")
console.log("afterVisual", JSON.stringify({
  owned: probe?.owned,
  composerOnly: probe?.composerOnly,
  panelPassthrough: probe?.panelPassthrough,
  dockOwnedIce: probe?.dockOwnedIce,
  dock: probe?.dock,
  panel: probe?.panel,
}, null, 2))

const focus = await evaluate(`(() => {
  const el =
    document.querySelector('.tiptap.ProseMirror') ||
    document.querySelector('[data-component="composer-editor"]') ||
    document.querySelector('[contenteditable="true"]') ||
    document.querySelector('textarea')
  if (!el) return { ok: false, reason: "no composer" }
  el.focus()
  el.click()
  return { ok: true, tag: el.tagName, ce: el.getAttribute("contenteditable") }
})()`)
console.log("focus", JSON.stringify(focus))

if (focus?.ok) {
  await send("Input.dispatchKeyEvent", { type: "keyDown", windowsVirtualKeyCode: 65, modifiers: 2 })
  await send("Input.dispatchKeyEvent", { type: "keyUp", windowsVirtualKeyCode: 65, modifiers: 2 })
  await send("Input.insertText", { text: marker })
  await new Promise((r) => setTimeout(r, 250))
  await shot("23-composer-typed.png")

  await send("Input.dispatchKeyEvent", { type: "keyDown", windowsVirtualKeyCode: 13, key: "Enter", code: "Enter", text: "\r" })
  await send("Input.dispatchKeyEvent", { type: "keyUp", windowsVirtualKeyCode: 13, key: "Enter", code: "Enter" })
  await new Promise((r) => setTimeout(r, 350))

  const clickedSend = await evaluate(`(() => {
    const sendBtn =
      document.querySelector('[data-action="composer-submit"]') ||
      document.querySelector('[data-component="prompt-submit"]') ||
      [...document.querySelectorAll("button")].find((b) => /send/i.test(b.getAttribute("aria-label") || b.title || ""))
    if (!sendBtn || sendBtn.disabled) return { ok: false, disabled: !!sendBtn?.disabled }
    sendBtn.click()
    return { ok: true, label: sendBtn.getAttribute("aria-label") || "send" }
  })()`)
  console.log("sendClick", JSON.stringify(clickedSend))
}

let after = null
for (let i = 0; i < 24; i++) {
  after = await evaluate(probeExpr)
  const hit = after?.userTexts?.some((t) => String(t).includes("AP-STAGE4-12"))
  console.log("afterSend", i, JSON.stringify({
    userTurnCount: after?.userTurnCount,
    userTexts: after?.userTexts,
    convH: after?.conv?.h,
    timelineDisplay: after?.timelineDisplay,
    hit,
  }))
  if (hit) break
  await new Promise((r) => setTimeout(r, 450))
}

await shot("24-after-send-visible.png")

const ok =
  after?.ownConv === "true" &&
  after?.owned === "composer" &&
  after?.composerOnly === true &&
  after?.panelPassthrough?.shadowNone === true &&
  after?.panelPassthrough?.backdropNone === true &&
  after?.dockOwnedIce?.hasRadius === true &&
  after?.dockOwnedIce?.hasBackdrop === true &&
  (after?.userTurnCount ?? 0) > 0 &&
  after?.userTexts?.some((t) => String(t).includes("AP-STAGE4-12")) &&
  (after?.conv?.h ?? 0) > 40 &&
  after?.timelineDisplay === "none"

console.log("RESULT", JSON.stringify({ ok, marker, after: {
  owned: after?.owned,
  composerOnly: after?.composerOnly,
  panelPassthrough: after?.panelPassthrough,
  dockOwnedIce: after?.dockOwnedIce,
  userTexts: after?.userTexts,
  convH: after?.conv?.h,
  timelineDisplay: after?.timelineDisplay,
} }, null, 2))

ws.close()
process.exit(ok ? 0 : 4)
