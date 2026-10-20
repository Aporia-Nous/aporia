import WebSocket from "ws"

const list = await fetch("http://127.0.0.1:9222/json/list").then((r) => r.json())
const page = list.find((p) => p.type === "page")
const edge = await fetch("http://127.0.0.1:9333/json/list").then((r) => r.json())
const pixel = edge.find((p) => p.type === "page" && (p.title || "").includes("AP-BF-05"))
console.log("pixel ws", pixel?.webSocketDebuggerUrl)

const ws = new WebSocket(page.webSocketDebuggerUrl)
let id = 0
const pending = new Map()
function send(method, params = {}) {
  const mid = ++id
  return new Promise((res, rej) => {
    pending.set(mid, { res, rej })
    ws.send(JSON.stringify({ id: mid, method, params }))
  })
}
ws.on("message", (d) => {
  const m = JSON.parse(String(d))
  if (m.id && pending.has(m.id)) {
    pending.get(m.id).res(m)
    pending.delete(m.id)
  }
})
await new Promise((r, j) => {
  ws.on("open", r)
  ws.on("error", j)
})
await send("Runtime.enable")

const expr = `(() => new Promise((resolve) => {
  const wsUrl = ${JSON.stringify(pixel.webSocketDebuggerUrl)};
  let settled = false;
  const done = (v) => { if (!settled) { settled = true; resolve(v) } };
  try {
    const w = new WebSocket(wsUrl);
    const t = setTimeout(() => done({ state: w.readyState, timedOut: true }), 2500);
    w.onopen = () => { clearTimeout(t); done({ state: w.readyState, open: true }); try { w.close() } catch {} };
    w.onerror = () => { clearTimeout(t); done({ state: w.readyState, error: true }); };
    w.onclose = (e) => { clearTimeout(t); done({ state: w.readyState, closed: true, code: e.code, reason: e.reason }); };
  } catch (err) {
    done({ throw: String(err && err.message ? err.message : err) });
  }
}))()`

const res = await send("Runtime.evaluate", {
  expression: expr,
  awaitPromise: true,
  returnByValue: true,
})
console.log("diag", JSON.stringify(res.result?.result?.value ?? res.result ?? res, null, 2))
ws.close()
