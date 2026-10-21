/**
 * AP-BF-05/06 DEV relay: loopback CDP pixels + open-tab windowing for Computer View.
 * Electron renderer can fetch HTTP to Edge/Chrome debugging but WebSocket is blocked —
 * this Node middleware opens the CDP socket and returns JPEG bytes / opens tabs.
 * AP-BF-06: Prefer Target.createTarget({ newWindow: false }); spawn only if no browser.
 */
import { Buffer } from "node:buffer"
import { spawn } from "node:child_process"
import { accessSync, constants as fsConstants } from "node:fs"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import WebSocket from "ws"

const execFileAsync = promisify(execFile)

const FRAME_PATH = "/__an/computer-cdp/frame"
const NAVIGATE_PATH = "/__an/computer-cdp/navigate"
const OPEN_TAB_PATH = "/__an/computer-cdp/open-tab"
const USER_INTERACTION_PATH = "/__an/computer-cdp/user-interaction"

/** AP-STAGE5-07: sticky page listeners for user pointer/key/focus (consented CDP target). */
const INSTALL_USER_INTERACTION_JS = `(() => {
  const KEY = "__anUserTargetInteraction";
  const existing = window[KEY];
  if (existing && existing.installed) return { ok: true, already: true };
  const state = {
    installed: true,
    pointer: false,
    key: false,
    focusGain: false,
    lastFocus: !!(document.hasFocus && document.hasFocus()),
  };
  const mark = (field) => { state[field] = true; };
  window.addEventListener("pointerdown", () => mark("pointer"), true);
  window.addEventListener("keydown", () => mark("key"), true);
  const syncFocus = () => {
    const focused = !!(document.hasFocus && document.hasFocus());
    if (focused && !state.lastFocus) mark("focusGain");
    state.lastFocus = focused;
  };
  window.addEventListener("focus", syncFocus, true);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") syncFocus();
  });
  window[KEY] = state;
  return { ok: true, installed: true };
})()`

const POLL_USER_INTERACTION_JS = `(() => {
  const KEY = "__anUserTargetInteraction";
  const s = window[KEY];
  if (!s || !s.installed) return { ok: false, installed: false, hit: false, kinds: [] };
  const kinds = [];
  if (s.pointer) kinds.push("pointer");
  if (s.key) kinds.push("key");
  if (s.focusGain) kinds.push("focus");
  const hit = kinds.length > 0;
  s.pointer = false;
  s.key = false;
  s.focusGain = false;
  return { ok: true, installed: true, hit, kinds };
})()`

function normalizeEndpoint(input) {
  const raw = String(input || "").trim()
  if (!raw) return { ok: false, error: "Missing endpoint." }
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`
  let url
  try {
    url = new URL(withScheme)
  } catch {
    return { ok: false, error: "Endpoint could not be parsed." }
  }
  if (url.username || url.password) return { ok: false, error: "Endpoints with credentials are not supported." }
  if (url.protocol !== "http:") return { ok: false, error: "Only http:// loopback endpoints are supported." }
  const host = url.hostname.toLowerCase()
  if (host !== "127.0.0.1" && host !== "localhost") {
    return { ok: false, error: "External browser attach is local-only — use 127.0.0.1 or localhost." }
  }
  const port = url.port ? Number(url.port) : 80
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { ok: false, error: "Port must be an integer from 1 to 65535." }
  }
  const normalizedHost = host === "localhost" ? "localhost" : "127.0.0.1"
  return { ok: true, endpoint: `http://${normalizedHost}:${port}` }
}

function normalizeRegion(input) {
  const regionId = String(input || "").trim()
  if (!regionId) return { ok: false, error: "Missing region." }
  if (regionId.length > 128) return { ok: false, error: "Region id is too long." }
  if (!/^[A-Za-z0-9._:-]+$/.test(regionId)) {
    return { ok: false, error: "Region id may only use letters, digits, and . _ : -" }
  }
  return { ok: true, regionId }
}

function connectCdp(wsUrl, timeoutMs = 2500) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    let id = 0
    const pending = new Map()
    const timer = setTimeout(() => {
      try {
        ws.close()
      } catch {
        // ignore
      }
      reject(new Error("CDP connect timed out."))
    }, timeoutMs)

    const send = (method, params = {}) => {
      const msgId = ++id
      return new Promise((res, rej) => {
        pending.set(msgId, { res, rej })
        ws.send(JSON.stringify({ id: msgId, method, params }))
      })
    }

    ws.on("message", (data) => {
      let msg
      try {
        msg = JSON.parse(String(data))
      } catch {
        return
      }
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id)
        pending.delete(msg.id)
        p.res(msg)
      }
    })
    ws.on("open", () => {
      clearTimeout(timer)
      resolve({
        ws,
        send,
        close: () => {
          for (const [, p] of pending) p.rej(new Error("CDP closed."))
          pending.clear()
          try {
            ws.close()
          } catch {
            // ignore
          }
        },
      })
    })
    ws.on("error", (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })
}

async function resolveWsUrl(endpoint, regionId) {
  const listRes = await fetch(`${endpoint}/json/list`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(2500),
  })
  if (!listRes.ok) {
    return { ok: false, error: `No target list at ${endpoint} (HTTP ${listRes.status}).` }
  }
  const body = await listRes.json()
  if (!Array.isArray(body)) return { ok: false, error: "Debugging target list was not an array." }
  const target = body.find((t) => t && t.id === regionId)
  if (!target?.webSocketDebuggerUrl) {
    return { ok: false, error: `Region ${regionId} was not found on ${endpoint}.` }
  }
  if (!/^wss?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//i.test(target.webSocketDebuggerUrl)) {
    return { ok: false, error: "Debugging WebSocket must stay on loopback." }
  }
  return { ok: true, wsUrl: target.webSocketDebuggerUrl }
}

async function captureJpeg(endpoint, regionId) {
  const resolved = await resolveWsUrl(endpoint, regionId)
  if (!resolved.ok) return resolved
  const cdp = await connectCdp(resolved.wsUrl)
  try {
    await cdp.send("Page.enable")
    const shot = await cdp.send("Page.captureScreenshot", {
      format: "jpeg",
      quality: 60,
      fromSurface: true,
    })
    const data = shot.result?.data
    if (!data || typeof data !== "string") {
      return { ok: false, error: "Page.captureScreenshot returned no data." }
    }
    return { ok: true, jpeg: Buffer.from(data, "base64") }
  } finally {
    cdp.close()
  }
}

async function navigatePage(endpoint, regionId, url) {
  const resolved = await resolveWsUrl(endpoint, regionId)
  if (!resolved.ok) return resolved
  const cdp = await connectCdp(resolved.wsUrl)
  try {
    await cdp.send("Page.enable")
    const nav = await cdp.send("Page.navigate", { url })
    if (nav.error) return { ok: false, error: nav.error.message || "Page.navigate failed." }
    return { ok: true }
  } finally {
    cdp.close()
  }
}

/** AP-STAGE5-07: ensure page listeners, then read+clear user interaction flags. */
async function pollUserInteraction(endpoint, regionId) {
  const resolved = await resolveWsUrl(endpoint, regionId)
  if (!resolved.ok) return resolved
  const cdp = await connectCdp(resolved.wsUrl)
  try {
    await cdp.send("Runtime.enable")
    const installed = await cdp.send("Runtime.evaluate", {
      expression: INSTALL_USER_INTERACTION_JS,
      returnByValue: true,
    })
    if (installed.error) {
      return { ok: false, error: installed.error.message || "Runtime.evaluate install failed." }
    }
    const polled = await cdp.send("Runtime.evaluate", {
      expression: POLL_USER_INTERACTION_JS,
      returnByValue: true,
    })
    if (polled.error) {
      return { ok: false, error: polled.error.message || "Runtime.evaluate poll failed." }
    }
    const value = polled.result?.result?.value
    if (!value || typeof value !== "object") {
      return { ok: false, error: "User-interaction poll returned no value." }
    }
    const kinds = Array.isArray(value.kinds)
      ? value.kinds.filter((k) => k === "pointer" || k === "key" || k === "focus")
      : []
    return {
      ok: true,
      installed: value.installed === true || value.ok === true,
      hit: value.hit === true && kinds.length > 0,
      kinds,
    }
  } finally {
    cdp.close()
  }
}

function normalizeNavigateUrl(input) {
  const raw = String(input || "").trim() || "about:blank"
  if (raw === "about:blank") return { ok: true, url: "about:blank" }
  if (!/^https?:\/\//i.test(raw)) {
    return { ok: false, error: "Only http(s) or about:blank open-tab targets." }
  }
  try {
    const u = new URL(raw)
    if (u.username || u.password) return { ok: false, error: "URLs with credentials are not supported." }
    return { ok: true, url: u.href }
  } catch {
    return { ok: false, error: "URL could not be parsed." }
  }
}

async function probeCdp(endpoint) {
  try {
    const res = await fetch(`${endpoint}/json/version`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(2000),
    })
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    const body = await res.json()
    const wsUrl = typeof body.webSocketDebuggerUrl === "string" ? body.webSocketDebuggerUrl : ""
    if (!/^wss?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//i.test(wsUrl)) {
      return { ok: false, error: "Browser WebSocket must stay on loopback." }
    }
    return { ok: true, wsUrl, browser: typeof body.Browser === "string" ? body.Browser : undefined }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "probe failed" }
  }
}

async function detectBrowserProcessRunning(family = "edge") {
  if (process.platform !== "win32") {
    // Non-Windows DEV: treat unknown as not running so spawn path stays available in CI stubs.
    return { running: false, family: "unknown" }
  }
  const names =
    family === "chrome" || family === "chromium"
      ? ["chrome.exe", "chromium.exe"]
      : ["msedge.exe", "msedgewebview2.exe"]
  try {
    const { stdout } = await execFileAsync("tasklist", ["/FO", "CSV", "/NH"], {
      windowsHide: true,
      timeout: 4000,
      maxBuffer: 2_000_000,
    })
    const lower = String(stdout).toLowerCase()
    const running = names.some((n) => lower.includes(n.toLowerCase()))
    return { running, family: running ? family : "unknown" }
  } catch {
    return { running: false, family: "unknown" }
  }
}

function decideWindowing(cdpReachable, browserProcessRunning) {
  if (cdpReachable) {
    return {
      action: "open-tab-existing",
      reason: "cdp-reachable",
      detail: "Debugging endpoint answered — open a tab in that existing Edge/Chrome window (not a second window).",
    }
  }
  if (browserProcessRunning) {
    return {
      action: "refuse-second-window",
      reason: "browser-running-without-cdp",
      detail:
        "Edge/Chrome is already open without a loopback debugging port. Will not spawn a second window — restart that browser with remote debugging for Aporetic, or attach an existing debug endpoint.",
    }
  }
  return {
    action: "spawn-window",
    reason: "no-browser-running",
    detail: "No Edge/Chrome process detected — spawning one window with local debugging is allowed.",
  }
}

function browserExeCandidates(family) {
  if (family === "chrome") {
    return [
      process.env.AN_CHROME_PATH,
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    ].filter(Boolean)
  }
  if (family === "chromium") {
    return [process.env.AN_CHROMIUM_PATH, "C:\\Program Files\\Chromium\\Application\\chrome.exe"].filter(Boolean)
  }
  return [
    process.env.AN_EDGE_PATH,
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ].filter(Boolean)
}

function resolveBrowserExe(family) {
  for (const candidate of browserExeCandidates(family)) {
    try {
      accessSync(candidate, fsConstants.X_OK)
      return candidate
    } catch {
      try {
        accessSync(candidate, fsConstants.R_OK)
        return candidate
      } catch {
        // try next
      }
    }
  }
  return null
}

async function createTargetTab(browserWsUrl, url) {
  const cdp = await connectCdp(browserWsUrl, 4000)
  try {
    const created = await cdp.send("Target.createTarget", { url, newWindow: false })
    if (created.error) {
      return { ok: false, error: created.error.message || "Target.createTarget failed." }
    }
    const targetId = created.result?.targetId
    if (!targetId || typeof targetId !== "string") {
      return { ok: false, error: "Target.createTarget returned no targetId." }
    }
    return { ok: true, regionId: targetId }
  } finally {
    cdp.close()
  }
}

async function waitForCdp(endpoint, attempts = 20, delayMs = 250) {
  for (let i = 0; i < attempts; i++) {
    const probe = await probeCdp(endpoint)
    if (probe.ok) return probe
    await new Promise((r) => setTimeout(r, delayMs))
  }
  return { ok: false, error: `Debugging endpoint ${endpoint} did not come up after spawn.` }
}

async function spawnBrowserWithDebug(family, endpoint, url) {
  const ep = normalizeEndpoint(endpoint)
  if (!ep.ok) return ep
  const exe = resolveBrowserExe(family)
  if (!exe) {
    return { ok: false, error: `Could not find a local ${family} executable to spawn.` }
  }
  // No --new-window: one window is the fallback when nothing is running.
  const args = [`--remote-debugging-port=${ep.port}`, "--remote-allow-origins=*", url]
  try {
    const child = spawn(exe, args, {
      detached: true,
      stdio: "ignore",
      windowsHide: false,
    })
    child.unref()
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Spawn failed." }
  }
  const probe = await waitForCdp(ep.endpoint)
  if (!probe.ok) return probe
  return { ok: true, endpoint: ep.endpoint, wsUrl: probe.wsUrl, spawned: true }
}

async function openTabInBrowser({ endpoint, url, family, allowSpawn }) {
  const ep = normalizeEndpoint(endpoint)
  if (!ep.ok) return { ok: false, error: ep.error }
  const target = normalizeNavigateUrl(url)
  if (!target.ok) return { ok: false, error: target.error }
  const fam = ["edge", "chrome", "chromium"].includes(family) ? family : "edge"

  const processState = await detectBrowserProcessRunning(fam)
  let probe = await probeCdp(ep.endpoint)
  let decision = decideWindowing(probe.ok, processState.running)
  let spawned = false

  if (decision.action === "refuse-second-window") {
    return { ok: false, error: decision.detail, decision }
  }

  if (decision.action === "spawn-window") {
    if (allowSpawn === false) {
      return {
        ok: false,
        error: "No debugging browser on that endpoint, and spawn was not allowed.",
        decision,
      }
    }
    const spawnedRes = await spawnBrowserWithDebug(fam, ep.endpoint, target.url)
    if (!spawnedRes.ok) return { ok: false, error: spawnedRes.error, decision }
    spawned = true
    probe = { ok: true, wsUrl: spawnedRes.wsUrl }
    decision = {
      action: "spawn-window",
      reason: "no-browser-running",
      detail: "Spawned one Edge/Chrome window (none was running) and opened the workspace tab.",
    }
  }

  if (!probe.ok || !probe.wsUrl) {
    return { ok: false, error: probe.error || "No browser WebSocket.", decision }
  }

  const created = await createTargetTab(probe.wsUrl, target.url)
  if (!created.ok) return { ok: false, error: created.error, decision }

  if (!spawned) {
    decision = {
      action: "open-tab-existing",
      reason: "cdp-reachable",
      detail: "Opened a tab in the existing Edge/Chrome window via CDP (newWindow:false).",
    }
  }

  return {
    ok: true,
    decision,
    endpoint: ep.endpoint,
    regionId: created.regionId,
    url: target.url,
    spawned,
  }
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on("data", (c) => chunks.push(c))
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"))
      } catch (err) {
        reject(err)
      }
    })
    req.on("error", reject)
  })
}

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")
}

/** @returns {import("vite").Plugin} */
export function computerCdpRelayPlugin() {
  return {
    name: "aporetic-an:computer-cdp-relay",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        try {
          const url = new URL(req.url || "/", "http://127.0.0.1")
          if (
            (url.pathname === FRAME_PATH ||
              url.pathname === NAVIGATE_PATH ||
              url.pathname === OPEN_TAB_PATH ||
              url.pathname === USER_INTERACTION_PATH) &&
            req.method === "OPTIONS"
          ) {
            setCors(res)
            res.statusCode = 204
            res.end()
            return
          }
          if (url.pathname === FRAME_PATH && req.method === "GET") {
            setCors(res)
            const ep = normalizeEndpoint(url.searchParams.get("endpoint"))
            if (!ep.ok) {
              res.statusCode = 400
              res.setHeader("Content-Type", "application/json")
              res.end(JSON.stringify({ ok: false, error: ep.error }))
              return
            }
            const region = normalizeRegion(url.searchParams.get("region"))
            if (!region.ok) {
              res.statusCode = 400
              res.setHeader("Content-Type", "application/json")
              res.end(JSON.stringify({ ok: false, error: region.error }))
              return
            }
            const frame = await captureJpeg(ep.endpoint, region.regionId)
            if (!frame.ok) {
              res.statusCode = 502
              res.setHeader("Content-Type", "application/json")
              res.end(JSON.stringify({ ok: false, error: frame.error }))
              return
            }
            res.statusCode = 200
            res.setHeader("Content-Type", "image/jpeg")
            res.setHeader("Cache-Control", "no-store")
            res.end(frame.jpeg)
            return
          }
          if (url.pathname === NAVIGATE_PATH && req.method === "POST") {
            setCors(res)
            const body = await readJson(req)
            const ep = normalizeEndpoint(body.endpoint)
            if (!ep.ok) {
              res.statusCode = 400
              res.setHeader("Content-Type", "application/json")
              res.end(JSON.stringify({ ok: false, error: ep.error }))
              return
            }
            const region = normalizeRegion(body.region)
            if (!region.ok) {
              res.statusCode = 400
              res.setHeader("Content-Type", "application/json")
              res.end(JSON.stringify({ ok: false, error: region.error }))
              return
            }
            const targetUrl = String(body.url || "").trim()
            if (!/^https?:\/\//i.test(targetUrl) && targetUrl !== "about:blank") {
              res.statusCode = 400
              res.setHeader("Content-Type", "application/json")
              res.end(JSON.stringify({ ok: false, error: "Only http(s) or about:blank navigate targets." }))
              return
            }
            const nav = await navigatePage(ep.endpoint, region.regionId, targetUrl)
            res.statusCode = nav.ok ? 200 : 502
            res.setHeader("Content-Type", "application/json")
            res.end(JSON.stringify(nav))
            return
          }
          if (url.pathname === OPEN_TAB_PATH && req.method === "POST") {
            setCors(res)
            const body = await readJson(req)
            const opened = await openTabInBrowser({
              endpoint: body.endpoint,
              url: body.url,
              family: body.family,
              allowSpawn: body.allowSpawn !== false,
            })
            res.statusCode = opened.ok ? 200 : opened.decision?.action === "refuse-second-window" ? 409 : 502
            res.setHeader("Content-Type", "application/json")
            res.end(JSON.stringify(opened))
            return
          }
          if (url.pathname === USER_INTERACTION_PATH && req.method === "GET") {
            setCors(res)
            const ep = normalizeEndpoint(url.searchParams.get("endpoint"))
            if (!ep.ok) {
              res.statusCode = 400
              res.setHeader("Content-Type", "application/json")
              res.end(JSON.stringify({ ok: false, error: ep.error }))
              return
            }
            const region = normalizeRegion(url.searchParams.get("region"))
            if (!region.ok) {
              res.statusCode = 400
              res.setHeader("Content-Type", "application/json")
              res.end(JSON.stringify({ ok: false, error: region.error }))
              return
            }
            const probe = await pollUserInteraction(ep.endpoint, region.regionId)
            res.statusCode = probe.ok ? 200 : 502
            res.setHeader("Content-Type", "application/json")
            res.setHeader("Cache-Control", "no-store")
            res.end(JSON.stringify(probe))
            return
          }
        } catch (err) {
          setCors(res)
          res.statusCode = 500
          res.setHeader("Content-Type", "application/json")
          res.end(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : "Relay error." }))
          return
        }
        next()
      })
    },
  }
}
