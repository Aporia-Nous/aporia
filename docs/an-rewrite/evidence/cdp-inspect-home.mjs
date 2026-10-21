import WebSocket from "ws"
const list = await fetch("http://127.0.0.1:9222/json/list").then((r) => r.json())
const page = list.find((p) => p.type === "page" && (p.url || "").includes("5173"))
if (!page?.webSocketDebuggerUrl) {
  console.error("no page")
  process.exit(1)
}
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
const v = await send("Runtime.evaluate", {
  expression: `(() => ({
  url: location.href,
  hasShell: !!document.querySelector('[data-component="an-shell"]'),
  hasSession: !!document.querySelector('[data-component="an-shell-session"]'),
  composer: !!document.querySelector('[data-an-owned="composer"]'),
  connect: !!document.querySelector('[data-action="computer-connect"]'),
  roster: [...document.querySelectorAll('.an-roster-member')].slice(0,5).map(b => b.getAttribute('aria-label')),
  sessionLinks: [...document.querySelectorAll('a[href*="session"]')].slice(0,8).map(a => a.getAttribute('href')),
  bodySample: (document.body?.innerText || '').slice(0,500)
}))()`,
  returnByValue: true,
})
console.log(JSON.stringify(v.result?.result?.value, null, 2))
ws.close()
