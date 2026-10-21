// AP-STAGE5-06: multi-tab CDP isolation + honest native-window-capture capability flags.
// Handoff H residual: enforce tab-group allowlist on CDP screencast/navigate/retarget.
// Native OS window capture is BLOCKED in isolated DEV (no desktopCapturer / getDisplayMedia adapter).

import { botMayDrive, pauseBot, type ComputerControlState } from "./computer-control"
import {
  authorizeTabAction,
  authorizeWindowAction,
  hasComputerScope,
  type ComputerScopeState,
} from "./computer-scope"

/** Minimal CDP target shape — avoid importing screencast-cdp (cycle risk). */
export type CdpIsolationTarget = {
  id: string
  type?: string
  title?: string
  url?: string
  webSocketDebuggerUrl?: string
}

export const AN_COMPUTER_CDP_ISOLATION_SURFACE = {
  part: "computer-cdp-isolation",
  partAttr: 'data-an-part="computer-cdp-isolation"',
  /** Real multi-tab allowlist enforcement for loopback CDP (browser path). */
  browserTabGroupIsolation: true,
  /**
   * Native OS window capture (desktopCapturer / getDisplayMedia window picker /
   * HWND remapping) — not implemented in this DEV slice. Do not claim PASS.
   */
  nativeWindowCapture: false,
  nativeWindowCaptureStatus: "BLOCKED" as const,
  nativeWindowCaptureBlockedReason:
    "Capturing a whole desktop window is not available yet. You can still approve a browser tab; the desktop itself is not captured.",
  /** Browser background control tested via CDP region pin — separate from native. */
  browserBackgroundControlFlag: "cdp-region-pin" as const,
  nativeBackgroundControlFlag: "unsupported" as const,
  /** Opening preview / mode switch never widens allowlist. */
  neverSilentRetarget: true,
  neverWidenOnUnauthorized: true,
} as const

export type CdpIsolationGateResult =
  | { ok: true; regionId: string }
  | { ok: false; error: string; code: "unauthorized-tab" | "unauthorized-window" | "native-blocked" | "no-scope" | "missing-target" }

export type NativeWindowCaptureAttempt = {
  ok: false
  status: "BLOCKED"
  error: string
  capability: typeof AN_COMPUTER_CDP_ISOLATION_SURFACE.nativeWindowCapture
}

/** Honest refusal — never invents OS window pixels. */
export function attemptNativeWindowCapture(_input?: {
  windowId?: string
  processId?: string
}): NativeWindowCaptureAttempt {
  return {
    ok: false,
    status: AN_COMPUTER_CDP_ISOLATION_SURFACE.nativeWindowCaptureStatus,
    error: AN_COMPUTER_CDP_ISOLATION_SURFACE.nativeWindowCaptureBlockedReason,
    capability: AN_COMPUTER_CDP_ISOLATION_SURFACE.nativeWindowCapture,
  }
}

export function isNativeWindowCaptureAvailable(): boolean {
  return Boolean(AN_COMPUTER_CDP_ISOLATION_SURFACE.nativeWindowCapture)
}

/**
 * Gate CDP screencast start / frame poll against tab-group allowlist.
 * Local-workspace has no CDP region — callers should not start external screencast.
 * Window scope refuses CDP tab ops (native path BLOCKED separately).
 */
export function authorizeCdpRegionAction(
  scope: ComputerScopeState,
  regionId: string,
): CdpIsolationGateResult {
  const id = regionId.trim()
  if (!id) {
    return { ok: false, error: "A browser tab id is required.", code: "missing-target" }
  }
  if (!hasComputerScope(scope)) {
    return {
      ok: false,
      error: "No control scope assigned — action refused (scope was not widened).",
      code: "no-scope",
    }
  }
  if (scope.kind === "window") {
    const win = authorizeWindowAction(scope, scope.windowId ?? id)
    if (!win.ok) {
      return { ok: false, error: win.error, code: "unauthorized-window" }
    }
    // Window identity authorized as a gate, but OS capture remains BLOCKED.
    const blocked = attemptNativeWindowCapture({ windowId: scope.windowId, processId: scope.processId })
    return { ok: false, error: blocked.error, code: "native-blocked" }
  }
  if (scope.kind === "local-workspace") {
    return {
      ok: false,
      error: "The built-in workspace uses its own page view — external browser tab actions are out of scope.",
      code: "unauthorized-tab",
    }
  }
  // tab-group
  const gate = authorizeTabAction(scope, id)
  if (!gate.ok) {
    return { ok: false, error: gate.error, code: "unauthorized-tab" }
  }
  return { ok: true, regionId: id }
}

/** Alias for screencast start — same allowlist gate. */
export function authorizeCdpScreencastStart(
  scope: ComputerScopeState,
  regionId: string,
): CdpIsolationGateResult {
  return authorizeCdpRegionAction(scope, regionId)
}

/** Alias for Page.navigate / relay navigate — same allowlist gate. */
export function authorizeCdpNavigate(
  scope: ComputerScopeState,
  regionId: string,
): CdpIsolationGateResult {
  return authorizeCdpRegionAction(scope, regionId)
}

/**
 * Refuse silent retarget to a different CDP target outside the allowlist.
 * Authorized retarget within tab-group is allowed (multi-tab isolation, not freeze).
 */
export function authorizeCdpRetarget(
  scope: ComputerScopeState,
  nextRegionId: string,
): CdpIsolationGateResult {
  return authorizeCdpRegionAction(scope, nextRegionId)
}

/** Filter `/json/list` targets down to the assigned tab-group (or empty when not tab-group). */
export function filterCdpTargetsToScope(
  scope: ComputerScopeState,
  targets: readonly CdpIsolationTarget[],
): CdpIsolationTarget[] {
  if (scope.kind !== "tab-group" || !hasComputerScope(scope)) return []
  const allow = new Set(scope.tabIds ?? [])
  return targets.filter((t) => allow.has(t.id))
}

/**
 * Resolve an active CDP target that stays inside scope.
 * Prefers preferredRegionId when authorized; else first allowlisted page with a WS URL.
 * Never returns an unauthorized target.
 */
export function resolveActiveCdpTargetInScope(
  scope: ComputerScopeState,
  targets: readonly CdpIsolationTarget[],
  preferredRegionId?: string,
): CdpIsolationGateResult & { target?: CdpIsolationTarget } {
  const preferred = preferredRegionId?.trim()
  if (preferred) {
    const gate = authorizeCdpRegionAction(scope, preferred)
    if (!gate.ok) return gate
    const hit = targets.find((t) => t.id === preferred)
    if (!hit) {
      return {
        ok: false,
        error: `Approved tab ${preferred} is no longer open (not switched to another tab).`,
        code: "missing-target",
      }
    }
    if (!hit.webSocketDebuggerUrl) {
      return {
        ok: false,
        error: `Tab ${preferred} is not available for viewing right now.`,
        code: "missing-target",
      }
    }
    return { ok: true, regionId: preferred, target: hit }
  }
  const allowed = filterCdpTargetsToScope(scope, targets).filter((t) => !!t.webSocketDebuggerUrl)
  if (allowed.length === 0) {
    return {
      ok: false,
      error: "None of the approved tabs from this scope are open right now.",
      code: "missing-target",
    }
  }
  const first = allowed[0]!
  return { ok: true, regionId: first.id, target: first }
}

/**
 * Expand tab-group only via explicit assign — never silent widen from CDP list churn.
 * Returns prior state + error when caller tries to add ids without reassignment.
 */
export function refuseSilentTabGroupWiden(
  scope: ComputerScopeState,
  discoveredTabIds: readonly string[],
): { ok: true; scope: ComputerScopeState } | { ok: false; error: string; scope: ComputerScopeState } {
  if (scope.kind !== "tab-group" || !hasComputerScope(scope)) {
    return {
      ok: false,
      error: "Can't add tabs automatically — choose which tabs are in scope first.",
      scope,
    }
  }
  const allow = new Set(scope.tabIds ?? [])
  const extras = discoveredTabIds.map((id) => id.trim()).filter((id) => id && !allow.has(id))
  if (extras.length === 0) return { ok: true, scope }
  return {
    ok: false,
    error: `Can't add ${extras.length} new tab(s) automatically. Choose which tabs are in scope again — scope was not widened.`,
    scope,
  }
}

/**
 * Handoff H: auto-pause when user interacts with the same controlled surface
 * while bot may drive (e.g. feed Go). Does not grant user input.
 * External OS-pointer / CDP page focus → AP-STAGE5-07 (`computer-os-pointer-pause`).
 */
export function shouldAutoPauseOnUserTargetInteraction(
  live: boolean,
  control: ComputerControlState,
): boolean {
  return live && botMayDrive(control)
}

/** Apply auto-pause when user interacts with the Live target chrome (feed navigate). */
export function autoPauseOnUserTargetInteraction(
  control: ComputerControlState,
  live: boolean,
): ComputerControlState {
  if (!shouldAutoPauseOnUserTargetInteraction(live, control)) return control
  return pauseBot(control, live)
}

export function computerCdpIsolationStatusCopy(scope: ComputerScopeState): string {
  if (!hasComputerScope(scope)) return "Tab scope idle — none assigned."
  switch (scope.kind) {
    case "tab-group": {
      const n = scope.tabIds?.length ?? 0
      return `Tab scope on · ${n} approved tab(s). Other tabs stay out of reach.`
    }
    case "local-workspace":
      return "Built-in workspace · page view (not an external browser tab)."
    case "window":
      return "Window scope set · capturing the whole window is not available yet."
    case "none":
      return "Tab scope idle — none assigned."
    default: {
      const _exhaustive: never = scope.kind
      return _exhaustive
    }
  }
}

/** DEV / CDP probe hook — no secrets; exposes pure gates for live verification. */
export function installAnCdpIsolationWindowProbe(): void {
  if (typeof window === "undefined") return
  const w = window as Window & {
    __anCdpIsolation?: Record<string, unknown>
  }
  w.__anCdpIsolation = {
    surface: AN_COMPUTER_CDP_ISOLATION_SURFACE,
    authorizeCdpRegionAction,
    authorizeCdpScreencastStart,
    authorizeCdpNavigate,
    authorizeCdpRetarget,
    filterCdpTargetsToScope,
    resolveActiveCdpTargetInScope,
    refuseSilentTabGroupWiden,
    attemptNativeWindowCapture,
    isNativeWindowCaptureAvailable,
    shouldAutoPauseOnUserTargetInteraction,
    autoPauseOnUserTargetInteraction,
  }
}
