import { describe, expect, test } from "bun:test"
import {
  AN_COMPUTER_ATTACH_SURFACE,
  beginComputerConsent,
  cancelComputerConsent,
  computerAttachEmptyCopy,
  computerAttachPathLabel,
  confirmComputerAttach,
  disconnectComputerAttach,
  initialComputerAttachState,
  isComputerCursorVisible,
  isComputerLive,
  rescopeComputerAttach,
  selectComputerAttachPath,
  setExternalAttachDraft,
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

  test("external Edge/Chrome path requires loopback endpoint + region (AP-BF-04)", () => {
    let state = beginComputerConsent(initialComputerAttachState("ses_1"))
    state = selectComputerAttachPath(state, "external-chromium")
    expect(state.path).toBe("external-chromium")
    expect(isComputerLive(state)).toBe(false)

    state = setExternalAttachDraft(state, {
      family: "edge",
      endpoint: "http://127.0.0.1:9222",
      region: "",
    })
    state = confirmComputerAttach(state)
    expect(isComputerLive(state)).toBe(false)
    expect(state.error).toMatch(/region/i)

    state = setExternalAttachDraft(state, { region: "TARGET_A1" })
    state = confirmComputerAttach(state)
    expect(state.phase).toBe("attached")
    expect(state.backend).toBe("external-chromium")
    expect(state.externalEndpoint).toBe("http://127.0.0.1:9222")
    expect(state.externalRegionId).toBe("TARGET_A1")
    expect(isComputerLive(state)).toBe(true)
    expect(computerAttachPathLabel(state)).toContain("Edge")
    expect(computerAttachEmptyCopy(state)).toMatch(/region attached/i)
  })

  test("external path rejects non-loopback hosts", () => {
    let state = beginComputerConsent(initialComputerAttachState("ses_1"))
    state = selectComputerAttachPath(state, "external-chromium")
    state = setExternalAttachDraft(state, {
      family: "chrome",
      endpoint: "http://8.8.8.8:9222",
      region: "TAB1",
    })
    state = confirmComputerAttach(state)
    expect(isComputerLive(state)).toBe(false)
    expect(state.error).toMatch(/local-only|127\.0\.0\.1|localhost/i)
  })

  test("local path still attaches without external fields", () => {
    let state = beginComputerConsent(initialComputerAttachState("ses_1"))
    state = selectComputerAttachPath(state, "local-browser")
    state = confirmComputerAttach(state)
    expect(state.backend).toBe("local-browser")
    expect(state.externalEndpoint).toBeUndefined()
    expect(isComputerLive(state)).toBe(true)
  })
})
