import WebSocket from "ws"
import { writeFileSync } from "fs"

const out =
  process.argv[2] ||
  "C:/Users/Dilla/.cursor/worktrees/opt/cursor-aporetic-stage4/docs/an-rewrite/evidence/screenshots-2026-10-18/10-conversation-stream-glass.png"

const list = await fetch("http://127.0.0.1:9222/json/list").then((r) => r.json())
const page = list.find((p) => p.type === "page") ?? list[0]
const ws = new WebSocket(page.webSocketDebuggerUrl)
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

await new Promise((resolve, reject) => {
  ws.on("open", resolve)
  ws.on("error", reject)
})

await send("Page.enable")
await send("Runtime.enable")

// Wait until shell is present
for (let i = 0; i < 10; i++) {
  const evalRes = await send("Runtime.evaluate", {
    expression: `!!document.querySelector('[data-component="an-shell"]')`,
    returnByValue: true,
  })
  if (evalRes.result?.result?.value) break
  await new Promise((r) => setTimeout(r, 800))
}

const shot = await send("Page.captureScreenshot", { format: "png", fromSurface: true })
const data = shot.result?.result?.data ?? shot.result?.data
if (!data) {
  console.error(JSON.stringify(shot, null, 2))
  process.exit(1)
}
writeFileSync(out, Buffer.from(data, "base64"))
console.log(`saved=${out} bytes=${Buffer.from(data, "base64").length}`)
ws.close()
