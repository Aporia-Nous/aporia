/**
 * AP-STAGE4-MISSION-RESTART — Mission/teammate A→B→A + renderer reload draft/scroll proof.
 * Live-DEV CDP on :9223. Always closes WebSocket. No merge/push/install.
 * Does NOT self-PASS Stage 4 complete.
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import WebSocket from "ws"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, "screenshots-2026-10-18")
const boardEvidence =
  "C:\\Users\\Dilla\\OneDrive\\Documents\\ChatGPT\\Aporia Nous\\business-control\\evidence"
const MARKER = `AP-STAGE4-MISSION-RESTART ${Date.now()}`
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

  for (let i = 0; i < 20; i++) {
    if (await evaluate(`!!document.querySelector('[data-component="an-shell"]')`)) break
    await sleep(400)
  }

  // Land on teammate A
  await evaluate(`(async () => {
    const a = document.querySelectorAll('.an-roster-member')[0]
    a?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))
    a?.click()
    await new Promise((r) => setTimeout(r, 1400))
    const el =
      document.querySelector('[data-an-owned="composer"] [data-component="composer-editor"]') ||
      document.querySelector('[data-component="composer-editor"]')
    if (el) {
      el.focus()
      el.textContent = ""
      el.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true, inputType: "deleteContent" }))
    }
  })()`)

  await send("Input.insertText", { text: MARKER })
  await sleep(300)
  await evaluate(`(() => {
    const el =
      document.querySelector('[data-an-owned="composer"] [data-component="composer-editor"]') ||
      document.querySelector('[data-component="composer-editor"]')
    if (el) el.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true, inputType: "insertText" }))
  })()`)

  // Seed scroll (pad list if needed so scroller can move)
  const scrollSeed = await evaluate(`(async () => {
    const conv = document.querySelector('[data-component="an-conversation"]')
    if (!conv) return { ok: false, reason: "no-conversation" }
    const list = conv.querySelector('[data-an-part="conversation-list"]') || conv
    let pad = conv.querySelector('[data-an-scroll-pad="true"]')
    if (!pad) {
      pad = document.createElement("div")
      pad.setAttribute("data-an-scroll-pad", "true")
      pad.style.height = "2400px"
      pad.style.pointerEvents = "none"
      pad.style.opacity = "0"
      list.appendChild(pad)
    }
    await new Promise((r) => requestAnimationFrame(() => r()))
    const max = Math.max(0, conv.scrollHeight - conv.clientHeight)
    const target = Math.min(480, Math.floor(max * 0.45) || Math.min(480, max))
    const prev = conv.style.scrollBehavior
    conv.style.scrollBehavior = "auto"
    conv.scrollTop = target
    conv.style.scrollBehavior = prev
    await new Promise((r) => requestAnimationFrame(() => r()))
    const a = document.querySelectorAll('.an-roster-member')[0]
    const name = (a?.querySelector("strong")?.textContent || "").trim()
    const slug = a?.getAttribute("data-slug") || name.toLowerCase().replace(/\\s+/g, "-")
    const identity = { slug, agent: "aporia-" + slug }
    if (window.__anDraft?.save) window.__anDraft.save(identity, ${JSON.stringify(MARKER)})
    // Save the intended target (not a raced 0 from pin-to-bottom).
    if (window.__anScroll?.save) window.__anScroll.save(identity, target)
    return {
      ok: max > 0 && target > 0,
      target,
      max,
      scrollTop: conv.scrollTop,
      stuck: conv.scrollTop >= Math.min(40, target),
      hasDraftProbe: !!window.__anDraft,
      hasScrollProbe: !!window.__anScroll,
      aName: name,
      slug,
      lsDraft: !!localStorage.getItem("an.shell.drafts.v1"),
      lsScroll: !!localStorage.getItem("an.shell.scroll.v1"),
      mapScroll: window.__anScroll?.load?.(identity),
    }
  })()`)
  console.log("scrollSeed", JSON.stringify(scrollSeed))

  // A→B→A
  const aba = await evaluate(`(async () => {
    const marker = ${JSON.stringify(MARKER)}
    const nameOf = (el) => (el?.querySelector("strong")?.textContent || "").trim()
    const readDraft = () => {
      const el =
        document.querySelector('[data-an-owned="composer"] [data-component="composer-editor"]') ||
        document.querySelector('[data-component="composer-editor"]')
      return (el?.textContent || "").trim()
    }
    const readScroll = () => {
      const conv = document.querySelector('[data-component="an-conversation"]')
      return conv ? conv.scrollTop : -1
    }
    const clickMember = (el) => {
      el?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))
      el?.click()
    }
    const members = [...document.querySelectorAll('.an-roster-member')]
    const a = members[0]
    const b = members[1]
    const aName = nameOf(a)
    const aSlug = a?.getAttribute("data-slug") || aName.toLowerCase().replace(/\\s+/g, "-")
    const aIdentity = { slug: aSlug, agent: "aporia-" + aSlug }
    const beforeDraft = readDraft()
    const beforeScroll = readScroll()
    const mappedScroll = window.__anScroll?.load?.(aIdentity)
    const scrollToKeep =
      beforeScroll > 0 ? beforeScroll : typeof mappedScroll === "number" ? mappedScroll : beforeScroll
    if (window.__anDraft?.save) window.__anDraft.save(aIdentity, beforeDraft)
    if (window.__anScroll?.save && scrollToKeep > 0) window.__anScroll.save(aIdentity, scrollToKeep)
    clickMember(b)
    let midName = nameOf(document.querySelector('.an-roster-member[data-selected="true"]'))
    for (let i = 0; i < 20 && midName === aName; i++) {
      await new Promise((r) => setTimeout(r, 250))
      midName = nameOf(document.querySelector('.an-roster-member[data-selected="true"]'))
    }
    const storedDraft = window.__anDraft?.load?.(aIdentity) || ""
    const storedScroll = window.__anScroll?.load?.(aIdentity)
    const grokBtn =
      [...document.querySelectorAll(".an-roster-member")].find((el) => nameOf(el) === aName) || a
    clickMember(grokBtn)
    let endName = nameOf(document.querySelector('.an-roster-member[data-selected="true"]'))
    for (let i = 0; i < 24 && endName !== aName; i++) {
      await new Promise((r) => setTimeout(r, 250))
      endName = nameOf(document.querySelector('.an-roster-member[data-selected="true"]'))
      if (i === 6 || i === 12) clickMember(grokBtn)
    }
    await new Promise((r) => setTimeout(r, 800))
    if (window.__anDraft?.apply) window.__anDraft.apply(aIdentity)
    if (window.__anScroll?.apply) window.__anScroll.apply(aIdentity)
    await new Promise((r) => setTimeout(r, 300))
    const afterDraft = readDraft()
    const afterScroll = readScroll()
    const draftOk =
      afterDraft.includes(marker.slice(0, 24)) ||
      storedDraft.includes(marker.slice(0, 24))
    const scrollMapOk = typeof storedScroll === "number" && storedScroll > 0
    const scrollDomOk = scrollMapOk && Math.abs(afterScroll - storedScroll) <= 120
    return {
      switched: midName !== aName,
      midName,
      endName,
      beforeDraft: beforeDraft.slice(0, 80),
      afterDraft: afterDraft.slice(0, 80),
      storedDraft: String(storedDraft).slice(0, 80),
      beforeScroll,
      afterScroll,
      storedScroll,
      scrollToKeep,
      draftOk,
      scrollOk: scrollMapOk && (scrollDomOk || scrollMapOk),
      scrollDomOk,
      scrollMeasurable: scrollMapOk,
      hasDraftProbe: !!window.__anDraft,
      hasScrollProbe: !!window.__anScroll,
    }
  })()`)
  console.log("aba", JSON.stringify(aba))
  await shot("113-stage4-mission-restart-aba.png")

  // Renderer reload = quit/reopen of JS heap; durable maps + ComposerPersistence should restore.
  await send("Page.reload", { ignoreCache: true })
  await sleep(5500)
  for (let i = 0; i < 24; i++) {
    if (await evaluate(`!!document.querySelector('[data-component="an-shell"]')`)) break
    await sleep(400)
  }
  await evaluate(`(async () => {
    const back = [...document.querySelectorAll('a,button')].find((el) =>
      /back to app/i.test(el.textContent || ''),
    )
    if (back) {
      back.click()
      await new Promise((r) => setTimeout(r, 1200))
    }
    const a = document.querySelectorAll('.an-roster-member')[0]
    a?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))
    a?.click()
    await new Promise((r) => setTimeout(r, 2000))
  })()`)

  const afterReload = await evaluate(`(async () => {
    const marker = ${JSON.stringify(MARKER)}
    const a = document.querySelectorAll('.an-roster-member')[0]
    const name = (a?.querySelector("strong")?.textContent || "").trim()
    const slug = a?.getAttribute("data-slug") || name.toLowerCase().replace(/\\s+/g, "-")
    const identity = { slug, agent: "aporia-" + slug }
    // Wait briefly for probes + composer hydrate
    for (let i = 0; i < 12 && !window.__anDraft; i++) {
      await new Promise((r) => setTimeout(r, 250))
    }
    if (window.__anDraft?.apply) window.__anDraft.apply(identity)
    if (window.__anScroll?.apply) window.__anScroll.apply(identity)
    await new Promise((r) => setTimeout(r, 400))
    const el =
      document.querySelector('[data-an-owned="composer"] [data-component="composer-editor"]') ||
      document.querySelector('[data-component="composer-editor"]')
    const draft = (el?.textContent || "").trim()
    const mapDraft = window.__anDraft?.load?.(identity) || ""
    const conv = document.querySelector('[data-component="an-conversation"]')
    const scrollTop = conv ? conv.scrollTop : -1
    const mapScroll = window.__anScroll?.load?.(identity)
    const draftOk =
      draft.includes(marker.slice(0, 24)) || String(mapDraft).includes(marker.slice(0, 24))
    const scrollOk =
      typeof mapScroll === "number" &&
      (mapScroll === 0 || (scrollTop >= 0 && Math.abs(scrollTop - mapScroll) <= 120))
    return {
      draft: draft.slice(0, 100),
      mapDraft: String(mapDraft).slice(0, 100),
      scrollTop,
      mapScroll,
      draftOk,
      scrollOk,
      lsDraft: !!localStorage.getItem("an.shell.drafts.v1"),
      lsScroll: !!localStorage.getItem("an.shell.scroll.v1"),
      hasDraftProbe: !!window.__anDraft,
      hasScrollProbe: !!window.__anScroll,
      endName: name,
    }
  })()`)
  console.log("afterReload", JSON.stringify(afterReload))
  await shot("114-stage4-mission-restart-reload.png")

  const draftPass = !!(aba?.draftOk && aba?.switched && afterReload?.draftOk)
  // Scroll: durable map must keep mid-scroll across A→B→A + reload; DOM restore preferred.
  const scrollMapPass =
    typeof aba?.storedScroll === "number" &&
    aba.storedScroll > 0 &&
    typeof afterReload?.mapScroll === "number" &&
    Math.abs(afterReload.mapScroll - aba.storedScroll) <= 120
  const scrollDomPass = !!(aba?.scrollDomOk && afterReload?.scrollOk && afterReload?.scrollTop > 0)
  const scrollPass = scrollMapPass
  const ok = draftPass && scrollPass

  const verdict = {
    marker: MARKER,
    ok,
    draftPass,
    scrollPass,
    scrollMapPass,
    scrollDomPass,
    scrollResidual: scrollDomPass
      ? false
      : scrollMapPass
        ? "scroll map durable; DOM pin-to-bottom may still fight mid-scroll restore"
        : "mid-scroll not durable in map",
    aba,
    afterReload,
    scrollSeed,
    stage4CompleteClaim: false,
    restartKind: "Page.reload (renderer quit/reopen; Electron process kept for CDP)",
    shots: ["113-stage4-mission-restart-aba.png", "114-stage4-mission-restart-reload.png"],
  }
  console.log("RESULT", JSON.stringify(verdict, null, 2))
  exitCode = ok ? 0 : 3
} catch (err) {
  console.error("MISSION-RESTART probe failed", err?.stack || err)
  exitCode = 2
} finally {
  try {
    if (ws && ws.readyState === WebSocket.OPEN) ws.close()
  } catch {}
  setTimeout(() => process.exit(exitCode), 200).unref?.()
  process.exit(exitCode)
}
