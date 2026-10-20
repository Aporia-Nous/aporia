/**
 * Diagnostic: does composer draft survive A→B→A + Page.reload on live DEV?
 * Always closes WebSocket.
 */
import WebSocket from "ws"

const CDP_PORT = process.env.APORETIC_CDP_PORT || "9223"
const MARKER = `AP-STAGE4-MISSION-RESTART diag ${Date.now()}`

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
    console.error("No Aporetic CDP page")
    process.exit(1)
  }
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
      console.error("eval exception", JSON.stringify(res.result.exceptionDetails).slice(0, 600))
    }
    return res.result?.result?.value ?? null
  }

  await evaluate(`(async () => {
    const back = [...document.querySelectorAll('a,button')].find((el) =>
      /back to app/i.test(el.textContent || ''),
    )
    if (back) {
      back.click()
      await new Promise((r) => setTimeout(r, 1200))
    }
  })()`)

  for (let i = 0; i < 20; i++) {
    if (await evaluate(`!!document.querySelector('[data-component="an-shell"]')`)) break
    await sleep(400)
  }

  // Open teammate A, type marker
  await evaluate(`(async () => {
    const a = document.querySelectorAll('.an-roster-member')[0]
    a?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))
    a?.click()
    await new Promise((r) => setTimeout(r, 1200))
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
    if (window.__anDraft?.save) {
      const a = document.querySelectorAll('.an-roster-member')[0]
      const name = (a?.querySelector("strong")?.textContent || "").trim()
      const slug = a?.getAttribute("data-slug") || name.toLowerCase().replace(/\\s+/g, "-")
      window.__anDraft.save({ slug, agent: "aporia-" + slug }, ${JSON.stringify(MARKER)})
    }
  })()`)

  const beforeSwitch = await evaluate(`(() => {
    const el =
      document.querySelector('[data-an-owned="composer"] [data-component="composer-editor"]') ||
      document.querySelector('[data-component="composer-editor"]')
    const a = document.querySelectorAll('.an-roster-member')[0]
    const name = (a?.querySelector("strong")?.textContent || "").trim()
    const slug = a?.getAttribute("data-slug") || ""
    return {
      draft: (el?.textContent || "").trim().slice(0, 100),
      name,
      slug,
      mapSize: window.__anDraft?.size?.() ?? -1,
      lsKeys: Object.keys(localStorage).filter((k) => /draft|prompt|composer|an\\.shell/i.test(k)).slice(0, 40),
    }
  })()`)
  console.log("beforeSwitch", JSON.stringify(beforeSwitch))

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
    const clickMember = (el) => {
      el?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))
      el?.click()
    }
    const members = [...document.querySelectorAll('.an-roster-member')]
    const a = members[0]
    const b = members[1]
    const aName = nameOf(a)
    clickMember(b)
    await new Promise((r) => setTimeout(r, 1500))
    const midName = nameOf(document.querySelector('.an-roster-member[data-selected="true"]'))
    const grokBtn = [...document.querySelectorAll(".an-roster-member")].find((el) => nameOf(el) === aName) || a
    clickMember(grokBtn)
    await new Promise((r) => setTimeout(r, 1500))
    if (window.__anDraft?.apply) {
      const slug = a?.getAttribute("data-slug") || aName.toLowerCase().replace(/\\s+/g, "-")
      window.__anDraft.apply({ slug, agent: "aporia-" + slug })
      await new Promise((r) => setTimeout(r, 200))
    }
    const after = readDraft()
    return {
      midName,
      endName: nameOf(document.querySelector('.an-roster-member[data-selected="true"]')),
      after: after.slice(0, 100),
      abaOk: after.includes(marker.slice(0, 24)),
      mapSize: window.__anDraft?.size?.() ?? -1,
    }
  })()`)
  console.log("aba", JSON.stringify(aba))

  // Reload — clears in-memory Map; ComposerPersistence / localStorage should remain
  await send("Page.reload", { ignoreCache: true })
  await sleep(5000)
  for (let i = 0; i < 24; i++) {
    if (await evaluate(`!!document.querySelector('[data-component="an-shell"]')`)) break
    await sleep(500)
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

  const afterReload = await evaluate(`(() => {
    const marker = ${JSON.stringify(MARKER)}
    const el =
      document.querySelector('[data-an-owned="composer"] [data-component="composer-editor"]') ||
      document.querySelector('[data-component="composer-editor"]')
    const draft = (el?.textContent || "").trim()
    const a = document.querySelectorAll('.an-roster-member')[0]
    const name = (a?.querySelector("strong")?.textContent || "").trim()
    const slug = a?.getAttribute("data-slug") || name.toLowerCase().replace(/\\s+/g, "-")
    const mapLoad = window.__anDraft?.load?.({ slug, agent: "aporia-" + slug }) || ""
    return {
      draft: draft.slice(0, 120),
      mapLoad: String(mapLoad).slice(0, 120),
      mapSize: window.__anDraft?.size?.() ?? -1,
      hasProbe: !!window.__anDraft,
      domOk: draft.includes(marker.slice(0, 24)),
      mapOk: String(mapLoad).includes(marker.slice(0, 24)),
      lsSample: Object.keys(localStorage)
        .filter((k) => /draft|prompt|composer|an\\.shell|opencode/i.test(k))
        .slice(0, 30),
    }
  })()`)
  console.log("afterReload", JSON.stringify(afterReload))

  const ok = !!(aba?.abaOk && (afterReload?.domOk || afterReload?.mapOk))
  console.log(
    "RESULT",
    JSON.stringify({
      marker: MARKER,
      ok,
      abaOk: aba?.abaOk,
      reloadDomOk: afterReload?.domOk,
      reloadMapOk: afterReload?.mapOk,
      gap: ok ? null : "need durable AnShell draft persist and/or composer restore path",
    }),
  )
  exitCode = ok ? 0 : 3
} catch (err) {
  console.error("diag failed", err?.stack || err)
  exitCode = 2
} finally {
  try {
    if (ws && ws.readyState === WebSocket.OPEN) ws.close()
  } catch {}
  setTimeout(() => process.exit(exitCode), 200).unref?.()
  process.exit(exitCode)
}
