// AP-STAGE5-04: control SCOPE axis (tab group | window | local workspace) — separate from MODE.
// Handoff H: opening a preview never widens scope or grants input; unauthorized targets reject.
// Electric-gold boundary chrome identifies the controlled surface (not success color).

import type { ComputerAttachState } from "./computer-attach"
import { isComputerLive } from "./computer-attach"

export const AN_COMPUTER_SCOPE_SURFACE = {
  part: "computer-scope",
  partAttr: 'data-an-part="computer-scope"',
  boundaryPart: "computer-boundary",
  boundaryAttr: 'data-an-part="computer-boundary"',
  /** Electric gold — AN gold; never purple; never means verified/success. */
  boundaryTone: "electric-gold",
  kinds: ["none", "local-workspace", "tab-group", "window"] as const,
  /** Mode switch / Inline preview must not mutate this axis. */
  previewNeverWidensScope: true,
  previewNeverGrantsInput: true,
} as const

/** Scope kinds — orthogonal to Conversation / Computer View / Takeover modes. */
export type ComputerScopeKind = (typeof AN_COMPUTER_SCOPE_SURFACE.kinds)[number]

export type ComputerScopeState = {
  kind: ComputerScopeKind
  /** Display name for banner / boundary chrome. */
  targetName?: string
  /** Tab-group allowlist (actual tab / CDP target ids). */
  tabIds?: readonly string[]
  /** Stable window identity for one-window scope. */
  windowId?: string
  /** Optional process id — second window of same process stays outside until included. */
  processId?: string
  sessionID?: string
  /** Last rejection / honesty error (no secrets). */
  error?: string
}

export type ComputerScopeAssignTabGroup = {
  tabIds: readonly string[]
  targetName?: string
  sessionID?: string
}

export type ComputerScopeAssignWindow = {
  windowId: string
  processId?: string
  targetName?: string
  sessionID?: string
}

export type ComputerScopeAssignLocal = {
  targetName?: string
  sessionID?: string
}

export function initialComputerScopeState(sessionID?: string): ComputerScopeState {
  return { kind: "none", sessionID }
}

export function clearComputerScope(sessionID?: string): ComputerScopeState {
  return initialComputerScopeState(sessionID)
}

export function rescopeComputerScope(
  state: ComputerScopeState,
  sessionID: string | undefined,
): ComputerScopeState {
  if (state.sessionID === sessionID) return state
  return initialComputerScopeState(sessionID)
}

export function assignLocalWorkspaceScope(
  _state: ComputerScopeState,
  input: ComputerScopeAssignLocal = {},
): ComputerScopeState {
  return {
    kind: "local-workspace",
    targetName: input.targetName?.trim() || "Local browser workspace",
    sessionID: input.sessionID,
    tabIds: undefined,
    windowId: undefined,
    processId: undefined,
    error: undefined,
  }
}

export function assignTabGroupScope(
  _state: ComputerScopeState,
  input: ComputerScopeAssignTabGroup,
): ComputerScopeState {
  const tabIds = [...new Set(input.tabIds.map((id) => id.trim()).filter(Boolean))]
  if (tabIds.length === 0) {
    return {
      kind: "none",
      sessionID: input.sessionID,
      error: "Tab group scope needs at least one authorized tab id.",
    }
  }
  return {
    kind: "tab-group",
    tabIds,
    targetName: input.targetName?.trim() || `Tab group (${tabIds.length})`,
    sessionID: input.sessionID,
    windowId: undefined,
    processId: undefined,
    error: undefined,
  }
}

export function assignWindowScope(
  _state: ComputerScopeState,
  input: ComputerScopeAssignWindow,
): ComputerScopeState {
  const windowId = input.windowId.trim()
  if (!windowId) {
    return {
      kind: "none",
      sessionID: input.sessionID,
      error: "Window scope needs a stable window identity.",
    }
  }
  return {
    kind: "window",
    windowId,
    processId: input.processId?.trim() || undefined,
    targetName: input.targetName?.trim() || `Window ${windowId}`,
    sessionID: input.sessionID,
    tabIds: undefined,
    error: undefined,
  }
}

/** True when a concrete controlled surface is assigned (not none). */
export function hasComputerScope(state: ComputerScopeState): boolean {
  return state.kind !== "none" && !state.error
}

export function isTabAuthorized(state: ComputerScopeState, tabId: string): boolean {
  const id = tabId.trim()
  if (!id || !hasComputerScope(state)) return false
  if (state.kind === "tab-group") return (state.tabIds ?? []).includes(id)
  // Local workspace / window scopes do not authorize arbitrary browser tabs.
  return false
}

export function isWindowAuthorized(state: ComputerScopeState, windowId: string): boolean {
  const id = windowId.trim()
  if (!id || !hasComputerScope(state)) return false
  if (state.kind === "window") return state.windowId === id
  return false
}

/** Adapter gate — reject unassigned tabs without retargeting. */
export function authorizeTabAction(
  state: ComputerScopeState,
  tabId: string,
): { ok: true } | { ok: false; error: string } {
  if (isTabAuthorized(state, tabId)) return { ok: true }
  return {
    ok: false,
    error: "Unauthorized tab — outside assigned tab group. Scope was not widened.",
  }
}

/** Adapter gate — reject unassigned windows (second doc window stays outside). */
export function authorizeWindowAction(
  state: ComputerScopeState,
  windowId: string,
): { ok: true } | { ok: false; error: string } {
  if (isWindowAuthorized(state, windowId)) return { ok: true }
  return {
    ok: false,
    error: "Unauthorized window — outside assigned window scope. Scope was not widened.",
  }
}

/**
 * Opening Inline preview / Computer View must never widen scope.
 * Returns prior state unchanged (contract pin for mode/density switches).
 */
export function openPreviewPreservingScope(state: ComputerScopeState): ComputerScopeState {
  return state
}

/** Mode switch leaves scope untouched — orthogonal axes. */
export function switchModePreservingScope(state: ComputerScopeState): ComputerScopeState {
  return state
}

export function computerScopeKindLabel(kind: ComputerScopeKind): string {
  switch (kind) {
    case "none":
      return "No scope"
    case "local-workspace":
      return "Local workspace"
    case "tab-group":
      return "Tab group"
    case "window":
      return "Window"
    default: {
      const _exhaustive: never = kind
      return _exhaustive
    }
  }
}

export function computerScopeTargetLabel(state: ComputerScopeState): string {
  if (!hasComputerScope(state)) return "unassigned"
  return state.targetName?.trim() || computerScopeKindLabel(state.kind)
}

/**
 * Sync scope from a Live attach — defaults to local-workspace or tab-group(region).
 * Never invents scope when not Live. Does not grant input authority.
 */
export function syncComputerScopeFromAttach(
  state: ComputerScopeState,
  attach: ComputerAttachState,
  sessionID?: string,
): ComputerScopeState {
  const sid = sessionID ?? attach.sessionID ?? state.sessionID
  if (!isComputerLive(attach)) {
    return clearComputerScope(sid)
  }
  if (attach.backend === "external-chromium" && attach.externalRegionId) {
    return assignTabGroupScope(state, {
      tabIds: [attach.externalRegionId],
      targetName: attach.externalFamily
        ? `${attach.externalFamily} · ${attach.externalRegionId}`
        : `Region ${attach.externalRegionId}`,
      sessionID: sid,
    })
  }
  return assignLocalWorkspaceScope(state, {
    targetName: "Local browser workspace",
    sessionID: sid,
  })
}

/** Electric-gold boundary shows when Live and a scope is assigned. */
export function isComputerBoundaryVisible(live: boolean, state: ComputerScopeState): boolean {
  return live && hasComputerScope(state)
}

/**
 * Handoff H control banner — text + gold; gold never means verified/success.
 * Caller should pass resolveComputerControllerBotName() — generic "Bot" only as last resort.
 */
export function computerScopeBannerCopy(input: {
  live: boolean
  userControl: boolean
  botPaused?: boolean
  botName?: string
  scope: ComputerScopeState
}): { pill: string; copy: string; line: string } {
  const bot = input.botName?.trim() || "Bot"
  const target = computerScopeTargetLabel(input.scope)
  if (!input.live) {
    return {
      pill: "No Live scope",
      copy: "Connect a browser workspace before assigning control scope.",
      line: "No Live attach · scope unassigned",
    }
  }
  if (input.userControl) {
    const line = `You are controlling · Bot paused · ${target}`
    return {
      pill: "You are controlling",
      copy: `Bot paused. Hand back or Stop releases the lock. Scope stays ${computerScopeKindLabel(input.scope.kind)}.`,
      line,
    }
  }
  if (input.botPaused) {
    const line = `${bot} paused · ${target}`
    return {
      pill: `${bot} paused`,
      copy: `${bot} drive paused. Resume restores drive; Take over grants you input. Scope stays ${computerScopeKindLabel(input.scope.kind)}.`,
      line,
    }
  }
  const line = `${bot} is controlling · ${target}`
  return {
    pill: `${bot} is controlling`,
    copy: `Scoped surface: ${target}. Pause / Takeover stop bot drive. Opening Computer View never widens scope.`,
    line,
  }
}
