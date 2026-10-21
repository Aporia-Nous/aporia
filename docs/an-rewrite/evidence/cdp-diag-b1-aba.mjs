/** Strict A→B→A draft survival on roster teammate switch. */
import WebSocket from "ws"

const CDP_PORT = process.env.APORETIC_CDP_PORT || "9223"
const MARKER = `B1-ABA ${Date.now()}`
const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json()
const page = list.find((t) => t.type === "page")
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((res, rej) => {
  ws.on("open", res)
  ws.on("error", rej)
})
let id = 0
const pending = new Map()
ws.on("message", (data) => {
  const msg = JSON.parse(String(data))
  if (msg.id && pending.has(msg.id)) pending.get(msg.id)(msg)
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
    return { __error: res.result.exceptionDetails.exception?.description || res.result.exceptionDetails.text }
  }
  return res.result?.result?.value
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

await send("Page.enable")
await send("Runtime.enable")

// Expose draft helpers if module graph has them (best-effort)
await evaluate(`(() => {
  window.__b1Probe = {
    clickMember(index) {
      const members = [...document.querySelectorAll(".an-roster-member")]
      const el = members[index]
      if (!el) return false
      el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))
      el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
      el.click()
      el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }))
      return true
    },
    selected() {
      const el = document.querySelector('.an-roster-member[data-selected="true"]')
      return (el?.querySelector("strong")?.textContent || "").trim()
    },
    read() {
      const el =
        document.querySelector('[data-an-owned="composer"] [data-component="composer-editor"]') ||
        document.querySelector('[data-component="composer-editor"]')
      return (el?.textContent || "").trim()
    },
    flush() {
      const el =
        document.querySelector('[data-an-owned="composer"] [data-component="composer-editor"]') ||
        document.querySelector('[data-component="composer-editor"]')
      el?.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true, inputType: "insertText" }))
    },
  }
  return true
})()`)

const result = await evaluate(`(async () => {
  const marker = ${JSON.stringify(MARKER)}
  const P = window.__b1Probe
  const members = [...document.querySelectorAll(".an-roster-member")]
  if (members.length < 2) return { ok: false, reason: "need-2" }
  const aName = (members[0].querySelector("strong")?.textContent || "").trim()
  const bName = (members[1].querySelector("strong")?.textContent || "").trim()

  P.clickMember(0)
  await new Promise((r) => setTimeout(r, 2000))
  const startSelected = P.selected()

  const editor =
    document.querySelector('[data-an-owned="composer"] [data-component="composer-editor"]') ||
    document.querySelector('[data-component="composer-editor"]')
  if (!editor) return { ok: false, reason: "no-editor", startSelected }
  editor.focus()
  editor.click()
  document.execCommand("selectAll")
  document.execCommand("insertText", false, marker)
  P.flush()
  await new Promise((r) => setTimeout(r, 500))
  const before = P.read()

  P.clickMember(1)
  // Wait until selection leaves A or timeout
  let midSelected = P.selected()
  for (let i = 0; i < 20 && midSelected === aName; i++) {
    await new Promise((r) => setTimeout(r, 250))
    midSelected = P.selected()
  }
  const mid = { selected: midSelected, href: location.href, draft: P.read().slice(0, 80), switched: midSelected !== aName }

  P.clickMember(0)
  let endSelected = P.selected()
  for (let i = 0; i < 20 && endSelected !== aName; i++) {
    await new Promise((r) => setTimeout(r, 250))
    endSelected = P.selected()
  }
  // Allow deferred anDraftApply timers (0/120/400ms)
  await new Promise((r) => setTimeout(r, 700))
  const after = P.read()
  return {
    ok: mid.switched && (after.includes(marker) || after.includes(marker.slice(0, 20))),
    a: aName,
    b: bName,
    startSelected,
    before: before.slice(0, 80),
    mid,
    endSelected,
    after: after.slice(0, 80),
    hrefEnd: location.href,
  }
})()`)

console.log(JSON.stringify(result, null, 2))
ws.close()
process.exit(result?.ok ? 0 : 1)
