import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import WebSocket from "ws"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, "screenshots-2026-10-18")
const marker = `AP-STAGE4-13 chrome ${Date.now()}`

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
      visible: cs.display !== "none" && cs.visibility !== "hidden" && r.width > 0 && r.height > 0,
    }
  }
  const shell = document.querySelector('[data-component="an-shell"]')
  const dock = document.querySelector('[data-component="session-composer-dock"]')
  const composer = document.querySelector('[data-component="composer"]')
  const controls = document.querySelector('[data-slot="composer-controls"]')
  const modelBtn = document.querySelector('[data-action="composer-model"]')
  const mic = document.querySelector("[data-aporia-mic]")
  const callBtn = document.querySelector("[data-aporia-call-inline]")
  const placeholder = document.querySelector('[data-slot="composer-placeholder"]')
  const submit = document.querySelector('[data-action="composer-submit"]')
  const conv = document.querySelector('[data-component="an-conversation"]')
  const timeline = document.querySelector('[data-an-part="opencode-timeline"]')
  const userTurns = [...document.querySelectorAll('.an-turn[data-role="user"]')]
  const contraptions = document.querySelector('[data-an-part="contraptions"]')
  const placeText = (placeholder?.textContent || "").trim()
  const csSubmit = submit ? getComputedStyle(submit) : null
  return {
    hasShell: !!shell,
    mode: shell?.getAttribute("data-mode"),
    ownConv: document.querySelector(".an-stream")?.getAttribute("data-an-own-conversation"),
    composerOnly: !!document.querySelector(".an-stream-legacy--composer-only"),
    owned: dock?.getAttribute("data-an-owned"),
    controlsHidden: controls ? getComputedStyle(controls).display === "none" : true,
    modelHidden: modelBtn ? getComputedStyle(modelBtn).display === "none" : true,
    micAbsentOrHidden: !mic || getComputedStyle(mic).display === "none",
    callAbsentOrHidden: !callBtn || getComputedStyle(callBtn).display === "none",
    placeholderText: placeText.slice(0, 80),
    placeholderIsAn: /^Message .+…$/.test(placeText) || /^Message .+\\.\\.\\.$/.test(placeText),
    placeholderNotOc: !/Ask anything/i.test(placeText) && !/for commands/i.test(placeText),
    submitVisible: !!submit && rect(submit)?.visible,
    submitGoldish: csSubmit
      ? /240|198|109|215|154|46|d79a2e|f0c66d/i.test(
          (csSubmit.backgroundImage || "") + (csSubmit.backgroundColor || "") + (csSubmit.boxShadow || ""),
        ) || (csSubmit.backgroundImage || "").includes("linear-gradient")
      : false,
    dockOwned: dock?.getAttribute("data-an-owned") === "composer",
    timelineDisplay: timeline ? getComputedStyle(timeline).display : null,
    userTurnCount: userTurns.length,
    userTexts: userTurns.slice(-3).map((el) => (el.querySelector("[data-slot='an-turn-text']")?.textContent || "").trim().slice(0, 160)),
    convH: conv ? Math.round(conv.getBoundingClientRect().height) : 0,
    contraptionsPart: !!contraptions || !!document.querySelector('[data-an-nav="contraptions"]') || !!document.querySelector('[data-nav-id="contraptions"]'),
    href: location.href,
  }
})()`

let probe = null
for (let i = 0; i < 25; i++) {
  probe = await evaluate(probeExpr)
  console.log(
    "probe",
    i,
    JSON.stringify({
      hasShell: probe?.hasShell,
      owned: probe?.owned,
      composerOnly: probe?.composerOnly,
      controlsHidden: probe?.controlsHidden,
      placeholderText: probe?.placeholderText,
    }),
  )
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

await shot("39-before-composer-chrome.png")

// Ensure empty composer so placeholder is visible
await evaluate(`(() => {
  const el =
    document.querySelector('[data-component="composer-editor"]') ||
    document.querySelector('[contenteditable="true"]')
  if (!el) return { ok: false }
  el.focus()
  // clear via select-all + delete if needed — leave empty for placeholder shot
  return { ok: true }
})()`)
await new Promise((r) => setTimeout(r, 300))
probe = await evaluate(probeExpr)
await shot("40-composer-chrome-an.png")
console.log("chromeVisual", JSON.stringify({
  controlsHidden: probe?.controlsHidden,
  modelHidden: probe?.modelHidden,
  micAbsentOrHidden: probe?.micAbsentOrHidden,
  callAbsentOrHidden: probe?.callAbsentOrHidden,
  placeholderText: probe?.placeholderText,
  placeholderIsAn: probe?.placeholderIsAn,
  placeholderNotOc: probe?.placeholderNotOc,
  submitVisible: probe?.submitVisible,
  submitGoldish: probe?.submitGoldish,
  owned: probe?.owned,
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
  await shot("41-composer-chrome-typed.png")

  await send("Input.dispatchKeyEvent", { type: "keyDown", windowsVirtualKeyCode: 13, key: "Enter", code: "Enter", text: "\r" })
  await send("Input.dispatchKeyEvent", { type: "keyUp", windowsVirtualKeyCode: 13, key: "Enter", code: "Enter" })
  await new Promise((r) => setTimeout(r, 350))

  const clickedSend = await evaluate(`(() => {
    const sendBtn =
      document.querySelector('[data-action="composer-submit"]') ||
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
  const hit = after?.userTexts?.some((t) => String(t).includes("AP-STAGE4-13"))
  console.log("afterSend", i, JSON.stringify({
    userTurnCount: after?.userTurnCount,
    userTexts: after?.userTexts,
    convH: after?.convH,
    timelineDisplay: after?.timelineDisplay,
    hit,
  }))
  if (hit) break
  await new Promise((r) => setTimeout(r, 450))
}

await shot("42-after-send-composer-chrome.png")

const chromeOk =
  after?.owned === "composer" &&
  after?.composerOnly === true &&
  after?.controlsHidden === true &&
  after?.modelHidden === true &&
  after?.micAbsentOrHidden === true &&
  after?.callAbsentOrHidden === true &&
  after?.placeholderNotOc === true &&
  (probe?.placeholderIsAn === true || after?.placeholderNotOc === true) &&
  after?.submitVisible === true &&
  after?.ownConv === "true" &&
  after?.timelineDisplay === "none" &&
  (after?.userTurnCount ?? 0) > 0 &&
  after?.userTexts?.some((t) => String(t).includes("AP-STAGE4-13")) &&
  (after?.convH ?? 0) > 40

console.log(
  "RESULT",
  JSON.stringify(
    {
      ok: chromeOk,
      marker,
      chrome: {
        controlsHidden: after?.controlsHidden,
        modelHidden: after?.modelHidden,
        micAbsentOrHidden: after?.micAbsentOrHidden,
        callAbsentOrHidden: after?.callAbsentOrHidden,
        placeholderText: probe?.placeholderText,
        placeholderIsAn: probe?.placeholderIsAn,
        submitVisible: after?.submitVisible,
        submitGoldish: after?.submitGoldish ?? probe?.submitGoldish,
        owned: after?.owned,
        timelineDisplay: after?.timelineDisplay,
        userTexts: after?.userTexts,
        convH: after?.convH,
      },
    },
    null,
    2,
  ),
)

ws.close()
process.exit(chromeOk ? 0 : 4)
