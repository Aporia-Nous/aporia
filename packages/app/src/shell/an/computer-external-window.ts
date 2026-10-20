// AP-BF-06: Edge/Chrome windowing — prefer tab in an existing window; spawn only if none running.
// Computer View / review stay in-app AnShell (no extra Electron window). Loopback CDP only.

import { normalizeExternalBrowserEndpoint } from "./computer-external"
import { AN_COMPUTER_CDP_RELAY, buildComputerCdpOpenTabUrl } from "./computer-screencast-relay"

export const AN_COMPUTER_EXTERNAL_WINDOW_SURFACE = {
  part: "computer-external-window",
  partAttr: 'data-an-part="computer-external-window"',
  /** Prefer CDP tab in the existing debug window. */
  preferExistingWindowTab: true,
  /** Spawn a new OS browser window only when no Edge/Chrome instance is running. */
  spawnOnlyWhenNoBrowser: true,
  /** Never invent Live; open-tab is consent chrome, not attach. */
  doesNotGrantLive: true,
  defaultWorkspaceUrl: "about:blank",
} as const

export type ExternalBrowserRunningFamily = "edge" | "chrome" | "chromium" | "unknown"

export type ExternalWindowDecision =
  | {
      action: "open-tab-existing"
      reason: "cdp-reachable"
      detail: string
    }
  | {
      action: "spawn-window"
      reason: "no-browser-running"
      detail: string
    }
  | {
      action: "refuse-second-window"
      reason: "browser-running-without-cdp"
      detail: string
    }

/**
 * Pure policy: reuse existing window → new tab; spawn only when no browser process.
 * When a browser is running but CDP is down, refuse a second window (honest residual).
 */
export function decideExternalBrowserWindowing(input: {
  cdpReachable: boolean
  browserProcessRunning: boolean
}): ExternalWindowDecision {
  if (input.cdpReachable) {
    return {
      action: "open-tab-existing",
      reason: "cdp-reachable",
      detail: "Debugging endpoint answered — open a tab in that existing Edge/Chrome window (not a second window).",
    }
  }
  if (input.browserProcessRunning) {
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

export type OpenExternalBrowserTabResult =
  | {
      ok: true
      decision: ExternalWindowDecision
      endpoint: string
      regionId: string
      url?: string
      title?: string
      spawned?: boolean
    }
  | { ok: false; error: string; decision?: ExternalWindowDecision }

export type OpenExternalBrowserTabOptions = {
  endpoint: string
  url?: string
  family?: string
  /** When true, relay may spawn if policy allows. Default true for consented open-tab. */
  allowSpawn?: boolean
  fetchImpl?: typeof fetch
  origin?: string
}

/** Ask the loopback CDP relay to open a tab (existing window) or spawn only as fallback. */
export async function openExternalBrowserTab(
  options: OpenExternalBrowserTabOptions,
): Promise<OpenExternalBrowserTabResult> {
  const ep = normalizeExternalBrowserEndpoint(options.endpoint)
  if (!ep.ok) return { ok: false, error: ep.error }
  const origin = options.origin ?? (typeof window !== "undefined" ? window.location.origin : "")
  const fetchImpl = options.fetchImpl ?? fetch
  const targetUrl = (options.url ?? AN_COMPUTER_EXTERNAL_WINDOW_SURFACE.defaultWorkspaceUrl).trim() || "about:blank"
  try {
    const res = await fetchImpl(buildComputerCdpOpenTabUrl(origin), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: ep.endpoint,
        url: targetUrl,
        family: options.family ?? "edge",
        allowSpawn: options.allowSpawn !== false,
      }),
      signal: AbortSignal.timeout(12_000),
    })
    const body = (await res.json()) as OpenExternalBrowserTabResult
    if (!res.ok || !body.ok) {
      return {
        ok: false,
        error: !body.ok && "error" in body ? body.error : `Open tab failed (HTTP ${res.status}).`,
        decision: body.decision,
      }
    }
    return body
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Open tab request failed.",
    }
  }
}

export function externalWindowDecisionCopy(decision: ExternalWindowDecision): string {
  return decision.detail
}

/** Expose relay path for tests / probes. */
export function computerExternalOpenTabRelayPath(): string {
  return AN_COMPUTER_CDP_RELAY.openTabPath
}
