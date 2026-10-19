// AP-BF-01/04: consent/attach for browser-first Computer View (honest computerLive).
// BF-01: Aporetic local Chromium workspace. BF-04: user-launched Edge/Chrome region (loopback).
// Never invent Live, never default to VM, never attach remote hosts.

import {
  AN_COMPUTER_EXTERNAL_SURFACE,
  externalAttachConsentCopy,
  externalBrowserFamilyLabel,
  isExternalBrowserFamily,
  normalizeExternalBrowserEndpoint,
  normalizeExternalBrowserRegion,
  type ExternalBrowserFamily,
} from "./computer-external"

export const AN_COMPUTER_ATTACH_SURFACE = {
  part: "computer-attach",
  partAttr: 'data-an-part="computer-attach"',
  backend: "local-browser",
  /** Default path label; Live panel also reads path-specific labels. */
  pathLabel: "Local browser workspace (Edge/Chrome)",
  externalPathLabel: AN_COMPUTER_EXTERNAL_SURFACE.pathLabel,
  cursorLabel: "Bot cursor",
  liveOnlyWhenAttached: true,
  paths: ["local-browser", "external-chromium"] as const,
} as const

export type ComputerAttachPhase = "disconnected" | "consenting" | "attached"

export type ComputerAttachBackend = "local-browser" | "external-chromium"

export type ComputerAttachPath = ComputerAttachBackend

export type ComputerAttachState = {
  phase: ComputerAttachPhase
  /** Explicit user consent for this session attach. */
  consented: boolean
  /** Selected attach path (local workspace vs user-launched Edge/Chrome). */
  path: ComputerAttachPath
  backend: ComputerAttachBackend
  /** Session id when attach is scoped; undefined on home/draft. */
  sessionID?: string
  /** Last error shown honestly in the panel (no secrets). */
  error?: string
  /** BF-04: normalized loopback endpoint when external path is Live. */
  externalEndpoint?: string
  /** BF-04: consented CDP target / region id. */
  externalRegionId?: string
  /** BF-04: Edge / Chrome / Chromium family the user chose. */
  externalFamily?: ExternalBrowserFamily
  /** Consent drafts for external path (cleared on disconnect). */
  externalDraftEndpoint?: string
  externalDraftRegion?: string
  externalDraftFamily?: ExternalBrowserFamily
}

export function initialComputerAttachState(sessionID?: string): ComputerAttachState {
  return {
    phase: "disconnected",
    consented: false,
    path: "local-browser",
    backend: "local-browser",
    sessionID,
    externalDraftEndpoint: AN_COMPUTER_EXTERNAL_SURFACE.defaultEndpointHint,
    externalDraftFamily: "edge",
  }
}

function hasExternalRegion(state: ComputerAttachState): boolean {
  return !!state.externalEndpoint && !!state.externalRegionId && !!state.externalFamily
}

/** Live only when user consented and attach phase is attached on a supported local path. */
export function isComputerLive(state: ComputerAttachState): boolean {
  if (state.phase !== "attached" || state.consented !== true || !!state.error) return false
  if (state.backend === "local-browser") return state.path === "local-browser"
  if (state.backend === "external-chromium") {
    return state.path === "external-chromium" && hasExternalRegion(state)
  }
  return false
}

/** Labeled cursor affordance is UI-only overlay — never in agent captures (BF-02 page feed is separate). */
export function isComputerCursorVisible(state: ComputerAttachState): boolean {
  return isComputerLive(state)
}

export function computerAttachPathLabel(state: ComputerAttachState): string {
  if (state.path === "external-chromium" || state.backend === "external-chromium") {
    if (state.externalFamily) {
      return `${externalBrowserFamilyLabel(state.externalFamily)} · consented region`
    }
    return AN_COMPUTER_ATTACH_SURFACE.externalPathLabel
  }
  return AN_COMPUTER_ATTACH_SURFACE.pathLabel
}

export function beginComputerConsent(state: ComputerAttachState): ComputerAttachState {
  if (!state.sessionID) {
    return {
      ...state,
      phase: "disconnected",
      consented: false,
      error: "Open a session before connecting Computer View.",
    }
  }
  return {
    ...state,
    phase: "consenting",
    consented: false,
    error: undefined,
    externalDraftEndpoint: state.externalDraftEndpoint ?? AN_COMPUTER_EXTERNAL_SURFACE.defaultEndpointHint,
    externalDraftFamily: state.externalDraftFamily ?? "edge",
  }
}

export function selectComputerAttachPath(
  state: ComputerAttachState,
  path: ComputerAttachPath,
): ComputerAttachState {
  if (state.phase !== "consenting" && state.phase !== "disconnected") return state
  if (path !== "local-browser" && path !== "external-chromium") return state
  return {
    ...state,
    path,
    error: undefined,
  }
}

export function setExternalAttachDraft(
  state: ComputerAttachState,
  draft: {
    endpoint?: string
    region?: string
    family?: string
  },
): ComputerAttachState {
  if (state.phase !== "consenting" && state.phase !== "disconnected") return state
  const next: ComputerAttachState = { ...state, error: undefined }
  if (draft.endpoint !== undefined) next.externalDraftEndpoint = draft.endpoint
  if (draft.region !== undefined) next.externalDraftRegion = draft.region
  if (draft.family !== undefined) {
    if (!isExternalBrowserFamily(draft.family)) {
      return { ...state, error: "Choose Edge, Chrome, or Chromium." }
    }
    next.externalDraftFamily = draft.family
  }
  return next
}

export function confirmComputerAttach(state: ComputerAttachState): ComputerAttachState {
  if (!state.sessionID) {
    return {
      ...state,
      phase: "disconnected",
      consented: false,
      error: "Open a session before connecting Computer View.",
    }
  }
  if (state.phase !== "consenting" && state.phase !== "disconnected") {
    return state
  }

  if (state.path === "external-chromium") {
    const family = state.externalDraftFamily ?? "edge"
    if (!isExternalBrowserFamily(family)) {
      return { ...state, phase: "consenting", consented: false, error: "Choose Edge, Chrome, or Chromium." }
    }
    const endpoint = normalizeExternalBrowserEndpoint(state.externalDraftEndpoint ?? "")
    if (!endpoint.ok) {
      return { ...state, phase: "consenting", consented: false, error: endpoint.error }
    }
    const region = normalizeExternalBrowserRegion(state.externalDraftRegion ?? "")
    if (!region.ok) {
      return { ...state, phase: "consenting", consented: false, error: region.error }
    }
    return {
      ...state,
      phase: "attached",
      consented: true,
      path: "external-chromium",
      backend: "external-chromium",
      externalEndpoint: endpoint.endpoint,
      externalRegionId: region.regionId,
      externalFamily: family,
      error: undefined,
    }
  }

  return {
    ...state,
    phase: "attached",
    consented: true,
    path: "local-browser",
    backend: "local-browser",
    externalEndpoint: undefined,
    externalRegionId: undefined,
    externalFamily: undefined,
    error: undefined,
  }
}

export function cancelComputerConsent(state: ComputerAttachState): ComputerAttachState {
  if (state.phase !== "consenting") return state
  return {
    ...state,
    phase: "disconnected",
    consented: false,
    error: undefined,
  }
}

export function disconnectComputerAttach(state: ComputerAttachState): ComputerAttachState {
  return {
    ...initialComputerAttachState(state.sessionID),
    externalDraftEndpoint: state.externalDraftEndpoint ?? AN_COMPUTER_EXTERNAL_SURFACE.defaultEndpointHint,
    externalDraftFamily: state.externalDraftFamily ?? "edge",
  }
}

/** Rescope attach when the routed session changes — never carry Live across sessions. */
export function rescopeComputerAttach(
  state: ComputerAttachState,
  sessionID: string | undefined,
): ComputerAttachState {
  if (state.sessionID === sessionID) return state
  return initialComputerAttachState(sessionID)
}

export function computerAttachEmptyCopy(state: ComputerAttachState): string {
  if (state.error) return state.error
  if (state.phase === "consenting") {
    if (state.path === "external-chromium") {
      return externalAttachConsentCopy(state.externalDraftFamily ?? "edge")
    }
    return "Confirm to attach Aporetic’s local Chromium workspace (Edge/Chrome family). Watch-only until Takeover. Not a VM."
  }
  if (isComputerLive(state)) {
    if (state.backend === "external-chromium") {
      const family = state.externalFamily ? externalBrowserFamilyLabel(state.externalFamily) : "Edge/Chrome"
      return `${family} region attached (loopback). Watch-only page feed is active; labeled Bot cursor is a Computer View overlay only.`
    }
    return "Local browser workspace attached. Watch-only page feed is active; labeled Bot cursor is a Computer View overlay only."
  }
  return "Computer View is unavailable until you connect a local browser workspace or your Edge/Chrome region. Browser-first — not VM."
}

export function computerAttachNote(state: ComputerAttachState): string {
  if (isComputerLive(state)) {
    if (state.backend === "external-chromium") {
      return "Live = consented Edge/Chrome region on loopback + watch-only page feed. Bot cursor is overlay chrome — not in page captures. Takeover is separate."
    }
    return "Live = consented local browser attach + watch-only page feed. Bot cursor is overlay chrome — not in page captures. Takeover is separate."
  }
  if (state.phase === "consenting") {
    return state.path === "external-chromium"
      ? "Consent required — your browser, loopback only; disconnect clears Live."
      : "Consent required — local only; disconnect clears Live."
  }
  return "Watch-only Computer View — connect a local workspace or your Edge/Chrome region to go Live."
}
