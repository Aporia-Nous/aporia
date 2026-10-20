import WebSocket from "ws"

const CDP_PORT = process.env.APORETIC_CDP_PORT || "9223"
const absCode =
  "C:/Users/Dilla/.cursor/worktrees/opt/cursor-aporetic-stage4/packages/app/src/shell/an/tokens.ts"
const absDoc =
  "C:/Users/Dilla/.cursor/worktrees/opt/cursor-aporetic-stage4/docs/an-rewrite/CURSOR-AP-STAGE4-17.md"

const list = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`).then((r) => r.json())
const page = list.find((p) => p.type === "page")
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((res, rej) => {
  ws.on("open", res)
  ws.on("error", rej)
})
let id = 0
const pending = new Map()
ws.on("message", (d) => {
  const m = JSON.parse(String(d))
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m)
    pending.delete(m.id)
  }
})
const send = (method, params = {}) =>
  new Promise((r) => {
    const i = ++id
    pending.set(i, r)
    ws.send(JSON.stringify({ id: i, method, params }))
  })
await send("Runtime.enable")
const ev = async (expression) => {
  const res = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })
  if (res.result?.exceptionDetails) console.error(JSON.stringify(res.result.exceptionDetails).slice(0, 400))
  return res.result?.result?.value
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

await ev(`document.querySelector('.an-nav-item[title="Review"]')?.click()`)
await sleep(700)
await ev(`document.querySelector('[data-action="review-tab-code"]')?.click()`)
await sleep(200)

const code = await ev(`(async () => {
  const input = document.querySelector('[data-an-part="review-code-path-input"]')
  input.focus()
  input.value = ${JSON.stringify(absCode)}
  input.dispatchEvent(new Event('input', { bubbles: true }))
  document.querySelector('[data-action="review-code-open"]')?.click()
  await new Promise((r) => setTimeout(r, 2200))
  const editor = document.querySelector('[data-an-part="review-code-editor"]')
  return {
    status: editor?.getAttribute('data-status'),
    err: document.querySelector('[data-an-part="review-code-error"]')?.textContent,
    lines: document.querySelectorAll('.an-review-code-line').length,
    sample: document.querySelector('[data-an-part="review-code-body"]')?.textContent?.slice(0, 120),
  }
})()`)
console.log("code", code)

await ev(`document.querySelector('[data-action="review-tab-documents"]')?.click()`)
await sleep(200)
const doc = await ev(`(async () => {
  const input = document.querySelector('[data-an-part="review-document-path-input"]')
  input.focus()
  input.value = ${JSON.stringify(absDoc)}
  input.dispatchEvent(new Event('input', { bubbles: true }))
  document.querySelector('[data-action="review-document-open"]')?.click()
  await new Promise((r) => setTimeout(r, 2200))
  const preview = document.querySelector('[data-an-part="review-document-preview"]')
  return {
    status: preview?.getAttribute('data-status'),
    err: document.querySelector('[data-an-part="review-document-error"]')?.textContent,
    html: document.querySelector('[data-an-part="review-document-body"]')?.innerHTML?.slice(0, 160),
  }
})()`)
console.log("doc", doc)
ws.close()
