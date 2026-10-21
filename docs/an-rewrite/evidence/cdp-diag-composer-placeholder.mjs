import WebSocket from "ws"

const CDP_PORT = process.env.APORETIC_CDP_PORT || "9223"
let ws
try {
  const list = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`).then((r) => r.json())
  const page = list.find((p) => p.type === "page" && (p.url || "").includes("5173"))
  ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((res, rej) => {
    ws.on("open", res)
    ws.on("error", rej)
  })
  let id = 0
  const pending = new Map()
  ws.on("message", (d) => {
    const m = JSON.parse(String(d))
    if (m.id && pending.has(m.id)) {
      pending.get(m.id).resolve(m)
      pending.delete(m.id)
    }
  })
  const send = (method, params = {}) => {
    const mid = ++id
    return new Promise((resolve, reject) => {
      pending.set(mid, { resolve, reject })
      ws.send(JSON.stringify({ id: mid, method, params }))
    })
  }
  await send("Runtime.enable")
  const r = await send("Runtime.evaluate", {
    returnByValue: true,
    awaitPromise: true,
    expression: `(async () => {
      if (document.querySelector('[data-testid="settings-screen"], .settings-screen')) {
        [...document.querySelectorAll('a,button')].find((el) => /back to app/i.test(el.textContent || ''))?.click()
        await new Promise((x) => setTimeout(x, 1500))
      }
      if (!document.querySelector('[data-an-owned="composer"]')) {
        document.querySelector('.an-roster-member')?.click()
        await new Promise((x) => setTimeout(x, 2400))
      }
      const owned = document.querySelector('[data-an-owned="composer"]')
      const fields = [...document.querySelectorAll('textarea, [contenteditable="true"], input')].map((el) => ({
        tag: el.tagName,
        ph: el.getAttribute('placeholder'),
        aria: el.getAttribute('aria-placeholder'),
        text: (el.value || el.textContent || '').slice(0, 80),
        inOwned: !!(owned && owned.contains(el)),
      }))
      const controls = [...document.querySelectorAll('[data-an-owned="composer"] [data-slot="composer-controls"]')]
      const hidden = controls.map((el) => getComputedStyle(el).display)
      const ownedText = (owned?.innerText || '').slice(0, 240)
      return { owned: !!owned, fields, controlsCount: controls.length, hidden, ownedText }
    })()`,
  })
  console.log(JSON.stringify(r.result?.result?.value, null, 2))
} finally {
  try {
    ws?.close()
  } catch {}
  process.exit(0)
}
