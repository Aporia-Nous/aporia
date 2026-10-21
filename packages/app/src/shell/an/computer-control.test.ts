import { describe, expect, test } from "bun:test"
import {
  AN_COMPOSER_SURFACE,
  AN_COMPUTER_ATTACH_SURFACE,
  AN_COMPUTER_FEED_SURFACE,
} from "./tokens"
import {
  AN_COMPUTER_CONTROL_SURFACE,
  ackFreshObservation,
  acquireUserControl,
  botMayDrive,
  clearComputerControl,
  computerControlBannerCopy,
  feedIsWatchOnly,
  initialComputerControlState,
  isBotCursorShown,
  pauseBot,
  releaseToBot,
  resolveComputerControllerBotName,
  resumeBot,
  stopUserControl,
  syncComputerControl,
  userMayInput,
} from "./computer-control"
import {
  beginComputerConsent,
  confirmComputerAttach,
  initialComputerAttachState,
  isComputerLive,
  selectComputerAttachPath,
  setExternalAttachDraft,
} from "./computer-attach"

describe("AP-BF-03 computer control lock", () => {
  test("surface markers + non-regress BF-01/02 / STAGE4-12 ownership pins", () => {
    expect(AN_COMPUTER_CONTROL_SURFACE.part).toBe("computer-control")
    expect(AN_COMPUTER_CONTROL_SURFACE.singleController).toBe(true)
    expect(AN_COMPUTER_ATTACH_SURFACE.liveOnlyWhenAttached).toBe(true)
    expect(AN_COMPUTER_FEED_SURFACE.watchOnly).toBe(true)
    expect(AN_COMPUTER_FEED_SURFACE.includeCursorInCapture).toBe(false)
    expect(AN_COMPOSER_SURFACE.ownedAttr).toBe('data-an-owned="composer"')
  })

  test("without Live, Takeover never grants user input", () => {
    const attach = initialComputerAttachState("ses_1")
    expect(isComputerLive(attach)).toBe(false)
    const refused = acquireUserControl(initialComputerControlState("ses_1"), false)
    expect(userMayInput(refused)).toBe(false)
    expect(feedIsWatchOnly(refused)).toBe(true)

    const synced = syncComputerControl(initialComputerControlState("ses_1"), {
      live: false,
      mode: "takeover",
      sessionID: "ses_1",
    })
    expect(synced.controller).toBe("none")
    expect(userMayInput(synced)).toBe(false)
    expect(computerControlBannerCopy(false, synced).pill).toBe("Takeover chrome")
  })

  test("Live View keeps watch-only; Live Takeover grants user and pauses bot", () => {
    const live = isComputerLive(
      confirmComputerAttach(beginComputerConsent(initialComputerAttachState("ses_1"))),
    )
    expect(live).toBe(true)

    const view = syncComputerControl(initialComputerControlState("ses_1"), {
      live: true,
      mode: "view",
      sessionID: "ses_1",
    })
    expect(view.controller).toBe("bot")
    expect(botMayDrive(view)).toBe(true)
    expect(userMayInput(view)).toBe(false)
    expect(feedIsWatchOnly(view)).toBe(true)
    expect(isBotCursorShown(true, view)).toBe(true)

    const takeover = syncComputerControl(view, {
      live: true,
      mode: "takeover",
      sessionID: "ses_1",
    })
    expect(takeover.controller).toBe("user")
    expect(takeover.botPaused).toBe(true)
    expect(userMayInput(takeover)).toBe(true)
    expect(botMayDrive(takeover)).toBe(false)
    expect(feedIsWatchOnly(takeover)).toBe(false)
    expect(isBotCursorShown(true, takeover)).toBe(false)
    expect(computerControlBannerCopy(true, takeover).pill).toBe("You are controlling")
    expect(
      computerControlBannerCopy(true, takeover, { botName: "Grok", targetName: "Local browser workspace" })
        .copy,
    ).toBe("You are controlling · Bot paused · Local browser workspace")
    const watch = syncComputerControl(initialComputerControlState("ses_1"), {
      live: true,
      mode: "view",
      sessionID: "ses_1",
    })
    expect(
      computerControlBannerCopy(true, watch, { botName: "Grok", targetName: "Local browser workspace" })
        .copy,
    ).toBe("Grok is controlling · Local browser workspace")
  })

  test("external Chromium Live still honors Takeover lock (AP-BF-04)", () => {
    let attach = beginComputerConsent(initialComputerAttachState("ses_ext"))
    attach = selectComputerAttachPath(attach, "external-chromium")
    attach = setExternalAttachDraft(attach, {
      family: "edge",
      endpoint: "http://127.0.0.1:9222",
      region: "REGION_1",
    })
    attach = confirmComputerAttach(attach)
    expect(isComputerLive(attach)).toBe(true)
    expect(AN_COMPUTER_ATTACH_SURFACE.paths).toContain("external-chromium")

    const takeover = syncComputerControl(initialComputerControlState("ses_ext"), {
      live: true,
      mode: "takeover",
      sessionID: "ses_ext",
    })
    expect(userMayInput(takeover)).toBe(true)
    expect(isBotCursorShown(true, takeover)).toBe(false)
    expect(releaseToBot(takeover, true).needsFreshObservation).toBe(true)
  })

  test("Hand back / Stop restore bot lock + fresh observation; disconnect clears", () => {
    let state = syncComputerControl(initialComputerControlState("ses_1"), {
      live: true,
      mode: "takeover",
      sessionID: "ses_1",
    })
    state = releaseToBot(state, true)
    expect(state.controller).toBe("bot")
    expect(userMayInput(state)).toBe(false)
    expect(feedIsWatchOnly(state)).toBe(true)
    expect(state.needsFreshObservation).toBe(true)

    state = ackFreshObservation(state)
    expect(state.needsFreshObservation).toBe(false)

    state = syncComputerControl(state, { live: true, mode: "takeover", sessionID: "ses_1" })
    state = stopUserControl(state, true)
    expect(state.controller).toBe("bot")
    expect(state.needsFreshObservation).toBe(true)

    state = clearComputerControl("ses_1")
    expect(state.controller).toBe("none")
    expect(userMayInput(state)).toBe(false)
  })

  test("AP-STAGE5-05 Pause / Resume without granting user input; sync preserves pause", () => {
    let state = syncComputerControl(initialComputerControlState("ses_p"), {
      live: true,
      mode: "view",
      sessionID: "ses_p",
    })
    expect(botMayDrive(state)).toBe(true)
    expect(isBotCursorShown(true, state)).toBe(true)

    state = pauseBot(state, true)
    expect(state.controller).toBe("bot")
    expect(state.botPaused).toBe(true)
    expect(userMayInput(state)).toBe(false)
    expect(botMayDrive(state)).toBe(false)
    expect(feedIsWatchOnly(state)).toBe(true)
    expect(isBotCursorShown(true, state)).toBe(false)
    expect(
      computerControlBannerCopy(true, state, { botName: "Grok", targetName: "Local browser workspace" })
        .copy,
    ).toBe("Grok paused · Local browser workspace")

    state = syncComputerControl(state, { live: true, mode: "view", sessionID: "ses_p" })
    expect(state.botPaused).toBe(true)
    expect(botMayDrive(state)).toBe(false)

    state = resumeBot(state, true)
    expect(state.botPaused).toBe(false)
    expect(botMayDrive(state)).toBe(true)
    expect(isBotCursorShown(true, state)).toBe(true)

    const takeover = syncComputerControl(state, { live: true, mode: "takeover", sessionID: "ses_p" })
    const resumeBlocked = resumeBot(takeover, true)
    expect(userMayInput(resumeBlocked)).toBe(true)
    expect(resumeBlocked.error).toMatch(/Hand back/i)
  })

  test("AP-STAGE5-05 resolveComputerControllerBotName prefers roster then agent slug", () => {
    expect(resolveComputerControllerBotName({ rosterName: "Grok", currentAgent: "aporia-other" })).toBe(
      "Grok",
    )
    expect(resolveComputerControllerBotName({ currentAgent: "aporia-builder" })).toBe("Builder")
    expect(resolveComputerControllerBotName({ currentAgent: "aporia-dev-bot" })).toBe("Dev Bot")
    expect(resolveComputerControllerBotName({})).toBe("Bot")
  })
})
