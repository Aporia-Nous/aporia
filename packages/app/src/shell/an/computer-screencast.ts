// AP-BF-05: live CDP screencast / page pixels into Computer View.
// Consented loopback Edge/Chrome region only — never invent Live; never paint bot cursor into frames.

import { type ComputerAttachState, isComputerLive } from "./computer-attach"

export const AN_COMPUTER_SCREENCAST_SURFACE = {
  part: "computer-screencast",
  partAttr: 'data-an-part="computer-screencast"',
  framePart: "computer-screencast-frame",
  framePartAttr: 'data-an-part="computer-screencast-frame"',
  source: "cdp-screencast",
  /** Bot cursor stays Computer View chrome — never in CDP frames. */
  includeCursorInCapture: false,
  format: "jpeg",
  quality: 60,
  maxWidth: 1280,
  maxHeight: 720,
  everyNthFrame: 2,
} as const

export type ComputerScreencastPhase =
  | "idle"
  | "connecting"
  | "streaming"
  | "error"
  | "stopped"

export type ComputerPixelSource = "none" | "iframe" | "cdp-screencast"

export type ComputerScreencastState = {
  phase: ComputerScreencastPhase
  /** Real JPEG/PNG data URL from CDP — only when a frame arrived. */
  frameDataUrl?: string
  frameSessionId?: number
  frameCount: number
  source: "cdp-screencast" | "none"
  endpoint?: string
  regionId?: string
  targetUrl?: string
  targetTitle?: string
  error?: string
  includeCursorInCapture: false
}

export function clearedComputerScreencast(): ComputerScreencastState {
  return {
    phase: "idle",
    frameDataUrl: undefined,
    frameSessionId: undefined,
    frameCount: 0,
    source: "none",
    endpoint: undefined,
    regionId: undefined,
    targetUrl: undefined,
    targetTitle: undefined,
    error: undefined,
    includeCursorInCapture: false,
  }
}

export function clearComputerScreencast(_state?: ComputerScreencastState): ComputerScreencastState {
  return clearedComputerScreencast()
}

/** Screencast runs only for consented external Live with loopback endpoint + region. */
export function shouldStartComputerScreencast(attach: ComputerAttachState): boolean {
  if (!isComputerLive(attach)) return false
  if (attach.backend !== "external-chromium") return false
  return !!attach.externalEndpoint && !!attach.externalRegionId
}

/**
 * Local-browser Live uses the watch-only iframe as page pixels (BF-02).
 * External Live uses CDP screencast when streaming; otherwise no invented pixels.
 */
export function computerPixelSource(
  attach: ComputerAttachState,
  screencast: ComputerScreencastState,
  feedActive: boolean,
): ComputerPixelSource {
  if (!isComputerLive(attach) || !feedActive) return "none"
  if (screencast.phase === "streaming" && screencast.frameDataUrl) return "cdp-screencast"
  if (attach.backend === "local-browser") return "iframe"
  // External Live without a frame yet — connecting/error shows honest placeholder, not fake pixels.
  return "none"
}

export function isComputerScreencastStreaming(state: ComputerScreencastState): boolean {
  return state.phase === "streaming" && !!state.frameDataUrl && state.source === "cdp-screencast"
}

export function connectingComputerScreencast(
  endpoint: string,
  regionId: string,
): ComputerScreencastState {
  return {
    phase: "connecting",
    frameDataUrl: undefined,
    frameSessionId: undefined,
    frameCount: 0,
    source: "cdp-screencast",
    endpoint,
    regionId,
    includeCursorInCapture: false,
  }
}

export function applyComputerScreencastFrame(
  state: ComputerScreencastState,
  frame: { data: string; sessionId: number; mime?: "image/jpeg" | "image/png" },
): ComputerScreencastState {
  if (state.phase === "idle" || state.phase === "stopped") return state
  const mime = frame.mime ?? "image/jpeg"
  const dataUrl = frame.data.startsWith("data:") ? frame.data : `data:${mime};base64,${frame.data}`
  return {
    ...state,
    phase: "streaming",
    frameDataUrl: dataUrl,
    frameSessionId: frame.sessionId,
    frameCount: state.frameCount + 1,
    source: "cdp-screencast",
    error: undefined,
    includeCursorInCapture: false,
  }
}

export function failComputerScreencast(
  state: ComputerScreencastState,
  error: string,
): ComputerScreencastState {
  return {
    ...state,
    phase: "error",
    frameDataUrl: undefined,
    error,
    includeCursorInCapture: false,
  }
}

export function stopComputerScreencast(state: ComputerScreencastState): ComputerScreencastState {
  return {
    ...clearedComputerScreencast(),
    phase: "stopped",
    endpoint: state.endpoint,
    regionId: state.regionId,
  }
}

/** Sync screencast honesty to attach — disconnect/rescope clears pixels. */
export function syncComputerScreencast(
  screencast: ComputerScreencastState,
  attach: ComputerAttachState,
): ComputerScreencastState {
  if (!shouldStartComputerScreencast(attach)) return clearedComputerScreencast()
  if (
    screencast.endpoint === attach.externalEndpoint &&
    screencast.regionId === attach.externalRegionId &&
    (screencast.phase === "connecting" ||
      screencast.phase === "streaming" ||
      screencast.phase === "error")
  ) {
    return screencast
  }
  return connectingComputerScreencast(attach.externalEndpoint!, attach.externalRegionId!)
}

export function computerScreencastStatusCopy(state: ComputerScreencastState): string {
  switch (state.phase) {
    case "idle":
      return "No live page view yet."
    case "connecting":
      return "Connecting to the page you approved…"
    case "streaming":
      return "Live page view (watch only). The Bot cursor is a label on this panel — not drawn on the page."
    case "error":
      return state.error ?? "Could not show the live page view."
    case "stopped":
      return "Live page view stopped."
    default: {
      const _exhaustive: never = state.phase
      return _exhaustive
    }
  }
}
