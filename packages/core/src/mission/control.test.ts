import { describe, expect, test } from "bun:test"
import {
  ackFreshObservation,
  acquireUserControl,
  botMayDrive,
  clearComputerControl,
  feedIsWatchOnly,
  initialComputerControlState,
  releaseToBot,
  stopUserControl,
  syncComputerControl,
  userMayInput,
} from "./control"

describe("AP-BF-03 mission control lock", () => {
  test("starts with no controller and watch-only feed", () => {
    const state = initialComputerControlState("ses_1")
    expect(state.controller).toBe("none")
    expect(botMayDrive(state)).toBe(false)
    expect(userMayInput(state)).toBe(false)
    expect(feedIsWatchOnly(state)).toBe(true)
  })

  test("Live + view gives bot lock without user input", () => {
    const state = syncComputerControl(initialComputerControlState("ses_1"), {
      live: true,
      mode: "view",
      sessionID: "ses_1",
    })
    expect(state.controller).toBe("bot")
    expect(botMayDrive(state)).toBe(true)
    expect(userMayInput(state)).toBe(false)
    expect(feedIsWatchOnly(state)).toBe(true)
    expect(state.botPaused).toBe(false)
  })

  test("Live + takeover grants user and pauses bot", () => {
    const state = syncComputerControl(initialComputerControlState("ses_1"), {
      live: true,
      mode: "takeover",
      sessionID: "ses_1",
    })
    expect(state.controller).toBe("user")
    expect(state.botPaused).toBe(true)
    expect(userMayInput(state)).toBe(true)
    expect(botMayDrive(state)).toBe(false)
    expect(feedIsWatchOnly(state)).toBe(false)
  })

  test("Takeover without Live refuses user input", () => {
    const refused = acquireUserControl(initialComputerControlState("ses_1"), false)
    expect(refused.controller).toBe("none")
    expect(userMayInput(refused)).toBe(false)
    expect(refused.error).toMatch(/Live/i)

    const chromeOnly = syncComputerControl(initialComputerControlState("ses_1"), {
      live: false,
      mode: "takeover",
      sessionID: "ses_1",
    })
    expect(chromeOnly.controller).toBe("none")
    expect(userMayInput(chromeOnly)).toBe(false)
  })

  test("Hand back / Stop return bot lock and require fresh observation", () => {
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
    expect(botMayDrive(state)).toBe(true)

    state = ackFreshObservation(state)
    expect(state.needsFreshObservation).toBe(false)

    state = syncComputerControl(state, { live: true, mode: "takeover", sessionID: "ses_1" })
    state = stopUserControl(state, true)
    expect(state.controller).toBe("bot")
    expect(state.needsFreshObservation).toBe(true)

    // Mode leave Takeover → View also requires fresh observation (sync path).
    state = syncComputerControl(state, { live: true, mode: "takeover", sessionID: "ses_1" })
    state = syncComputerControl(state, { live: true, mode: "view", sessionID: "ses_1" })
    expect(state.controller).toBe("bot")
    expect(state.needsFreshObservation).toBe(true)
  })

  test("disconnect clears lock; not Live never invents control", () => {
    let state = syncComputerControl(initialComputerControlState("ses_1"), {
      live: true,
      mode: "takeover",
      sessionID: "ses_1",
    })
    expect(userMayInput(state)).toBe(true)
    state = clearComputerControl("ses_1")
    expect(state.controller).toBe("none")
    expect(userMayInput(state)).toBe(false)

    state = syncComputerControl(state, { live: false, mode: "view", sessionID: "ses_1" })
    expect(state.controller).toBe("none")
    expect(botMayDrive(state)).toBe(false)
  })
})
