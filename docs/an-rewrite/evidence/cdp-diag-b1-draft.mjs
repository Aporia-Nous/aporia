/**
 * Diagnose AP-STAGE4-B1: draft store vs DOM across roster teammate switch.
 */
import WebSocket from "ws"

const CDP_PORT = process.env.APORETIC_CDP_PORT || "9223"
const MARKER = `B1-DIAG ${Date.now()}`

const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json()
const page = list.find((t) => t.type === "page" && /5173|Aporetic/i.test(`${t.url}${t.title}`))
if (!page) throw new Error("no page")

const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((res, rej) => {
  ws.on("open", res)
  ws.on("error", rej)
})
let id = 0
const pending = new Map()
ws.on("message", (data) => {
  const msg = JSON.parse(String(data))
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg)
    pending.delete(msg.id)
  }
})
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const msgId = ++id
    pending.set(msgId, resolve)
    ws.send(JSON.stringify({ id: msgId, method, params }))
  })
const evaluate = async (expression) => {
  const res = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })
  if (res.result?.exceptionDetails) {
    return { __error: res.result.exceptionDetails.text || "eval-error", details: res.result.exceptionDetails }
  }
  return res.result?.result?.value
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

await send("Runtime.enable")
await send("Page.enable")

const boot = await evaluate(`({
  href: location.href,
  shell: !!document.querySelector('[data-component="an-shell"]'),
  members: document.querySelectorAll('.an-roster-member').length,
  selected: [...document.querySelectorAll('.an-roster-member[data-selected="true"]')].map(el => el.textContent?.trim().slice(0,40)),
  editor: !!document.querySelector('[data-an-owned="composer"] [data-component="composer-editor"]'),
  flushFn: typeof window.__anFlushComposerDraft,
})`)
console.log("boot", JSON.stringify(boot))

// Focus + type
await evaluate(`(() => {
  const el = document.querySelector('[data-an-owned="composer"] [data-component="composer-editor"]')
    || document.querySelector('[data-component="composer-editor"]')
  if (!el) return false
  el.focus(); el.click(); return true
})()`)
await send("Input.dispatchKeyEvent", { type: "keyDown", windowsVirtualKeyCode: 65, modifiers: 2 })
await send("Input.dispatchKeyEvent", { type: "keyUp", windowsVirtualKeyCode: 65, modifiers: 2 })
await send("Input.insertText", { text: MARKER })
await sleep(300)

const afterType = await evaluate(`(() => {
  const el = document.querySelector('[data-an-owned="composer"] [data-component="composer-editor"]')
    || document.querySelector('[data-component="composer-editor"]')
  const beforeFlush = (el?.textContent || "").trim()
  el?.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true, inputType: "insertText" }))
  const afterFlush = (el?.textContent || "").trim()
  // Probe whether Solid attached an onInput listener by counting listeners if possible
  return {
    beforeFlush: beforeFlush.slice(0, 100),
    afterFlush: afterFlush.slice(0, 100),
    sessionHref: location.href,
    selected: [...document.querySelectorAll('.an-roster-member[data-selected="true"]')].map(el => (el.querySelector('strong')?.textContent || el.textContent || "").trim().slice(0, 40)),
  }
})()`)
console.log("afterType", JSON.stringify(afterType))

const switchAway = await evaluate(`(async () => {
  const read = () => {
    const el = document.querySelector('[data-an-owned="composer"] [data-component="composer-editor"]')
      || document.querySelector('[data-component="composer-editor"]')
    return (el?.textContent || "").trim()
  }
  const members = [...document.querySelectorAll('.an-roster-member')]
  const a = members[0]
  const b = members[1]
  const aName = (a?.querySelector('strong')?.textContent || "").trim()
  const bName = (b?.querySelector('strong')?.textContent || "").trim()
  const hrefBefore = location.href
  const draftBefore = read()
  // explicit flush like product openMember
  const el = document.querySelector('[data-an-owned="composer"] [data-component="composer-editor"]')
  el?.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true, inputType: "insertText" }))
  b.click()
  await new Promise(r => setTimeout(r, 1600))
  const mid = {
    href: location.href,
    draft: read().slice(0, 100),
    selected: [...document.querySelectorAll('.an-roster-member[data-selected="true"]')].map(el => (el.querySelector('strong')?.textContent || "").trim()),
    hrefChanged: location.href !== hrefBefore,
  }
  a.click()
  await new Promise(r => setTimeout(r, 1600))
  const end = {
    href: location.href,
    draft: read().slice(0, 100),
    selected: [...document.querySelectorAll('.an-roster-member[data-selected="true"]')].map(el => (el.querySelector('strong')?.textContent || "").trim()),
    backToStartHref: location.href === hrefBefore,
  }
  return { aName, bName, hrefBefore, draftBefore: draftBefore.slice(0, 100), mid, end }
})()`)
console.log("switch", JSON.stringify(switchAway, null, 2))

ws.close()
process.exit(0)
