// AP-BF-05: consented loopback CDP client for Computer View screencast.
// Product path only — user-launched Edge/Chrome debugging they chose. No remote hosts.
// Electron: renderer WebSocket to CDP is blocked → fall back to DEV HTTP relay (captureScreenshot poll).

import { normalizeExternalBrowserEndpoint, normalizeExternalBrowserRegion } from "./computer-external"
import {
  parseCdpPageInteractionProbe,
  type CdpPageInteractionProbe,
} from "./computer-os-pointer-pause"
import { AN_COMPUTER_SCREENCAST_SURFACE } from "./computer-screencast"
import {
  AN_COMPUTER_CDP_RELAY,
  buildComputerCdpFrameUrl,
  buildComputerCdpNavigateUrl,
  buildComputerCdpUserInteractionUrl,
} from "./computer-screencast-relay"

export type ExternalBrowserTarget = {
  id: string
  type: string
  title?: string
  url?: string
  webSocketDebuggerUrl?: string
}

export type ResolveExternalTargetResult =
  | {
      ok: true
      endpoint: string
      regionId: string
      wsUrl: string
      title?: string
      url?: string
    }
  | { ok: false; error: string }

export type ComputerScreencastFrame = {
  data: string
  sessionId: number
  mime: "image/jpeg" | "image/png"
}

export type ComputerScreencastSession = {
  stop: () => void
  navigate: (url: string) => Promise<{ ok: true } | { ok: false; error: string }>
}

export type StartComputerScreencastOptions = {
  endpoint: string
  regionId: string
  onFrame: (frame: ComputerScreencastFrame) => void
  onError: (error: string) => void
  onStatus?: (status: "connecting" | "streaming" | "stopped") => void
  /** AP-STAGE5-07: external page user pointer/key/focus (relay poll). */
  onUserTargetInteraction?: (probe: CdpPageInteractionProbe) => void
  fetchImpl?: typeof fetch
  WebSocketImpl?: typeof WebSocket
  maxWidth?: number
  maxHeight?: number
  quality?: number
  everyNthFrame?: number
  /** Prefer HTTP relay poll (Electron). Default: try WebSocket then fall back. */
  preferRelay?: boolean
  relayOrigin?: string
}

type CdpPending = {
  resolve: (value: { result?: unknown; error?: { message?: string } }) => void
  reject: (reason?: unknown) => void
}

/**
 * List CDP targets at a consented loopback endpoint (`/json/list`).
 * Never probes non-loopback — normalize rejects remote hosts first.
 */
export async function listExternalBrowserTargets(
  input: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; endpoint: string; targets: ExternalBrowserTarget[] } | { ok: false; error: string }> {
  const normalized = normalizeExternalBrowserEndpoint(input)
  if (!normalized.ok) return normalized
  const listUrl = `${normalized.endpoint}/json/list`
  try {
    const res = await fetchImpl(listUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(2500),
    })
    if (!res.ok) {
      return {
        ok: false,
        error: `No target list at ${normalized.endpoint} (HTTP ${res.status}). Launch Edge/Chrome with remote debugging for Aporetic, then retry.`,
      }
    }
    const body = (await res.json()) as unknown
    if (!Array.isArray(body)) {
      return { ok: false, error: "Debugging target list was not an array." }
    }
    const targets: ExternalBrowserTarget[] = body
      .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
      .map((item) => ({
        id: typeof item.id === "string" ? item.id : "",
        type: typeof item.type === "string" ? item.type : "",
        title: typeof item.title === "string" ? item.title : undefined,
        url: typeof item.url === "string" ? item.url : undefined,
        webSocketDebuggerUrl:
          typeof item.webSocketDebuggerUrl === "string" ? item.webSocketDebuggerUrl : undefined,
      }))
      .filter((t) => !!t.id)
    return { ok: true, endpoint: normalized.endpoint, targets }
  } catch {
    return {
      ok: false,
      error: `Could not list targets at ${normalized.endpoint}. Start your Edge/Chrome with a local debugging port you choose, then retry.`,
    }
  }
}

/** Resolve one consented region id to its page WebSocket debugger URL (loopback only). */
export async function resolveExternalTargetWsUrl(
  endpointInput: string,
  regionInput: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ResolveExternalTargetResult> {
  const region = normalizeExternalBrowserRegion(regionInput)
  if (!region.ok) return region
  const listed = await listExternalBrowserTargets(endpointInput, fetchImpl)
  if (!listed.ok) return listed
  const target = listed.targets.find((t) => t.id === region.regionId)
  if (!target) {
    return {
      ok: false,
      error: `Region ${region.regionId} was not found on ${listed.endpoint}. Pick an id from your browser’s debugging target list.`,
    }
  }
  if (!target.webSocketDebuggerUrl) {
    return {
      ok: false,
      error: `Region ${region.regionId} has no WebSocket debugger URL. Choose a page/tab target.`,
    }
  }
  if (!/^wss?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//i.test(target.webSocketDebuggerUrl)) {
    return {
      ok: false,
      error: "Debugging WebSocket must stay on loopback (127.0.0.1 / localhost).",
    }
  }
  return {
    ok: true,
    endpoint: listed.endpoint,
    regionId: region.regionId,
    wsUrl: target.webSocketDebuggerUrl,
    title: target.title,
    url: target.url,
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const chunk = 0x8000
  let binary = ""
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

/** HTTP poll of Vite/DEV loopback relay — real Page.captureScreenshot pixels. */
function startRelayPollSession(options: StartComputerScreencastOptions): ComputerScreencastSession {
  const fetchImpl = options.fetchImpl ?? fetch
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let interactionTimer: ReturnType<typeof setTimeout> | undefined
  let frameSessionId = 0
  const origin = options.relayOrigin ?? (typeof window !== "undefined" ? window.location.origin : "")
  const frameUrl = buildComputerCdpFrameUrl(options.endpoint, options.regionId, origin)
  const interactionUrl = buildComputerCdpUserInteractionUrl(options.endpoint, options.regionId, origin)
  if (!frameUrl.ok) {
    options.onError(frameUrl.error)
    return {
      stop: () => {
        stopped = true
      },
      navigate: async () => ({ ok: false, error: frameUrl.error }),
    }
  }

  const tickInteraction = async () => {
    if (stopped || !options.onUserTargetInteraction || !interactionUrl.ok) return
    try {
      const res = await fetchImpl(interactionUrl.url, {
        method: "GET",
        signal: AbortSignal.timeout(4000),
      })
      if (stopped) return
      if (res.ok) {
        const body = (await res.json()) as unknown
        const probe = parseCdpPageInteractionProbe(body)
        if (probe.hit) options.onUserTargetInteraction(probe)
      }
    } catch {
      // Soft-fail — pixel stream remains primary; interaction poll is best-effort.
    }
    if (!stopped) {
      interactionTimer = setTimeout(() => {
        void tickInteraction()
      }, AN_COMPUTER_CDP_RELAY.userInteractionPollMs)
    }
  }

  const tick = async () => {
    if (stopped) return
    try {
      const res = await fetchImpl(frameUrl.url, {
        method: "GET",
        signal: AbortSignal.timeout(4000),
      })
      if (stopped) return
      if (!res.ok) {
        let detail = `HTTP ${res.status}`
        try {
          const body = (await res.json()) as { error?: string }
          if (body?.error) detail = body.error
        } catch {
          // ignore
        }
        options.onError(`CDP pixel relay failed: ${detail}`)
        return
      }
      const buf = await res.arrayBuffer()
      if (stopped) return
      if (buf.byteLength < 32) {
        options.onError("CDP pixel relay returned an empty frame.")
        return
      }
      frameSessionId += 1
      options.onFrame({
        data: arrayBufferToBase64(buf),
        sessionId: frameSessionId,
        mime: "image/jpeg",
      })
      options.onStatus?.("streaming")
    } catch (err) {
      if (!stopped) {
        options.onError(err instanceof Error ? err.message : "CDP pixel relay failed.")
      }
      return
    }
    if (!stopped) {
      timer = setTimeout(() => {
        void tick()
      }, AN_COMPUTER_CDP_RELAY.pollMs)
    }
  }

  options.onStatus?.("connecting")
  void tick()
  if (options.onUserTargetInteraction && interactionUrl.ok) {
    void tickInteraction()
  }

  return {
    stop: () => {
      if (stopped) return
      stopped = true
      if (timer) clearTimeout(timer)
      if (interactionTimer) clearTimeout(interactionTimer)
      options.onStatus?.("stopped")
    },
    navigate: async (url: string) => {
      if (stopped) return { ok: false, error: "CDP screencast is not connected." }
      try {
        const res = await fetchImpl(buildComputerCdpNavigateUrl(origin), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            endpoint: options.endpoint,
            region: options.regionId,
            url,
          }),
          signal: AbortSignal.timeout(4000),
        })
        const body = (await res.json()) as { ok?: boolean; error?: string }
        if (!res.ok || !body.ok) {
          return { ok: false, error: body.error ?? `Navigate failed (HTTP ${res.status}).` }
        }
        return { ok: true }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "Navigate failed." }
      }
    },
  }
}

/**
 * Open Page.startScreencast when renderer WebSocket works; otherwise poll the loopback HTTP relay
 * (Vite DEV / Node captureScreenshot). Caller must already have BF-01/04 Live attach.
 */
export function startComputerScreencastSession(
  options: StartComputerScreencastOptions,
): ComputerScreencastSession {
  if (options.preferRelay) {
    return startRelayPollSession(options)
  }

  const WebSocketImpl = options.WebSocketImpl ?? WebSocket
  const fetchImpl = options.fetchImpl ?? fetch
  let ws: WebSocket | null = null
  let nextId = 0
  const pending = new Map<number, CdpPending>()
  let stopped = false
  let relayFallback: ComputerScreencastSession | null = null
  let usingRelay = false

  const stop = () => {
    if (stopped) return
    stopped = true
    options.onStatus?.("stopped")
    if (relayFallback) {
      relayFallback.stop()
      relayFallback = null
    }
    try {
      if (ws && ws.readyState === WebSocket.OPEN) {
        const id = ++nextId
        ws.send(JSON.stringify({ id, method: "Page.stopScreencast", params: {} }))
      }
    } catch {
      // ignore
    }
    for (const [, p] of pending) p.reject(new Error("CDP screencast stopped."))
    pending.clear()
    if (ws) {
      try {
        ws.close()
      } catch {
        // ignore
      }
    }
    ws = null
  }

  const navigate = async (url: string): Promise<{ ok: true } | { ok: false; error: string }> => {
    if (relayFallback) return relayFallback.navigate(url)
    if (stopped || !ws || ws.readyState !== WebSocket.OPEN) {
      return { ok: false, error: "CDP screencast is not connected." }
    }
    try {
      const id = ++nextId
      const res = await new Promise<{ result?: unknown; error?: { message?: string } }>((resolve, reject) => {
        pending.set(id, { resolve, reject })
        ws!.send(JSON.stringify({ id, method: "Page.navigate", params: { url } }))
      })
      if (res.error) {
        return { ok: false, error: res.error.message ?? "Page.navigate failed." }
      }
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Page.navigate failed." }
    }
  }

  const fallBackToRelay = () => {
    if (stopped || usingRelay) return
    usingRelay = true
    if (ws) {
      try {
        ws.close()
      } catch {
        // ignore
      }
      ws = null
    }
    relayFallback = startRelayPollSession(options)
  }

  void (async () => {
    options.onStatus?.("connecting")
    const resolved = await resolveExternalTargetWsUrl(options.endpoint, options.regionId, fetchImpl)
    if (stopped) return
    if (!resolved.ok) {
      // Still try relay — list may work via Node even when WS resolve path differs.
      fallBackToRelay()
      return
    }

    let opened = false
    try {
      ws = new WebSocketImpl(resolved.wsUrl)
    } catch {
      fallBackToRelay()
      return
    }

    const send = (method: string, params?: Record<string, unknown>) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        return Promise.reject(new Error("CDP WebSocket is not open."))
      }
      const id = ++nextId
      return new Promise<{ result?: unknown; error?: { message?: string } }>((resolve, reject) => {
        pending.set(id, { resolve, reject })
        ws!.send(JSON.stringify({ id, method, params }))
      })
    }

    ws.addEventListener("message", (event) => {
      if (stopped || usingRelay) return
      let msg: {
        id?: number
        method?: string
        params?: {
          data?: string
          sessionId?: number
        }
        result?: unknown
        error?: { message?: string }
      }
      try {
        msg = JSON.parse(String(event.data))
      } catch {
        return
      }
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id)!
        pending.delete(msg.id)
        p.resolve({ result: msg.result, error: msg.error })
        return
      }
      if (msg.method === "Page.screencastFrame" && msg.params?.data && typeof msg.params.sessionId === "number") {
        options.onFrame({
          data: msg.params.data,
          sessionId: msg.params.sessionId,
          mime: "image/jpeg",
        })
        options.onStatus?.("streaming")
        void send("Page.screencastFrameAck", { sessionId: msg.params.sessionId }).catch(() => undefined)
      }
    })

    ws.addEventListener("error", () => {
      if (!opened && !stopped) fallBackToRelay()
    })

    ws.addEventListener("close", () => {
      if (!opened && !stopped && !usingRelay) fallBackToRelay()
    })

    const openResult = await new Promise<"open" | "fail">((resolve) => {
      const t = setTimeout(() => resolve("fail"), 1500)
      ws!.addEventListener(
        "open",
        () => {
          clearTimeout(t)
          resolve("open")
        },
        { once: true },
      )
      ws!.addEventListener(
        "error",
        () => {
          clearTimeout(t)
          resolve("fail")
        },
        { once: true },
      )
    })

    if (stopped) return
    if (openResult !== "open" || !ws || ws.readyState !== WebSocket.OPEN) {
      fallBackToRelay()
      return
    }
    opened = true

    try {
      await send("Page.enable")
      const start = await send("Page.startScreencast", {
        format: AN_COMPUTER_SCREENCAST_SURFACE.format,
        quality: options.quality ?? AN_COMPUTER_SCREENCAST_SURFACE.quality,
        maxWidth: options.maxWidth ?? AN_COMPUTER_SCREENCAST_SURFACE.maxWidth,
        maxHeight: options.maxHeight ?? AN_COMPUTER_SCREENCAST_SURFACE.maxHeight,
        everyNthFrame: options.everyNthFrame ?? AN_COMPUTER_SCREENCAST_SURFACE.everyNthFrame,
      })
      if (start.error) {
        fallBackToRelay()
      }
    } catch {
      fallBackToRelay()
    }
  })()

  return {
    stop,
    navigate,
  }
}
