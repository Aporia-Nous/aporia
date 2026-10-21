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
import { AN_COMPUTER_CDP_ISOLATION_SURFACE, attemptNativeWindowCapture } from "./computer-cdp-isolation"
import {
  AN_COMPUTER_OS_POINTER_PAUSE_SURFACE,
  applyOsPointerAutoPause,
  mapCdpKindsToPauseKinds,
  parseCdpPageInteractionProbe,
  shouldApplyComputerChromeAutoPause,
  shouldApplyExternalPageAutoPause,
} from "./computer-os-pointer-pause"

describe("AP-STAGE5-07 OS-pointer / CDP focus auto-pause", () => {
  test("surface pins: chrome+cdp page pause on; global OS hook unsupported; native still BLOCKED", () => {
    expect(AN_COMPUTER_OS_POINTER_PAUSE_SURFACE.part).toBe("computer-os-pointer-pause")
    expect(AN_COMPUTER_OS_POINTER_PAUSE_SURFACE.computerChromeAutoPause).toBe(true)
    expect(AN_COMPUTER_OS_POINTER_PAUSE_SURFACE.cdpPageAutoPause).toBe(true)
    expect(AN_COMPUTER_OS_POINTER_PAUSE_SURFACE.feedGoAutoPause).toBe(true)
    expect(AN_COMPUTER_OS_POINTER_PAUSE_SURFACE.globalOsPointerHook).toBe(false)
    expect(AN_COMPUTER_OS_POINTER_PAUSE_SURFACE.globalOsPointerHookStatus).toBe("UNSUPPORTED")
    expect(AN_COMPUTER_OS_POINTER_PAUSE_SURFACE.neverGrantsTakeoverInput).toBe(true)
    expect(AN_COMPUTER_CDP_ISOLATION_SURFACE.nativeWindowCapture).toBe(false)
    expect(attemptNativeWindowCapture().status).toBe("BLOCKED")
    expect(AN_COMPUTER_ATTACH_SURFACE.liveOnlyWhenAttached).toBe(true)
    expect(AN_COMPUTER_FEED_SURFACE.watchOnly).toBe(true)
    expect(AN_COMPOSER_SURFACE.ownedAttr).toBe('data-an-owned="composer"')
  })

  test("chrome pointer/focus auto-pause while bot drives; not during Takeover; no input grant", () => {
    const driving = syncComputerControl(initialComputerControlState("ses_os"), {
      live: true,
      mode: "view",
      sessionID: "ses_os",
    })
    expect(botMayDrive(driving)).toBe(true)
    expect(shouldApplyComputerChromeAutoPause(true, driving)).toBe(true)
    const paused = applyOsPointerAutoPause(driving, true)
    expect(paused.botPaused).toBe(true)
    expect(paused.userInputGranted).toBe(false)
    expect(botMayDrive(paused)).toBe(false)

    const takeover = syncComputerControl(driving, { live: true, mode: "takeover", sessionID: "ses_os" })
    expect(shouldApplyComputerChromeAutoPause(true, takeover)).toBe(false)
    expect(applyOsPointerAutoPause(takeover, true)).toEqual(takeover)

    const already = pauseBot(driving, true)
    expect(shouldApplyComputerChromeAutoPause(true, already)).toBe(false)
  })

  test("external page: focus-gain always; pointer/key only when Aporetic blurred", () => {
    const driving = syncComputerControl(initialComputerControlState("ses_ext"), {
      live: true,
      mode: "view",
      sessionID: "ses_ext",
    })

    expect(
      shouldApplyExternalPageAutoPause({
        live: true,
        control: driving,
        aporeticWindowFocused: true,
        page: { ok: true, installed: true, hit: true, kinds: ["focus"] },
      }),
    ).toBe(true)

    expect(
      shouldApplyExternalPageAutoPause({
        live: true,
        control: driving,
        aporeticWindowFocused: true,
        page: { ok: true, installed: true, hit: true, kinds: ["pointer"] },
      }),
    ).toBe(false)

    expect(
      shouldApplyExternalPageAutoPause({
        live: true,
        control: driving,
        aporeticWindowFocused: false,
        page: { ok: true, installed: true, hit: true, kinds: ["pointer"] },
      }),
    ).toBe(true)

    expect(
      shouldApplyExternalPageAutoPause({
        live: true,
        control: driving,
        aporeticWindowFocused: false,
        page: { ok: true, installed: true, hit: true, kinds: ["key"] },
      }),
    ).toBe(true)

    expect(
      shouldApplyExternalPageAutoPause({
        live: true,
        control: driving,
        aporeticWindowFocused: false,
        page: { ok: true, installed: true, hit: false, kinds: [] },
      }),
    ).toBe(false)

    const takeover = syncComputerControl(driving, { live: true, mode: "takeover", sessionID: "ses_ext" })
    expect(
      shouldApplyExternalPageAutoPause({
        live: true,
        control: takeover,
        aporeticWindowFocused: false,
        page: { ok: true, installed: true, hit: true, kinds: ["pointer", "focus"] },
      }),
    ).toBe(false)
  })

  test("parse probe + map kinds", () => {
    expect(parseCdpPageInteractionProbe(null).hit).toBe(false)
    const parsed = parseCdpPageInteractionProbe({
      ok: true,
      installed: true,
      hit: true,
      kinds: ["pointer", "focus", "noise"],
    })
    expect(parsed.ok).toBe(true)
    expect(parsed.kinds).toEqual(["pointer", "focus"])
    expect(mapCdpKindsToPauseKinds(parsed.kinds)).toEqual(["cdp-pointer", "cdp-focus"])
  })
})
