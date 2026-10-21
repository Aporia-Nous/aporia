import { describe, expect, test } from "bun:test"
import {
  AN_COMPOSER_SURFACE,
  AN_COMPUTER_ATTACH_SURFACE,
  AN_COMPUTER_FEED_SURFACE,
} from "./tokens"
import {
  botMayDrive,
  initialComputerControlState,
  pauseBot,
  syncComputerControl,
} from "./computer-control"
import {
  AN_COMPUTER_CDP_ISOLATION_SURFACE,
  attemptNativeWindowCapture,
  authorizeCdpNavigate,
  authorizeCdpRegionAction,
  authorizeCdpRetarget,
  authorizeCdpScreencastStart,
  autoPauseOnUserTargetInteraction,
  computerCdpIsolationStatusCopy,
  filterCdpTargetsToScope,
  isNativeWindowCaptureAvailable,
  refuseSilentTabGroupWiden,
  resolveActiveCdpTargetInScope,
  shouldAutoPauseOnUserTargetInteraction,
} from "./computer-cdp-isolation"
import {
  AN_COMPUTER_SCOPE_SURFACE,
  assignLocalWorkspaceScope,
  assignTabGroupScope,
  assignWindowScope,
  initialComputerScopeState,
} from "./computer-scope"

describe("AP-STAGE5-06 CDP isolation + native capture honesty", () => {
  test("surface pins: tab isolation on; native capture BLOCKED; ownership non-regress", () => {
    expect(AN_COMPUTER_CDP_ISOLATION_SURFACE.part).toBe("computer-cdp-isolation")
    expect(AN_COMPUTER_CDP_ISOLATION_SURFACE.browserTabGroupIsolation).toBe(true)
    expect(AN_COMPUTER_CDP_ISOLATION_SURFACE.nativeWindowCapture).toBe(false)
    expect(AN_COMPUTER_CDP_ISOLATION_SURFACE.nativeWindowCaptureStatus).toBe("BLOCKED")
    expect(AN_COMPUTER_CDP_ISOLATION_SURFACE.neverSilentRetarget).toBe(true)
    expect(isNativeWindowCaptureAvailable()).toBe(false)
    expect(AN_COMPUTER_SCOPE_SURFACE.boundaryTone).toBe("electric-gold")
    expect(AN_COMPUTER_ATTACH_SURFACE.liveOnlyWhenAttached).toBe(true)
    expect(AN_COMPUTER_FEED_SURFACE.watchOnly).toBe(true)
    expect(AN_COMPOSER_SURFACE.ownedAttr).toBe('data-an-owned="composer"')
  })

  test("native window capture attempt always BLOCKED with honest error", () => {
    const attempt = attemptNativeWindowCapture({ windowId: "win_a", processId: "pid_1" })
    expect(attempt.ok).toBe(false)
    expect(attempt.status).toBe("BLOCKED")
    expect(attempt.capability).toBe(false)
    expect(attempt.error).toMatch(/desktopCapturer|getDisplayMedia|BLOCKED|not captured/i)
  })

  test("tab-group: authorize in-allowlist; reject outsider without widen", () => {
    const scope = assignTabGroupScope(initialComputerScopeState("ses_iso"), {
      tabIds: ["tab_a", "tab_b"],
      targetName: "Mission pair",
      sessionID: "ses_iso",
    })
    expect(authorizeCdpScreencastStart(scope, "tab_a").ok).toBe(true)
    expect(authorizeCdpNavigate(scope, "tab_b").ok).toBe(true)
    const rejected = authorizeCdpRetarget(scope, "tab_other")
    expect(rejected.ok).toBe(false)
    if (!rejected.ok) {
      expect(rejected.code).toBe("unauthorized-tab")
      expect(rejected.error).toMatch(/Unauthorized tab|not widened/i)
    }
  })

  test("filter + resolve keep multi-tab allowlist; stale preferred refuses silent retarget", () => {
    const scope = assignTabGroupScope(initialComputerScopeState("ses_m"), {
      tabIds: ["keep_1", "keep_2"],
      sessionID: "ses_m",
    })
    const listed = [
      { id: "keep_1", type: "page", webSocketDebuggerUrl: "ws://127.0.0.1:9222/devtools/page/keep_1" },
      { id: "noise", type: "page", webSocketDebuggerUrl: "ws://127.0.0.1:9222/devtools/page/noise" },
      { id: "keep_2", type: "page", title: "B", webSocketDebuggerUrl: "ws://127.0.0.1:9222/devtools/page/keep_2" },
    ]
    const filtered = filterCdpTargetsToScope(scope, listed)
    expect(filtered.map((t) => t.id)).toEqual(["keep_1", "keep_2"])

    const preferred = resolveActiveCdpTargetInScope(scope, listed, "keep_2")
    expect(preferred.ok).toBe(true)
    if (preferred.ok) expect(preferred.regionId).toBe("keep_2")

    const stale = resolveActiveCdpTargetInScope(scope, listed, "keep_missing")
    expect(stale.ok).toBe(false)
    if (!stale.ok) expect(stale.code).toBe("unauthorized-tab")

    const gone = resolveActiveCdpTargetInScope(
      scope,
      [{ id: "noise", type: "page", webSocketDebuggerUrl: "ws://127.0.0.1:9222/x" }],
      "keep_1",
    )
    expect(gone.ok).toBe(false)
    if (!gone.ok) expect(gone.code).toBe("missing-target")
  })

  test("silent tab-group widen from CDP discovery refused", () => {
    const scope = assignTabGroupScope(initialComputerScopeState("ses_w"), {
      tabIds: ["only"],
      sessionID: "ses_w",
    })
    const ok = refuseSilentTabGroupWiden(scope, ["only"])
    expect(ok.ok).toBe(true)
    const widened = refuseSilentTabGroupWiden(scope, ["only", "extra"])
    expect(widened.ok).toBe(false)
    if (!widened.ok) {
      expect(widened.error).toMatch(/Can't add .*tab/i)
      expect(widened.scope.tabIds).toEqual(["only"])
    }
  })

  test("window scope CDP path is native-BLOCKED; local workspace refuses external region", () => {
    const win = assignWindowScope(initialComputerScopeState("ses_win"), {
      windowId: "win_doc",
      processId: "pid_9",
      sessionID: "ses_win",
    })
    const blocked = authorizeCdpRegionAction(win, "any_region")
    expect(blocked.ok).toBe(false)
    if (!blocked.ok) {
      expect(blocked.code).toBe("native-blocked")
      expect(blocked.error).toMatch(/desktopCapturer|getDisplayMedia|not captured/i)
    }
    expect(computerCdpIsolationStatusCopy(win)).toMatch(/not available yet/i)

    const local = assignLocalWorkspaceScope(initialComputerScopeState("ses_loc"), {
      sessionID: "ses_loc",
    })
    const refused = authorizeCdpNavigate(local, "PAGE_1")
    expect(refused.ok).toBe(false)
    if (!refused.ok) expect(refused.code).toBe("unauthorized-tab")
  })

  test("auto-pause on user target interaction while bot drives (not Takeover grant)", () => {
    const driving = syncComputerControl(initialComputerControlState("ses_p"), {
      live: true,
      mode: "view",
      sessionID: "ses_p",
    })
    expect(botMayDrive(driving)).toBe(true)
    expect(shouldAutoPauseOnUserTargetInteraction(true, driving)).toBe(true)
    const paused = autoPauseOnUserTargetInteraction(driving, true)
    expect(paused.botPaused).toBe(true)
    expect(botMayDrive(paused)).toBe(false)
    expect(paused.userInputGranted).toBe(false)

    const takeover = syncComputerControl(driving, { live: true, mode: "takeover", sessionID: "ses_p" })
    expect(shouldAutoPauseOnUserTargetInteraction(true, takeover)).toBe(false)
    expect(autoPauseOnUserTargetInteraction(takeover, true)).toEqual(takeover)

    const already = pauseBot(driving, true)
    expect(shouldAutoPauseOnUserTargetInteraction(true, already)).toBe(false)
  })
})
