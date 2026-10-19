import { describe, expect, test } from "bun:test"
import {
  AN_COMPOSER_SURFACE,
  AN_COMPUTER_ATTACH_SURFACE,
  AN_CONTRAPTIONS_SURFACE,
  AN_DESIGN_SOURCE,
  AN_PRODUCT_BYLINE,
  AN_PRODUCT_NAME,
  AN_SHELL_MODES,
  AN_TOKENS,
  anShellLayout,
  anShellModeLabel,
  isAnShellMode,
  presenceDotClass,
} from "./tokens"
import { assertApprovedModesOnly, buildAnShellModel } from "./shell-model"

describe("AN Stage 4 tokens", () => {
  test("product name is Aporetic; company byline is ownership form only", () => {
    expect(AN_PRODUCT_NAME).toBe("Aporetic")
    expect(AN_PRODUCT_BYLINE).toBe("by Aporia Nous")
    expect(AN_PRODUCT_NAME).not.toBe("Aporia Nous")
  })

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
    expect(anShellModeLabel("view")).toBe("Computer View")
    expect(anShellModeLabel("conversation")).toBe("Conversation")
    expect(anShellModeLabel("takeover")).toBe("Takeover")
  })

  test("presence classes cover design set without inventing modes", () => {
    expect(presenceDotClass("listening")).toContain("an-presence-listening")
    expect(presenceDotClass("thinking")).toContain("an-presence-thinking")
    expect(presenceDotClass("speaking")).toContain("an-presence-speaking")
    expect(presenceDotClass("working")).toContain("an-presence-working")
    expect(presenceDotClass("waiting")).toContain("an-presence-waiting")
    expect(presenceDotClass("unknown")).toContain("an-presence-unknown")
  })

  test("composer surface pins void fill and gold send/focus (AP-STAGE4-03)", () => {
    expect(AN_COMPOSER_SURFACE.fill).toBe("#020509")
    expect(AN_COMPOSER_SURFACE.fill).toBe(AN_TOKENS.void)
    expect(AN_COMPOSER_SURFACE.send).toBe("#d79a2e")
    expect(AN_COMPOSER_SURFACE.send).toBe(AN_TOKENS.goldDeep)
    expect(AN_COMPOSER_SURFACE.sendHover).toBe("#f0c66d")
    expect(AN_COMPOSER_SURFACE.focusGold).toBe(AN_TOKENS.gold)
    expect([...AN_COMPOSER_SURFACE.hosts]).toEqual([
      '[data-component="an-shell"]',
      '[data-an-theme="an"]',
    ])
    // Must not resurrect navy/indigo OpenCode composer samples from DESIGN-GAPS.md
    expect(AN_COMPOSER_SURFACE.fill.toLowerCase()).not.toBe("#121b37")
    expect(AN_COMPOSER_SURFACE.fill.toLowerCase()).not.toBe("#151e3e")
  })

  test("glass panel tokens are ice-translucent (AP-STAGE4-08)", () => {
    expect(AN_TOKENS.panel).toContain("0.44")
    expect(AN_TOKENS.panelRaised).toContain("0.52")
    expect(AN_TOKENS.panelGlass).toContain("0.32")
    expect(AN_TOKENS.glow).toContain("0.22")
    expect(AN_TOKENS.feel).toBe("frictionless-ice-glass")
    // Cooler ice depth — not Lagoon Night theme swap; gold/void stay AN
    expect(AN_TOKENS.panel).toContain("6, 14, 22")
    expect(AN_TOKENS.gold).toBe("#f0c66d")
    expect(AN_TOKENS.void).toBe("#020509")
  })

  test("session dock ease token present (AP-STAGE4-09)", () => {
    expect(AN_TOKENS.easeDock).toContain("320ms")
    expect(AN_TOKENS.easeDock).toContain("cubic-bezier")
    expect(AN_COMPOSER_SURFACE.fill).toBe("#020509")
    expect(AN_COMPOSER_SURFACE.send).toBe("#d79a2e")
  })

  test("AnShell owns composer dock presentation marker (AP-STAGE4-12)", () => {
    expect(AN_COMPOSER_SURFACE.ownedValue).toBe("composer")
    expect(AN_COMPOSER_SURFACE.ownedAttr).toBe('data-an-owned="composer"')
    expect([...AN_COMPOSER_SURFACE.hosts]).toContain('[data-component="an-shell"]')
    expect(AN_COMPOSER_SURFACE.fill).toBe(AN_TOKENS.void)
    expect(AN_COMPOSER_SURFACE.send).toBe(AN_TOKENS.goldDeep)
  })

  test("Contraptions mount surface markers (AP-STAGE4-4E)", () => {
    expect(AN_CONTRAPTIONS_SURFACE.navId).toBe("contraptions")
    expect(AN_CONTRAPTIONS_SURFACE.label).toBe("Contraptions")
    expect(AN_CONTRAPTIONS_SURFACE.subtitle).toBe("Automations & integrations")
    expect(AN_CONTRAPTIONS_SURFACE.partAttr).toBe('data-an-part="contraptions"')
    expect(AN_CONTRAPTIONS_SURFACE.redstoneTitle).toContain("redstone")
    // STAGE4-11/12 ownership markers must not be redefined by Contraptions mount
    expect(AN_COMPOSER_SURFACE.ownedAttr).toBe('data-an-owned="composer"')
  })

  test("Computer attach surface markers (AP-BF-01)", () => {
    expect(AN_COMPUTER_ATTACH_SURFACE.backend).toBe("local-browser")
    expect(AN_COMPUTER_ATTACH_SURFACE.partAttr).toBe('data-an-part="computer-attach"')
    expect(AN_COMPUTER_ATTACH_SURFACE.pathLabel).toContain("Edge/Chrome")
    // STAGE4-11/12 ownership markers must not be redefined by BF-01
    expect(AN_COMPOSER_SURFACE.ownedAttr).toBe('data-an-owned="composer"')
  })

  test("three-state layout flags (AP-STAGE4-04)", () => {
    expect(anShellLayout("conversation")).toEqual({
      mode: "conversation",
      attentionAlwaysOn: true,
      computerBeside: false,
      computerPrimary: false,
    })
    expect(anShellLayout("view")).toMatchObject({ computerBeside: true, computerPrimary: false })
    expect(anShellLayout("takeover")).toMatchObject({ computerBeside: false, computerPrimary: true })
  })
})

describe("AN shell model", () => {
  test("regions match Stage 4 rails and attention stays always-on", () => {
    const model = buildAnShellModel({})
    expect(model.regions).toEqual(["nav", "roster", "mission", "stream", "attention"])
    expect(model.attentionAlwaysOn).toBe(true)
    expect(model.mode).toBe("conversation")
    expect(model.layout.attentionAlwaysOn).toBe(true)
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

  test("view and takeover layouts flip computer placement", () => {
    expect(buildAnShellModel({ mode: "view" }).layout.computerBeside).toBe(true)
    expect(buildAnShellModel({ mode: "takeover" }).layout.computerPrimary).toBe(true)
    expect(buildAnShellModel({ mode: "status" as string }).mode).toBe("conversation")
  })
})
