/**
 * Evidence-only: leave Settings so AnShell remounts for STAGE4-19 verify.
 * Closes WebSocket + process.exit (no hang).
 */
import WebSocket from "ws"

const CDP_PORT = process.env.APORETIC_CDP_PORT || "9223"
let ws
let exitCode = 1

function connect(wsUrl) {
  const sock = new WebSocket(wsUrl)
  let id = 0
  const pending = new Map()
  function send(method, params = {}) {
    const msgId = ++id
    return new Promise((resolve, reject) => {
      pending.set(msgId, { resolve, reject })
      sock.send(JSON.stringify({ id: msgId, method, params }))
    })
  }
  sock.on("message", (data) => {
    const msg = JSON.parse(String(data))
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id).resolve(msg)
      pending.delete(msg.id)
    }
  })
  return new Promise((resolve, reject) => {
    sock.on("open", () => resolve({ ws: sock, send }))
    sock.on("error", reject)
  })
}

try {
  const list = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`).then((r) => r.json())
  const page =
    list.find((p) => p.type === "page" && (p.url || "").includes("5173")) ??
    list.find((p) => p.type === "page" && (p.title || "").includes("Aporetic"))
  if (!page?.webSocketDebuggerUrl) throw new Error("no page")
  const conn = await connect(page.webSocketDebuggerUrl)
  ws = conn.ws
  const send = conn.send
  await send("Runtime.enable")
  const before = await send("Runtime.evaluate", {
    expression: `(() => ({
      href: location.href,
      path: location.pathname,
      shell: !!document.querySelector('[data-component="an-shell"]'),
      settings: !!document.querySelector('[data-testid="settings-screen"], .settings-screen'),
      backText: [...document.querySelectorAll('a,button')].map(el => (el.textContent||'').trim()).find(t => /back to app/i.test(t)) || null,
    }))()`,
    returnByValue: true,
  })
  console.log("before", JSON.stringify(before.result?.result?.value))

  const leave = await send("Runtime.evaluate", {
    expression: `(async () => {
      const back = [...document.querySelectorAll('a,button,[role="link"]')].find((el) =>
        /back to app/i.test(el.textContent || ''),
      )
      if (back) {
        back.click()
        await new Promise((r) => setTimeout(r, 2000))
      } else {
        history.pushState({}, '', '/')
        window.dispatchEvent(new PopStateEvent('popstate'))
        await new Promise((r) => setTimeout(r, 2000))
      }
      // Prefer home if still settings
      if (document.querySelector('[data-testid="settings-screen"], .settings-screen')) {
        location.href = 'http://localhost:5173/'
        await new Promise((r) => setTimeout(r, 3500))
      }
      return {
        href: location.href,
        path: location.pathname,
        shell: !!document.querySelector('[data-component="an-shell"]'),
        settings: !!document.querySelector('[data-testid="settings-screen"], .settings-screen'),
        roster: document.querySelectorAll('.an-roster-member').length,
        personality: document.querySelector('[data-component="an-shell"]')?.getAttribute('data-presence-personality'),
      }
    })()`,
    returnByValue: true,
    awaitPromise: true,
  })
  console.log("after", JSON.stringify(leave.result?.result?.value))
  const v = leave.result?.result?.value
  exitCode = v?.shell ? 0 : 2
} catch (err) {
  console.error(err)
  exitCode = 1
} finally {
  try {
    ws?.close()
  } catch {
    // ignore
  }
  process.exit(exitCode)
}
