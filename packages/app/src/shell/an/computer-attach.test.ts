import { describe, expect, test } from "bun:test"
import {
  AN_COMPUTER_ATTACH_SURFACE,
  beginComputerConsent,
  cancelComputerConsent,
  computerAttachEmptyCopy,
  confirmComputerAttach,
  disconnectComputerAttach,
  initialComputerAttachState,
  isComputerCursorVisible,
  isComputerLive,
  rescopeComputerAttach,
} from "./computer-attach"
import { AN_COMPOSER_SURFACE } from "./tokens"

describe("AP-BF-01 computer attach", () => {
  test("surface markers stay browser-first (not VM)", () => {
    expect(AN_COMPUTER_ATTACH_SURFACE.backend).toBe("local-browser")
    expect(AN_COMPUTER_ATTACH_SURFACE.pathLabel).toContain("Edge/Chrome")
    expect(AN_COMPUTER_ATTACH_SURFACE.liveOnlyWhenAttached).toBe(true)
    expect(AN_COMPUTER_ATTACH_SURFACE.partAttr).toBe('data-an-part="computer-attach"')
    // STAGE4-12 ownership must remain untouched by BF-01 markers
    expect(AN_COMPOSER_SURFACE.ownedAttr).toBe('data-an-owned="composer"')
  })

  test("computerLive false until consented attach", () => {
    let state = initialComputerAttachState("ses_1")
    expect(isComputerLive(state)).toBe(false)
    expect(isComputerCursorVisible(state)).toBe(false)

    state = beginComputerConsent(state)
    expect(state.phase).toBe("consenting")
    expect(isComputerLive(state)).toBe(false)

    state = confirmComputerAttach(state)
    expect(state.phase).toBe("attached")
    expect(state.consented).toBe(true)
    expect(state.backend).toBe("local-browser")
    expect(isComputerLive(state)).toBe(true)
    expect(isComputerCursorVisible(state)).toBe(true)
    expect(computerAttachEmptyCopy(state)).toContain("attached")
  })

  test("disconnect clears Live and cursor", () => {
    let state = confirmComputerAttach(beginComputerConsent(initialComputerAttachState("ses_1")))
    expect(isComputerLive(state)).toBe(true)
    state = disconnectComputerAttach(state)
    expect(state.phase).toBe("disconnected")
    expect(state.consented).toBe(false)
    expect(isComputerLive(state)).toBe(false)
    expect(isComputerCursorVisible(state)).toBe(false)
  })

  test("cancel consent returns to disconnected", () => {
    let state = beginComputerConsent(initialComputerAttachState("ses_1"))
    state = cancelComputerConsent(state)
    expect(state.phase).toBe("disconnected")
    expect(isComputerLive(state)).toBe(false)
  })

  test("home/draft cannot attach without session", () => {
    let state = beginComputerConsent(initialComputerAttachState(undefined))
    expect(state.phase).toBe("disconnected")
    expect(state.error).toMatch(/session/i)
    expect(isComputerLive(state)).toBe(false)
  })

  test("rescope clears Live across sessions", () => {
    let state = confirmComputerAttach(beginComputerConsent(initialComputerAttachState("ses_a")))
    expect(isComputerLive(state)).toBe(true)
    state = rescopeComputerAttach(state, "ses_b")
    expect(state.sessionID).toBe("ses_b")
    expect(isComputerLive(state)).toBe(false)
  })

  test("rescope keeps Live for the same session", () => {
    let state = confirmComputerAttach(beginComputerConsent(initialComputerAttachState("ses_a")))
    state = rescopeComputerAttach(state, "ses_a")
    expect(isComputerLive(state)).toBe(true)
    expect(state.sessionID).toBe("ses_a")
  })
})
