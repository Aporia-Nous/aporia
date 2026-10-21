// AP-BF-03: single computer control lock (Stage 5 / browser-first).
// Pure rules — no DB, clock, or network. Presentation (Conversation / View / Takeover)
// shares this one controller; View never grants input; Takeover pauses the bot.

export type ComputerController = "none" | "bot" | "user"

export type ComputerControlState = {
  /** Who may drive the computer surface right now. */
  controller: ComputerController
  /** When user holds the lock, the bot must not drive. */
  botPaused: boolean
  /** True only while user Takeover holds the lock on a Live attach. */
  userInputGranted: boolean
  /**
   * After Hand back / Stop, bot must take a fresh observation before driving again.
   * Cleared when bot re-acquires after observation ack (or disconnect).
   */
  needsFreshObservation: boolean
  /** Optional session scope — never carry a lock across sessions. */
  sessionID?: string
  /** Honest error when a transition was refused. */
  error?: string
}

export type ComputerControlSyncInput = {
  /** Honest Live attach (BF-01) — lock stays none without Live. */
  live: boolean
  /**
   * Presentation mode. Only `takeover` requests user control.
   * Conversation / view leave (or restore) bot control when Live.
   */
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

/** Bot may drive only when it holds the lock and is not paused. */
export function botMayDrive(state: ComputerControlState): boolean {
  return state.controller === "bot" && !state.botPaused && !state.userInputGranted
}

/** User may inject input only when Takeover granted the lock. */
export function userMayInput(state: ComputerControlState): boolean {
  return state.controller === "user" && state.userInputGranted === true
}

/** Feed stays watch-only (pointer-events none) until user holds the lock. */
export function feedIsWatchOnly(state: ComputerControlState): boolean {
  return !userMayInput(state)
}

/**
 * Sync lock to Live + presentation mode.
 * - Not Live → none (never invent control)
 * - Live + takeover → user (bot paused)
 * - Live + conversation|view → bot (watch-only feed)
 */
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

  // Conversation / Computer View while Live: bot holds lock; feed watch-only.
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

/** Explicit Takeover — refuses without Live. */
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

/**
 * Hand back — return lock to bot; require fresh observation before bot drives again.
 * Presentation should leave Takeover (Conversation).
 */
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

/**
 * Stop Takeover — return to watch-only View semantics; bot holds lock; fresh observation required.
 */
export function stopUserControl(state: ComputerControlState, live: boolean): ComputerControlState {
  return releaseToBot(state, live)
}

/** Ack that bot observed the surface after Hand back — clears the observation gate. */
export function ackFreshObservation(state: ComputerControlState): ComputerControlState {
  if (!state.needsFreshObservation) return state
  return { ...state, needsFreshObservation: false, error: undefined }
}

/** Disconnect / rescope — clear lock entirely. */
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
