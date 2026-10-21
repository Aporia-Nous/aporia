import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import WebSocket from "ws"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, "screenshots-2026-10-18")

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
      border: cs.borderTopColor + " / " + cs.borderTopWidth,
      radius: cs.borderRadius,
      shadow: (cs.boxShadow || "").slice(0, 120),
      backdrop: cs.backdropFilter || cs.webkitBackdropFilter || "",
      cls: (el.className || "").toString().slice(0, 160),
    }
  }
  const shell = document.querySelector('[data-component="an-shell"]')
  const dock = document.querySelector('[data-component="session-composer-dock"]')
  const composer = document.querySelector('[data-component="composer"]')
  const panel = document.querySelector('[data-an-part="session-panel-frame"]') ||
    document.querySelector('[data-slot="session-chat-panel"]')
  const dockPrompt = document.querySelector('[data-component="dock-prompt"]')
  const controls = document.querySelector('[data-slot="composer-controls"]')
  const actions = document.querySelector('[data-slot="composer-actions"]')
  const submit = document.querySelector('[data-action="composer-submit"]')
  const titleBar = document.querySelector('[data-slot="session-chat-panel"] .flex.h-12')
  const chips = [...document.querySelectorAll('[data-component="composer"] button, [data-component="composer"] [data-component="icon-button"]')]
    .slice(0, 12)
    .map((b) => ({
      label: (b.getAttribute("aria-label") || b.getAttribute("title") || b.textContent || "").trim().slice(0, 40),
      bg: getComputedStyle(b).backgroundColor,
      cls: (b.className || "").toString().slice(0, 80),
    }))
  const raised = !!composer && (composer.className || "").includes("shadow")
  const v2Base = !!dock && (dock.className || "").includes("bg-v2-background")
  return {
    hasShell: !!shell,
    mode: shell?.getAttribute("data-mode"),
    ownConv: document.querySelector(".an-stream")?.getAttribute("data-an-own-conversation"),
    href: location.href,
    dock: rect(dock),
    composer: rect(composer),
    panel: rect(panel),
    dockPrompt: rect(dockPrompt),
    controls: rect(controls),
    actions: rect(actions),
    submit: rect(submit),
    titleBar: rect(titleBar),
    chips,
    flags: { raisedClass: raised, dockV2BaseClass: v2Base, anPartDock: dock?.getAttribute("data-an-part") },
  }
})()`

let probe = null
for (let i = 0; i < 20; i++) {
  probe = await evaluate(probeExpr)
  console.log("probe", i, JSON.stringify(probe))
  if (probe?.hasShell) break
  await new Promise((r) => setTimeout(r, 400))
}

if (!probe?.composer) {
  const openMember = await evaluate(`(() => {
    const btn = document.querySelector(".an-roster-member")
    if (!btn) return { ok: false }
    btn.click()
    return { ok: true, label: (btn.getAttribute("aria-label") || "").slice(0, 80) }
  })()`)
  console.log("openMember", JSON.stringify(openMember))
  await new Promise((r) => setTimeout(r, 1500))
  probe = await evaluate(probeExpr)
  console.log("afterOpen", JSON.stringify(probe))
}

await shot("21-before-composer-own.png")
console.log("BEFORE", JSON.stringify(probe, null, 2))
ws.close()
