// AP-BF-03: AnShell control lock / Takeover — mirrors packages/core/src/mission/control.ts.
// View = watch-only (BF-02 pointer-events none). Takeover while Live = user input; bot paused.
// Never invent control without BF-01 Live attach.

export const AN_COMPUTER_CONTROL_SURFACE = {
  part: "computer-control",
  partAttr: 'data-an-part="computer-control"',
  /** Single controller — presentation modes share this lock. */
  singleController: true,
} as const

export type ComputerController = "none" | "bot" | "user"

export type ComputerControlState = {
  controller: ComputerController
  botPaused: boolean
  userInputGranted: boolean
  needsFreshObservation: boolean
  sessionID?: string
  error?: string
}

export type ComputerControlSyncInput = {
  live: boolean
  mode: "conversation" | "view" | "takeover"
  sessionID?: string
}

export function initialComputerControlState(sessionID?: string): ComputerControlState {
  return {
    controller: "none",
    botPaused: false,
    userInputGranted: false,
    needsFreshObservation: false,
    sessionID,
  }
}

export function botMayDrive(state: ComputerControlState): boolean {
  return state.controller === "bot" && !state.botPaused && !state.userInputGranted
}

export function userMayInput(state: ComputerControlState): boolean {
  return state.controller === "user" && state.userInputGranted === true
}

export function feedIsWatchOnly(state: ComputerControlState): boolean {
  return !userMayInput(state)
}

/** Labeled Bot cursor only when Live and bot holds (or may hold) the lock — not during user Takeover. */
export function isBotCursorShown(live: boolean, state: ComputerControlState): boolean {
  return live && !userMayInput(state)
}

export function syncComputerControl(
  state: ComputerControlState,
  input: ComputerControlSyncInput,
): ComputerControlState {
  if (state.sessionID !== undefined && input.sessionID !== undefined && state.sessionID !== input.sessionID) {
    return syncComputerControl(initialComputerControlState(input.sessionID), input)
  }

  if (!input.live) {
    return {
      ...initialComputerControlState(input.sessionID ?? state.sessionID),
      error: state.error,
    }
  }

  if (input.mode === "takeover") {
    return {
      controller: "user",
      botPaused: true,
      userInputGranted: true,
      needsFreshObservation: false,
      sessionID: input.sessionID ?? state.sessionID,
    }
  }

  // Leaving user Takeover requires a fresh observation before bot drives again.
  const leftUserControl = state.controller === "user"
  return {
    controller: "bot",
    botPaused: false,
    userInputGranted: false,
    needsFreshObservation: leftUserControl || state.needsFreshObservation,
    sessionID: input.sessionID ?? state.sessionID,
  }
}

export function acquireUserControl(state: ComputerControlState, live: boolean): ComputerControlState {
  if (!live) {
    return {
      ...state,
      controller: "none",
      botPaused: false,
      userInputGranted: false,
      error: "Takeover requires a Live local-browser attach. Connect first.",
    }
  }
  return {
    controller: "user",
    botPaused: true,
    userInputGranted: true,
    needsFreshObservation: false,
    sessionID: state.sessionID,
  }
}

export function releaseToBot(state: ComputerControlState, live: boolean): ComputerControlState {
  if (!live) {
    return initialComputerControlState(state.sessionID)
  }
  return {
    controller: "bot",
    botPaused: false,
    userInputGranted: false,
    needsFreshObservation: true,
    sessionID: state.sessionID,
  }
}

export function stopUserControl(state: ComputerControlState, live: boolean): ComputerControlState {
  return releaseToBot(state, live)
}

export function ackFreshObservation(state: ComputerControlState): ComputerControlState {
  if (!state.needsFreshObservation) return state
  return { ...state, needsFreshObservation: false, error: undefined }
}

export function clearComputerControl(sessionID?: string): ComputerControlState {
  return initialComputerControlState(sessionID)
}

export function rescopeComputerControl(
  state: ComputerControlState,
  sessionID: string | undefined,
): ComputerControlState {
  if (state.sessionID === sessionID) return state
  return initialComputerControlState(sessionID)
}

export function computerControlBannerCopy(live: boolean, state: ComputerControlState): {
  pill: string
  copy: string
} {
  if (!live) {
    return {
      pill: "Takeover chrome",
      copy: "No Live attach — Takeover layout only. Connect a local browser workspace before controlling the page.",
    }
  }
  if (userMayInput(state)) {
    return {
      pill: "You control",
      copy: "You hold the control lock. Bot is paused and will not drive until Hand back or Stop.",
    }
  }
  return {
    pill: "Watch-only",
    copy: "Bot holds the control lock. Page feed stays watch-only until Takeover.",
  }
}

export function computerControlNote(live: boolean, state: ComputerControlState): string {
  if (!live) {
    return "Watch-only Computer View — connect a local browser workspace to go Live. Takeover needs Live."
  }
  if (userMayInput(state)) {
    return "Takeover: you hold the lock; bot paused. Hand back / Stop returns bot control (fresh observation required)."
  }
  if (state.needsFreshObservation) {
    return "Live + watch-only. Bot holds the lock after Hand back — fresh observation required before bot drives."
  }
  return "Live = consented attach + watch-only feed. Bot holds the lock. Takeover grants you input and pauses the bot."
}
