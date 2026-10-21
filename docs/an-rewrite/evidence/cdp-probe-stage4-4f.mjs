/**
 * AP-STAGE4-4F — illustrated nav + honest Podman chrome live-DEV CDP.
 * Port :9223. Always closes WebSocket. Does NOT self-PASS Stage 4 complete.
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import WebSocket from "ws"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, "screenshots-2026-10-18")
const boardEvidence =
  "C:\\Users\\Dilla\\OneDrive\\Documents\\ChatGPT\\Aporia Nous\\business-control\\evidence"
const MARKER = `AP-STAGE4-4F ${Date.now()}`
const CDP_PORT = process.env.APORETIC_CDP_PORT || "9223"

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
const result = {
  marker: MARKER,
  tipHint: "fill after commit",
  navIllustrated: false,
  navIconCount: 0,
  podmanPart: false,
  podmanPhase: null,
  podmanNeverFakeOnline: false,
  podmanNeverAutoInstall: false,
  podmanTitleHonest: false,
  podmanNotRunning: false,
  missionPillHonest: false,
  composerOwned: false,
  enginePort: false,
  residuals: [],
}

try {
  const list = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`).then((r) => r.json())
  const page =
    list.find((p) => p.type === "page" && (p.url || "").includes("5173")) ??
    list.find((p) => p.type === "page" && (p.title || "").includes("Aporetic"))
  if (!page?.webSocketDebuggerUrl) {
    console.error("No Aporetic CDP page on", CDP_PORT)
    process.exit(1)
  }
  console.log("aporetic", page.title, page.url)

  const conn = await connect(page.webSocketDebuggerUrl)
  ws = conn.ws
  const send = conn.send
  await send("Page.enable")
  await send("Runtime.enable")
  await send("Page.navigate", { url: "http://localhost:5173/" })
  await sleep(4000)

  async function evaluate(expression) {
    const res = await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    if (res.result?.exceptionDetails) {
      console.error("eval exception", JSON.stringify(res.result.exceptionDetails).slice(0, 800))
    }
    return res.result?.result?.value ?? null
  }

  // Wait for Podman probe to leave checking (bridge which() usually <1s).
  for (let i = 0; i < 12; i++) {
    const phase = await evaluate(
      `document.querySelector('[data-an-part="podman-chrome"]')?.getAttribute('data-an-podman') || null`,
    )
    if (phase && phase !== "checking") break
    await sleep(400)
  }

  const snap = await evaluate(`(() => {
    const nav = document.querySelector('nav.an-nav[data-an-part="nav-illustrated"]')
    const icons = document.querySelectorAll('.an-nav-icon[data-an-nav="illustrated"]')
    const pod = document.querySelector('[data-an-part="podman-chrome"]')
    const pills = [...document.querySelectorAll('.an-pill')].map((el) => el.textContent || '')
    const podText = pod?.innerText || ''
    const owned = document.querySelector('[data-an-owned="composer"]')
    const engine = document.querySelector('[data-an-engine-port]')
    const probe = globalThis.__anPodman
    return {
      navIllustrated: !!(nav && nav.getAttribute('data-an-nav') === 'illustrated-line-fill'),
      navIconCount: icons.length,
      podmanPart: !!pod,
      podmanPhase: pod?.getAttribute('data-an-podman') || null,
      podmanNeverFakeOnline: pod?.getAttribute('data-never-fake-online') === 'true',
      podmanNeverAutoInstall: pod?.getAttribute('data-never-auto-install') === 'true',
      podmanTitleHonest: /Podman/i.test(podText) && !/running/i.test(podText),
      podmanNotRunning: !/running/i.test(podText) && !/\\d+\\s*containers?/i.test(podText),
      missionPillHonest: pills.some((p) => /Podman/i.test(p) && !/running/i.test(p)),
      composerOwned: !!owned,
      enginePort: !!engine,
      probePhase: probe?.status?.()?.phase || null,
      podText: podText.slice(0, 240),
      pills: pills.slice(0, 12),
    }
  })()`)

  if (snap) {
    Object.assign(result, snap)
    delete result.podText
    delete result.pills
    delete result.probePhase
    result.podmanTitleHonest = !!snap.podmanTitleHonest
    result.podmanNotRunning = !!snap.podmanNotRunning
    result.missionPillHonest = !!snap.missionPillHonest
    result.live = {
      podText: snap.podText,
      pills: snap.pills,
      probePhase: snap.probePhase,
    }
  }

  const ok =
    result.navIllustrated &&
    result.navIconCount >= 6 &&
    result.podmanPart &&
    result.podmanPhase &&
    result.podmanPhase !== "checking" &&
    result.podmanNeverFakeOnline &&
    result.podmanNeverAutoInstall &&
    result.podmanTitleHonest &&
    result.podmanNotRunning &&
    result.missionPillHonest &&
    result.composerOwned &&
    result.enginePort

  // Fake-online guard: present is OK; "running" text is not.
  if (result.podmanPhase === "present") {
    result.residuals.push("Podman binary present — chrome shows installed (not Stage 7 online counts)")
  }
  if (result.podmanPhase === "missing") {
    result.residuals.push("Podman missing on PATH — honest unavailable chrome")
  }
  if (result.podmanPhase === "probe-unavailable") {
    result.residuals.push("which() bridge unavailable — honest unknown (not invented online)")
  }
  result.residuals.push("Stage 7 runtime seam deferred")
  result.residuals.push("Stage 4 complete = NO until Ali acceptance re-gate")

  fs.mkdirSync(outDir, { recursive: true })
  fs.mkdirSync(boardEvidence, { recursive: true })

  const shot = await send("Page.captureScreenshot", { format: "png" })
  const png = Buffer.from(shot.result.data, "base64")
  const shotName = "117-stage4-4f-nav-podman.png"
  fs.writeFileSync(path.join(outDir, shotName), png)
  fs.writeFileSync(path.join(boardEvidence, `2026-10-20-${shotName}`), png)
  result.shot = shotName

  console.log("RESULT", JSON.stringify({ ok, ...result }, null, 2))
  exitCode = ok ? 0 : 1
} catch (err) {
  console.error("PROBE FAIL", err)
  exitCode = 1
} finally {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.close()
    console.log("ws.closed")
  }
  process.exit(exitCode)
}
