import WebSocket from "ws"

const CDP_PORT = process.env.APORETIC_CDP_PORT || "9223"
const list = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`).then((r) => r.json())
const page = list.find((p) => p.type === "page")
if (!page?.webSocketDebuggerUrl) throw new Error("no page")
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
  return res.result?.result?.value
}
const info = await ev(`(() => ({
  url: location.href,
  title: document.title,
  anShell: !!document.querySelector('[data-component="an-shell"]'),
  bodyText: (document.body?.innerText || "").slice(0, 400),
  components: [...document.querySelectorAll("[data-component]")].slice(0, 30).map((el) => el.getAttribute("data-component")),
  navTitles: [...document.querySelectorAll(".an-nav-item")].map((b) => b.getAttribute("title") || b.getAttribute("aria-label")),
  sessionLinks: [...document.querySelectorAll('a[href*="session"]')].slice(0, 8).map((a) => a.getAttribute("href")),
  roster: document.querySelectorAll(".an-roster-member").length,
}))()`)
console.log(JSON.stringify(info, null, 2))
ws.close()
