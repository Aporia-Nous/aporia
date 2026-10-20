import { describe, expect, test } from "bun:test"
import {
  beginComputerConsent,
  confirmComputerAttach,
  initialComputerAttachState,
  isComputerLive,
  selectComputerAttachPath,
  setExternalAttachDraft,
} from "./computer-attach"
import {
  AN_COMPUTER_SCOPE_SURFACE,
  assignLocalWorkspaceScope,
  assignTabGroupScope,
  assignWindowScope,
  authorizeTabAction,
  authorizeWindowAction,
  clearComputerScope,
  computerScopeBannerCopy,
  computerScopeKindLabel,
  computerScopeTargetLabel,
  hasComputerScope,
  initialComputerScopeState,
  isComputerBoundaryVisible,
  isTabAuthorized,
  isWindowAuthorized,
  openPreviewPreservingScope,
  rescopeComputerScope,
  switchModePreservingScope,
  syncComputerScopeFromAttach,
} from "./computer-scope"
import { AN_TOKENS } from "./tokens"

describe("AP-STAGE5-04 computer scope axis + gold boundary", () => {
  test("surface pins: scope ≠ mode; preview never widens; electric gold", () => {
    expect(AN_COMPUTER_SCOPE_SURFACE.part).toBe("computer-scope")
    expect(AN_COMPUTER_SCOPE_SURFACE.boundaryTone).toBe("electric-gold")
    expect(AN_COMPUTER_SCOPE_SURFACE.previewNeverWidensScope).toBe(true)
    expect(AN_COMPUTER_SCOPE_SURFACE.previewNeverGrantsInput).toBe(true)
    expect(AN_COMPUTER_SCOPE_SURFACE.kinds).toContain("tab-group")
    expect(AN_COMPUTER_SCOPE_SURFACE.kinds).toContain("window")
    expect(AN_TOKENS.gold).toBe("#f0c66d")
  })

  test("tab-group authorize / reject unassigned tabs", () => {
    let scope = assignTabGroupScope(initialComputerScopeState("ses_a"), {
      tabIds: ["tab_1", "tab_2"],
      targetName: "Mission tabs",
      sessionID: "ses_a",
    })
    expect(hasComputerScope(scope)).toBe(true)
    expect(isTabAuthorized(scope, "tab_1")).toBe(true)
    expect(authorizeTabAction(scope, "tab_2").ok).toBe(true)
    const rejected = authorizeTabAction(scope, "tab_other")
    expect(rejected.ok).toBe(false)
    if (!rejected.ok) expect(rejected.error).toMatch(/Unauthorized tab/)
    expect(isWindowAuthorized(scope, "win_1")).toBe(false)
  })

  test("window scope rejects second window; empty assign fails honestly", () => {
    const empty = assignWindowScope(initialComputerScopeState(), { windowId: "  " })
    expect(hasComputerScope(empty)).toBe(false)
    expect(empty.error).toMatch(/window identity/)

    const scope = assignWindowScope(initialComputerScopeState("ses_b"), {
      windowId: "win_doc_a",
      processId: "pid_9",
      targetName: "DEV editor",
      sessionID: "ses_b",
    })
    expect(authorizeWindowAction(scope, "win_doc_a").ok).toBe(true)
    const other = authorizeWindowAction(scope, "win_doc_b")
    expect(other.ok).toBe(false)
    if (!other.ok) expect(other.error).toMatch(/Unauthorized window/)
    expect(isTabAuthorized(scope, "tab_1")).toBe(false)
  })

  test("opening preview / mode switch never mutates scope", () => {
    const scope = assignTabGroupScope(initialComputerScopeState("ses_c"), {
      tabIds: ["a"],
      targetName: "Fixed",
      sessionID: "ses_c",
    })
    expect(openPreviewPreservingScope(scope)).toEqual(scope)
    expect(switchModePreservingScope(scope)).toEqual(scope)
    expect(computerScopeTargetLabel(scope)).toBe("Fixed")
    expect(computerScopeKindLabel("tab-group")).toBe("Tab group")
  })

  test("session rescope clears; Live attach syncs local or region tab-group", () => {
    let scope = assignLocalWorkspaceScope(initialComputerScopeState("ses_1"), {
      sessionID: "ses_1",
    })
    scope = rescopeComputerScope(scope, "ses_2")
    expect(scope.kind).toBe("none")
    expect(scope.sessionID).toBe("ses_2")

    let attach = beginComputerConsent(initialComputerAttachState("ses_2"))
    attach = confirmComputerAttach(attach)
    expect(isComputerLive(attach)).toBe(true)
    scope = syncComputerScopeFromAttach(scope, attach, "ses_2")
    expect(scope.kind).toBe("local-workspace")
    expect(isComputerBoundaryVisible(true, scope)).toBe(true)
    expect(isComputerBoundaryVisible(false, scope)).toBe(false)

    attach = beginComputerConsent(initialComputerAttachState("ses_2"))
    attach = selectComputerAttachPath(attach, "external-chromium")
    attach = setExternalAttachDraft(attach, {
      endpoint: "http://127.0.0.1:9222",
      region: "REGION_OK",
      family: "edge",
    })
    attach = confirmComputerAttach(attach)
    expect(isComputerLive(attach)).toBe(true)
    scope = syncComputerScopeFromAttach(clearComputerScope("ses_2"), attach, "ses_2")
    expect(scope.kind).toBe("tab-group")
    expect(isTabAuthorized(scope, "REGION_OK")).toBe(true)
    expect(authorizeTabAction(scope, "OTHER").ok).toBe(false)
  })

  test("handoff H banner: bot controlling / you controlling · target", () => {
    const scope = assignLocalWorkspaceScope(initialComputerScopeState("ses_x"), {
      targetName: "Local browser workspace",
      sessionID: "ses_x",
    })
    const bot = computerScopeBannerCopy({
      live: true,
      userControl: false,
      botName: "Grok",
      scope,
    })
    expect(bot.line).toBe("Grok is controlling · Local browser workspace")
    expect(bot.pill).toMatch(/Grok is controlling/)

    const paused = computerScopeBannerCopy({
      live: true,
      userControl: false,
      botPaused: true,
      botName: "Grok",
      scope,
    })
    expect(paused.line).toBe("Grok paused · Local browser workspace")
    expect(paused.pill).toBe("Grok paused")

    const you = computerScopeBannerCopy({
      live: true,
      userControl: true,
      botName: "Grok",
      scope,
    })
    expect(you.line).toBe("You are controlling · Bot paused · Local browser workspace")
    expect(you.pill).toBe("You are controlling")
  })
})
