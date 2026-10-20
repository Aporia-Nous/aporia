/**
 * AP-STAGE4-NEW-TEAMMATE — create/cancel/import-detect/edit/archive live-DEV CDP.
 * Port :9223. Always closes WebSocket. Does NOT self-PASS Stage 4 complete.
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import WebSocket from "ws"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, "screenshots-2026-10-18")
const boardEvidence =
  "C:\\Users\\Dilla\\OneDrive\\Documents\\ChatGPT\\Aporia Nous\\business-control\\evidence"
const MARKER = `AP-STAGE4-NEW-TEAMMATE ${Date.now()}`
const CDP_PORT = process.env.APORETIC_CDP_PORT || "9223"
const PROBE_NAME = `CDP Lifecycle ${Date.now().toString(36)}`
const PROBE_SLUG = PROBE_NAME.toLowerCase()
  .replace(/&/g, "and")
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "")
  .slice(0, 48)

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
const result = {
  marker: MARKER,
  tipHint: "fill after commit",
  cancelNoHalf: false,
  createRoster: false,
  editPreserved: false,
  importDuplicateDetected: false,
  archiveGone: false,
  sheetOpen: false,
  probeSlug: PROBE_SLUG,
  residuals: [],
}

try {
  const list = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`).then((r) => r.json())
  const page =
    list.find((p) => p.type === "page" && (p.url || "").includes("5173")) ??
    list.find((p) => p.type === "page" && (p.title || "").includes("Aporetic"))
  if (!page?.webSocketDebuggerUrl) {
    console.error("No Aporetic CDP page on", CDP_PORT)
    process.exit(1)
  }
  console.log("aporetic", page.title, page.url)

  const conn = await connect(page.webSocketDebuggerUrl)
  ws = conn.ws
  const send = conn.send
  await send("Page.enable")
  await send("Runtime.enable")
  await send("Page.navigate", { url: "http://localhost:5173/" })
  await sleep(3500)

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

  /** Solid controlled inputs ignore plain .value= — use native setters. */
  const setFieldFn = `function setField(sel, text) {
    const el = document.querySelector(sel)
    if (!el) return false
    const proto = el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
    const desc = Object.getOwnPropertyDescriptor(proto, "value")
    desc?.set?.call(el, text)
    el.dispatchEvent(new Event("input", { bubbles: true }))
    el.dispatchEvent(new Event("change", { bubbles: true }))
    return true
  }`

  async function shot(name) {
    const shotRes = await send("Page.captureScreenshot", { format: "png", fromSurface: true })
    const b64 = shotRes.result?.data
    if (!b64) throw new Error("no screenshot for " + name)
    const buf = Buffer.from(b64, "base64")
    fs.mkdirSync(outDir, { recursive: true })
    const out = path.join(outDir, name)
    fs.writeFileSync(out, buf)
    console.log("wrote", out)
    try {
      fs.mkdirSync(boardEvidence, { recursive: true })
      fs.writeFileSync(path.join(boardEvidence, `2026-10-20-${name}`), buf)
    } catch (err) {
      console.warn("board evidence copy failed", err?.message || err)
    }
    return out
  }

  await evaluate(`(async () => {
    const back = [...document.querySelectorAll('a,button')].find((el) =>
      /back to app/i.test(el.textContent || ''),
    )
    if (back) {
      back.click()
      await new Promise((r) => setTimeout(r, 1600))
    }
  })()`)

  for (let i = 0; i < 25; i++) {
    if (await evaluate(`!!document.querySelector('[data-component="an-shell"]')`)) break
    await sleep(400)
  }

  const boot = await evaluate(`({
    shell: !!document.querySelector('[data-component="an-shell"]'),
    newBtn: !!document.querySelector('[data-action="an-new-teammate"]'),
    probe: typeof globalThis.__anTeammate?.openCreate === "function",
    rosterBefore: [...document.querySelectorAll('.an-roster-member')].map((el) => el.getAttribute('data-slug')),
  })`)
  console.log("boot", boot)
  if (!boot?.shell || !boot?.newBtn) {
    result.residuals.push("AnShell or New teammate button missing — HMR/reload may be required")
    throw new Error("shell not ready for teammate lifecycle")
  }

  // --- Cancel leaves no half bot ---
  await evaluate(`(async () => {
    if (globalThis.__anTeammate?.openCreate) globalThis.__anTeammate.openCreate()
    else document.querySelector('[data-action="an-new-teammate"]')?.click()
    await new Promise((r) => setTimeout(r, 500))
  })()`)
  result.sheetOpen = !!(await evaluate(`!!document.querySelector('[data-component="an-teammate-sheet"]')`))
  await evaluate(`(async () => {
    ${setFieldFn}
    setField('[data-action="teammate-name"]', ${JSON.stringify(PROBE_NAME)})
    setField('[data-action="teammate-role"]', "cancel probe")
    await new Promise((r) => setTimeout(r, 200))
    document.querySelector('[data-action="teammate-cancel"]')?.click()
    await new Promise((r) => setTimeout(r, 600))
  })()`)
  const afterCancel = await evaluate(`({
    sheet: !!document.querySelector('[data-component="an-teammate-sheet"]'),
    hasSlug: !!document.querySelector('.an-roster-member[data-slug=${JSON.stringify(PROBE_SLUG)}]'),
  })`)
  result.cancelNoHalf = !afterCancel?.sheet && !afterCancel?.hasSlug
  console.log("cancel", afterCancel, "cancelNoHalf", result.cancelNoHalf)

  // --- Create ---
  await evaluate(`(async () => {
    ${setFieldFn}
    globalThis.__anTeammate?.openCreate?.()
    await new Promise((r) => setTimeout(r, 400))
    setField('[data-action="teammate-name"]', ${JSON.stringify(PROBE_NAME)})
    setField('[data-action="teammate-role"]', "Lifecycle prove role")
    setField('[data-action="teammate-instructions"]', ${JSON.stringify(MARKER)})
    await new Promise((r) => setTimeout(r, 200))
    document.querySelector('[data-action="teammate-save"]')?.click()
    await new Promise((r) => setTimeout(r, 1800))
  })()`)
  const afterCreate = await evaluate(`({
    sheet: !!document.querySelector('[data-component="an-teammate-sheet"]'),
    hasSlug: !!document.querySelector('.an-roster-member[data-slug=${JSON.stringify(PROBE_SLUG)}]'),
    roster: [...document.querySelectorAll('.an-roster-member')].map((el) => el.getAttribute('data-slug')),
  })`)
  result.createRoster = !!afterCreate?.hasSlug
  console.log("create", afterCreate, "createRoster", result.createRoster)
  await shot("115-stage4-new-teammate-created.png")

  // --- Edit preserves ---
  if (result.createRoster) {
    await evaluate(`(async () => {
      ${setFieldFn}
      globalThis.__anTeammate?.openEdit?.(${JSON.stringify(PROBE_SLUG)})
      await new Promise((r) => setTimeout(r, 700))
      setField('[data-action="teammate-role"]', "Lifecycle edited role")
      document.querySelector('[data-action="teammate-save"]')?.click()
      await new Promise((r) => setTimeout(r, 1400))
      globalThis.__anTeammate?.openEdit?.(${JSON.stringify(PROBE_SLUG)})
      await new Promise((r) => setTimeout(r, 700))
    })()`)
    const edited = await evaluate(`({
      sheet: !!document.querySelector('[data-component="an-teammate-sheet"]'),
      role: document.querySelector('[data-action="teammate-role"]')?.value || "",
      name: document.querySelector('[data-action="teammate-name"]')?.value || "",
    })`)
    result.editPreserved =
      !!edited?.sheet &&
      edited.role.includes("edited") &&
      edited.name === PROBE_NAME
    console.log("edit", edited, "editPreserved", result.editPreserved)
    await evaluate(`document.querySelector('[data-action="teammate-cancel"]')?.click()`)
    await sleep(400)
  } else {
    result.residuals.push("create failed — skip edit/archive")
  }

  // --- Import duplicate detect (no durable write required) ---
  const importDup = await evaluate(`(async () => {
    const raw = { format: "aporia-bot", name: "Grok", role: "dup", instructions: "x" }
    globalThis.__anTeammate?.applyImportJson?.(raw)
    await new Promise((r) => setTimeout(r, 700))
    const note = document.querySelector('[data-an-part="import-note"]')?.textContent || ""
    const name = document.querySelector('[data-action="teammate-name"]')?.value || ""
    const sheet = !!document.querySelector('[data-component="an-teammate-sheet"]')
    document.querySelector('[data-action="teammate-cancel"]')?.click()
    await new Promise((r) => setTimeout(r, 400))
    return { sheetWasOpen: sheet, note, name }
  })()`)
  result.importDuplicateDetected =
    /duplicate/i.test(importDup?.note || "") || /Grok 2/i.test(importDup?.name || "")
  console.log("importDup", importDup, "detected", result.importDuplicateDetected)
  if (!result.importDuplicateDetected) {
    result.residuals.push("import duplicate UI note not observed (unit tests still cover parse)")
  }

  // --- Archive ---
  if (result.createRoster) {
    await evaluate(`(async () => {
      globalThis.__anTeammate?.openEdit?.(${JSON.stringify(PROBE_SLUG)})
      await new Promise((r) => setTimeout(r, 600))
      document.querySelector('[data-action="teammate-archive"]')?.click()
      await new Promise((r) => setTimeout(r, 300))
      document.querySelector('[data-action="teammate-archive"]')?.click()
      await new Promise((r) => setTimeout(r, 1400))
    })()`)
    const afterArchive = await evaluate(`({
      sheet: !!document.querySelector('[data-component="an-teammate-sheet"]'),
      hasSlug: !!document.querySelector('.an-roster-member[data-slug=${JSON.stringify(PROBE_SLUG)}]'),
    })`)
    result.archiveGone = !afterArchive?.hasSlug
    console.log("archive", afterArchive, "archiveGone", result.archiveGone)
  }

  await shot("116-stage4-new-teammate-after-archive.png")

  const pass =
    result.sheetOpen &&
    result.cancelNoHalf &&
    result.createRoster &&
    result.editPreserved &&
    result.archiveGone

  console.log(JSON.stringify({ ...result, livePass: pass }, null, 2))
  exitCode = pass ? 0 : 1
} catch (err) {
  console.error("probe failed", err)
  exitCode = 1
} finally {
  try {
    ws?.close()
    console.log("ws.closed")
  } catch {
    /* ignore */
  }
  process.exit(exitCode)
}
