// AP-BF-01: consent/attach for browser-first Computer View (honest computerLive).
// Local Chromium workspace path only — never invent Live, never default to VM.

export const AN_COMPUTER_ATTACH_SURFACE = {
  part: "computer-attach",
  partAttr: 'data-an-part="computer-attach"',
  backend: "local-browser",
  /** User-facing path: Edge/Chrome-family Chromium workspace inside Aporetic (not VM). */
  pathLabel: "Local browser workspace (Edge/Chrome)",
  cursorLabel: "Bot cursor",
  liveOnlyWhenAttached: true,
} as const

export type ComputerAttachPhase = "disconnected" | "consenting" | "attached"

export type ComputerAttachBackend = "local-browser"

export type ComputerAttachState = {
  phase: ComputerAttachPhase
  /** Explicit user consent for this session attach. */
  consented: boolean
  backend: ComputerAttachBackend
  /** Session id when attach is scoped; undefined on home/draft. */
  sessionID?: string
  /** Last error shown honestly in the panel (no secrets). */
  error?: string
}

export function initialComputerAttachState(sessionID?: string): ComputerAttachState {
  return {
    phase: "disconnected",
    consented: false,
    backend: AN_COMPUTER_ATTACH_SURFACE.backend,
    sessionID,
  }
}

/** Live only when user consented and attach phase is attached on the local-browser path. */
export function isComputerLive(state: ComputerAttachState): boolean {
  return (
    state.phase === "attached" &&
    state.consented === true &&
    state.backend === "local-browser" &&
    !state.error
  )
}

/** Labeled cursor affordance is UI-only overlay — never in agent captures (BF-02 feed still open). */
export function isComputerCursorVisible(state: ComputerAttachState): boolean {
  return isComputerLive(state)
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
  }
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
  return {
    ...state,
    phase: "attached",
    consented: true,
    backend: "local-browser",
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
    ...state,
    phase: "disconnected",
    consented: false,
    error: undefined,
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
    return "Confirm to attach Aporetic’s local Chromium workspace (Edge/Chrome family). Watch-only until Takeover. Not a VM."
  }
  if (isComputerLive(state)) {
    return "Local browser workspace attached. Labeled bot cursor is a Computer View overlay only — page pixels arrive in BF-02."
  }
  return "Computer View is unavailable until you connect a local browser workspace. Browser-first — not VM."
}

export function computerAttachNote(state: ComputerAttachState): string {
  if (isComputerLive(state)) {
    return "Live = consented local browser attach. Watch-only in Computer View; Takeover is separate. No fake page feed."
  }
  if (state.phase === "consenting") {
    return "Consent required — local only; disconnect clears Live."
  }
  return "Watch-only Computer View — connect a local browser workspace to go Live."
}
