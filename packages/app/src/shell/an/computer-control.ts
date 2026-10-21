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

/** Labeled Bot cursor only when Live and bot may drive — hidden during Takeover and Pause. */
export function isBotCursorShown(live: boolean, state: ComputerControlState): boolean {
  return live && botMayDrive(state)
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
  // Explicit Pause while bot holds the lock survives mode/live sync (AP-STAGE5-05).
  const leftUserControl = state.controller === "user"
  return {
    controller: "bot",
    botPaused: leftUserControl ? false : state.botPaused,
    userInputGranted: false,
    needsFreshObservation: leftUserControl || state.needsFreshObservation,
    sessionID: input.sessionID ?? state.sessionID,
  }
}

/** Pause queued bot drive without granting user input (handoff H Pause). */
export function pauseBot(state: ComputerControlState, live: boolean): ComputerControlState {
  if (!live || state.controller === "none") {
    return {
      ...state,
      error: "Pause needs a Live attach with bot control.",
    }
  }
  if (userMayInput(state)) {
    // Already paused for Takeover — no-op on drive; user still holds input.
    return { ...state, botPaused: true, error: undefined }
  }
  return {
    ...state,
    controller: "bot",
    botPaused: true,
    userInputGranted: false,
    error: undefined,
  }
}

/** Resume bot drive after Pause (not after Takeover — use Hand back / releaseToBot). */
export function resumeBot(state: ComputerControlState, live: boolean): ComputerControlState {
  if (!live) {
    return initialComputerControlState(state.sessionID)
  }
  if (userMayInput(state)) {
    return {
      ...state,
      error: "Hand back or Stop first — Resume does not end Takeover.",
    }
  }
  return {
    ...state,
    controller: "bot",
    botPaused: false,
    userInputGranted: false,
    error: undefined,
  }
}

/**
 * Resolve controlling-banner bot display name.
 * Prefer roster selected name; else title-case agent slug (`aporia-grok` → `Grok`).
 * Generic "Bot" only when neither is available.
 */
export function resolveComputerControllerBotName(input: {
  rosterName?: string
  currentAgent?: string
  fallback?: string
}): string {
  const fromRoster = input.rosterName?.trim()
  if (fromRoster) return fromRoster
  const agent = input.currentAgent?.trim()
  if (agent) {
    const slug = agent
      .replace(/^aporia-/i, "")
      .replace(/[-_]+/g, " ")
      .trim()
    if (slug) {
      return slug.replace(/\b[a-zA-Z]/g, (ch) => ch.toUpperCase())
    }
  }
  const fallback = input.fallback?.trim()
  return fallback || "Bot"
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

/**
 * Takeover / control banner. Optional botName + targetName enable handoff H lines
 * (`{bot} is controlling · [target]` / `{bot} paused` / `You are controlling · Bot paused`).
 * Gold is boundary tone only — never means verified/success.
 */
export function computerControlBannerCopy(
  live: boolean,
  state: ComputerControlState,
  opts?: { botName?: string; targetName?: string },
): {
  pill: string
  copy: string
} {
  const bot = opts?.botName?.trim() || "Bot"
  const target = opts?.targetName?.trim()
  if (!live) {
    return {
      pill: "Takeover layout",
      copy: "Not Live yet — this is the Takeover layout only. Connect a browser workspace before controlling the page.",
    }
  }
  if (userMayInput(state)) {
    return {
      pill: "You are controlling",
      copy: target
        ? `You are controlling · Bot paused · ${target}`
        : "You are controlling · Bot paused. Hand back or Stop releases the lock.",
    }
  }
  if (state.botPaused) {
    return {
      pill: `${bot} paused`,
      copy: target
        ? `${bot} paused · ${target}`
        : `${bot} paused. Resume restores bot drive; Take over grants you input.`,
    }
  }
  return {
    pill: `${bot} is controlling`,
    copy: target
      ? `${bot} is controlling · ${target}`
      : `${bot} holds the control lock. Page feed stays watch-only until Takeover.`,
  }
}

export function computerControlNote(live: boolean, state: ComputerControlState): string {
  if (!live) {
    return "Watch-only Computer View — connect a browser workspace to go Live. Takeover needs Live first."
  }
  if (userMayInput(state)) {
    return "Takeover: you control the page; the bot is paused. Hand back or Stop returns control to the bot (it will look at the page again first)."
  }
  if (state.botPaused) {
    return "Live and watch-only. The bot is paused — Resume lets it continue; Take over gives you the page."
  }
  if (state.needsFreshObservation) {
    return "Live and watch-only. After Hand back, the bot must look at the page again before it can continue."
  }
  return "Live means you approved a connection and the feed is watch-only. The bot controls the page. Pause or Takeover stops the bot."
}
