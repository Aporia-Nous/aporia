import { describe, expect, test } from "bun:test"
import {
  AN_DESIGN_SOURCE,
  AN_SHELL_MODES,
  AN_TOKENS,
  anShellModeLabel,
  isAnShellMode,
  presenceDotClass,
} from "./tokens"
import { assertApprovedModesOnly, buildAnShellModel } from "./shell-model"

describe("AN Stage 4 tokens", () => {
  test("gold/ink match approved v11 packet values", () => {
    expect(AN_TOKENS.gold).toBe("#f0c66d")
    expect(AN_TOKENS.goldDeep).toBe("#d79a2e")
    expect(AN_TOKENS.green).toBe("#3be78c")
    expect(AN_TOKENS.ink).toBe("#03070b")
    expect(AN_TOKENS.void).toBe("#020509")
    expect(AN_TOKENS.themeId).toBe("an")
  })

  test("design source points at approved packet, not replacement", () => {
    expect(AN_DESIGN_SOURCE.html).toContain("aporetic-an-exact-flow-v11")
    expect(AN_DESIGN_SOURCE.style).toContain("original-AN-visual-style")
    expect(AN_DESIGN_SOURCE.normal).toContain("original-normal")
    expect(JSON.stringify(AN_DESIGN_SOURCE)).not.toContain("replacement")
    expect(JSON.stringify(AN_DESIGN_SOURCE)).not.toContain("Lagoon")
  })

  test("shell modes stay on approved three-state framing", () => {
    expect([...assertApprovedModesOnly()]).toEqual(["conversation", "view", "takeover"])
    expect(AN_SHELL_MODES).toHaveLength(3)
    expect(isAnShellMode("conversation")).toBe(true)
    expect(isAnShellMode("status")).toBe(false)
    expect(isAnShellMode("inline")).toBe(false)
    expect(anShellModeLabel("view")).toBe("View")
  })

  test("presence classes never invent a fourth mode token", () => {
    expect(presenceDotClass("working")).toContain("an-presence-working")
    expect(presenceDotClass("unknown")).toContain("an-presence-unknown")
  })
})

describe("AN shell model", () => {
  test("regions match Stage 4 rails", () => {
    const model = buildAnShellModel({})
    expect(model.regions).toEqual(["nav", "roster", "mission", "stream", "attention"])
    expect(model.mode).toBe("conversation")
    expect(model.mission.title).toBe("Mission")
    expect(model.mission.progressPercent).toBeUndefined()
  })

  test("clamps real progress and rejects unknown mode ids", () => {
    const model = buildAnShellModel({
      mode: "inline",
      mission: { title: " Build knowledge ", progressPercent: 140 },
      roster: [{ id: "1", name: "Orion", role: "Lead", presence: "unknown" }],
      attention: [{ id: "a1", title: "Approval needed" }],
    })
    expect(model.mode).toBe("conversation")
    expect(model.mission.title).toBe("Build knowledge")
    expect(model.mission.progressPercent).toBe(100)
    expect(model.roster[0]?.presence).toBe("unknown")
    expect(model.attention).toHaveLength(1)
  })
})
