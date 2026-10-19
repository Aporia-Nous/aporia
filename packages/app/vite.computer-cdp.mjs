/**
 * AP-BF-05 DEV relay: loopback-only CDP Page.captureScreenshot for Computer View.
 * Electron renderer can fetch HTTP to Edge/Chrome debugging but WebSocket is blocked —
 * this Node middleware opens the CDP socket and returns JPEG bytes.
 */
import { Buffer } from "node:buffer"
import WebSocket from "ws"

const FRAME_PATH = "/__an/computer-cdp/frame"
const NAVIGATE_PATH = "/__an/computer-cdp/navigate"

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
            (url.pathname === FRAME_PATH || url.pathname === NAVIGATE_PATH) &&
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
