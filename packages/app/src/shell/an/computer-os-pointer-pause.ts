// AP-STAGE5-07: auto-pause when user interacts with the same controlled target
// (Computer View chrome pointer/focus, or external CDP page pointer/key/focus).
// Handoff H: never race two controllers. Does not grant Takeover input.
// Native OS window capture remains BLOCKED (STAGE5-06) — not claimed here.
// Honest limit: global OS hooks outside the consented CDP page / Aporetic chrome
// are not available; bot-tool CDP Input false-pause is avoided by requiring
// Aporetic blur for page pointer/key (focus-gain always counts).

import {
  autoPauseOnUserTargetInteraction,
  shouldAutoPauseOnUserTargetInteraction,
} from "./computer-cdp-isolation"
import type { ComputerControlState } from "./computer-control"

export const AN_COMPUTER_OS_POINTER_PAUSE_SURFACE = {
  part: "computer-os-pointer-pause",
  partAttr: 'data-an-part="computer-os-pointer-pause"',
  /** Local Computer View chrome: pointer on feed surface / focus on feed URL. */
  computerChromeAutoPause: true,
  /** External consented CDP page: pointer/key when Aporetic blurred; focus-gain always. */
  cdpPageAutoPause: true,
  /** Feed Go remains an auto-pause path (STAGE5-06). */
  feedGoAutoPause: true,
  /** True global OS pointer interception without page/chrome signal — unsupported. */
  globalOsPointerHook: false,
  globalOsPointerHookStatus: "UNSUPPORTED" as const,
  neverGrantsTakeoverInput: true,
} as const

export type OsPointerPauseKind =
  | "feed-go"
  | "chrome-pointer"
  | "chrome-focus"
  | "cdp-pointer"
  | "cdp-key"
  | "cdp-focus"

export type CdpPageInteractionProbe = {
  ok: boolean
  installed: boolean
  hit: boolean
  kinds: Array<"pointer" | "key" | "focus">
}

/** Injected into consented external page — stores sticky flags until polled. */
export const CDP_USER_TARGET_INTERACTION_INSTALL_JS = `(() => {
  const KEY = "__anUserTargetInteraction";
  const existing = window[KEY];
  if (existing && existing.installed) return { ok: true, already: true };
  const state = {
    installed: true,
    pointer: false,
    key: false,
    focusGain: false,
    lastFocus: !!(document.hasFocus && document.hasFocus()),
  };
  const mark = (field) => { state[field] = true; };
  window.addEventListener("pointerdown", () => mark("pointer"), true);
  window.addEventListener("keydown", () => mark("key"), true);
  const syncFocus = () => {
    const focused = !!(document.hasFocus && document.hasFocus());
    if (focused && !state.lastFocus) mark("focusGain");
    state.lastFocus = focused;
  };
  window.addEventListener("focus", syncFocus, true);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") syncFocus();
  });
  window[KEY] = state;
  return { ok: true, installed: true };
})()`

/** Read + clear sticky user-interaction flags from the consented page. */
export const CDP_USER_TARGET_INTERACTION_POLL_JS = `(() => {
  const KEY = "__anUserTargetInteraction";
  const s = window[KEY];
  if (!s || !s.installed) return { ok: false, installed: false, hit: false, kinds: [] };
  const kinds = [];
  if (s.pointer) kinds.push("pointer");
  if (s.key) kinds.push("key");
  if (s.focusGain) kinds.push("focus");
  const hit = kinds.length > 0;
  s.pointer = false;
  s.key = false;
  s.focusGain = false;
  return { ok: true, installed: true, hit, kinds };
})()`

export function parseCdpPageInteractionProbe(raw: unknown): CdpPageInteractionProbe {
  if (!raw || typeof raw !== "object") {
    return { ok: false, installed: false, hit: false, kinds: [] }
  }
  const o = raw as Record<string, unknown>
  const kindsRaw = Array.isArray(o.kinds) ? o.kinds : []
  const kinds: Array<"pointer" | "key" | "focus"> = []
  for (const k of kindsRaw) {
    if (k === "pointer" || k === "key" || k === "focus") kinds.push(k)
  }
  return {
    ok: o.ok === true,
    installed: o.installed === true,
    hit: o.hit === true && kinds.length > 0,
    kinds,
  }
}

/**
 * External CDP page auto-pause gate.
 * - focus-gain on the target always pauses (user brought Edge/Chrome forward)
 * - pointer/key only when Aporetic window is not focused (avoids bot-tool false pause
 *   while the user is watching from Aporetic)
 */
export function shouldApplyExternalPageAutoPause(input: {
  live: boolean
  control: ComputerControlState
  aporeticWindowFocused: boolean
  page: CdpPageInteractionProbe
}): boolean {
  if (!shouldAutoPauseOnUserTargetInteraction(input.live, input.control)) return false
  if (!AN_COMPUTER_OS_POINTER_PAUSE_SURFACE.cdpPageAutoPause) return false
  if (!input.page.hit) return false
  if (input.page.kinds.includes("focus")) return true
  if (
    !input.aporeticWindowFocused &&
    (input.page.kinds.includes("pointer") || input.page.kinds.includes("key"))
  ) {
    return true
  }
  return false
}

export function shouldApplyComputerChromeAutoPause(
  live: boolean,
  control: ComputerControlState,
): boolean {
  return (
    AN_COMPUTER_OS_POINTER_PAUSE_SURFACE.computerChromeAutoPause &&
    shouldAutoPauseOnUserTargetInteraction(live, control)
  )
}

export function applyOsPointerAutoPause(
  control: ComputerControlState,
  live: boolean,
): ComputerControlState {
  return autoPauseOnUserTargetInteraction(control, live)
}

export function mapCdpKindsToPauseKinds(
  kinds: readonly ("pointer" | "key" | "focus")[],
): OsPointerPauseKind[] {
  const out: OsPointerPauseKind[] = []
  for (const k of kinds) {
    switch (k) {
      case "pointer":
        out.push("cdp-pointer")
        break
      case "key":
        out.push("cdp-key")
        break
      case "focus":
        out.push("cdp-focus")
        break
      default: {
        const _exhaustive: never = k
        void _exhaustive
      }
    }
  }
  return out
}

/** DEV / CDP probe hook — no secrets. */
export function installAnOsPointerPauseWindowProbe(): void {
  if (typeof window === "undefined") return
  const w = window as Window & {
    __anOsPointerPause?: Record<string, unknown>
  }
  w.__anOsPointerPause = {
    surface: AN_COMPUTER_OS_POINTER_PAUSE_SURFACE,
    shouldApplyExternalPageAutoPause,
    shouldApplyComputerChromeAutoPause,
    applyOsPointerAutoPause,
    shouldAutoPauseOnUserTargetInteraction,
    parseCdpPageInteractionProbe,
    mapCdpKindsToPauseKinds,
    installJs: CDP_USER_TARGET_INTERACTION_INSTALL_JS,
    pollJs: CDP_USER_TARGET_INTERACTION_POLL_JS,
  }
}
