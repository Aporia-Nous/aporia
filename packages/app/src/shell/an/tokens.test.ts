import { describe, expect, test } from "bun:test"
import {
  AN_COMPOSER_SURFACE,
  AN_COMPUTER_ATTACH_SURFACE,
  AN_COMPUTER_CONTROL_SURFACE,
  AN_COMPUTER_EXTERNAL_SURFACE,
  AN_COMPUTER_FEED_SURFACE,
  AN_COMPUTER_SCREENCAST_SURFACE,
  AN_CONTRAPTIONS_SURFACE,
  AN_DESIGN_SOURCE,
  AN_ICE_MATERIAL,
  AN_MOTION_SURFACE,
  AN_PRESENCE_PERSONALITY,
  AN_REVIEW_CONTENT_SURFACE,
  AN_REVIEW_SURFACE,
  AN_SETTINGS_SURFACE,
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
    // STAGE4-16 punched alphas further; keep feel + AN black/gold
    expect(AN_TOKENS.panel).toContain("0.28")
    expect(AN_TOKENS.panelRaised).toContain("0.36")
    expect(AN_TOKENS.panelGlass).toContain("0.2")
    expect(AN_TOKENS.glow).toContain("0.24")
    expect(AN_TOKENS.feel).toBe("frictionless-ice-glass")
    // Cooler ice depth — not Lagoon Night theme swap; gold/void stay AN
    expect(AN_TOKENS.panel).toContain("6, 14, 22")
    expect(AN_TOKENS.gold).toBe("#f0c66d")
    expect(AN_TOKENS.void).toBe("#020509")
  })

  test("ice material punch tokens (AP-STAGE4-16)", () => {
    expect(AN_ICE_MATERIAL.slice).toBe("AP-STAGE4-16")
    expect(AN_ICE_MATERIAL.blur).toBe("40px")
    expect(AN_ICE_MATERIAL.blurStrong).toBe("64px")
    expect(AN_ICE_MATERIAL.saturate).toBe("1.32")
    expect(AN_ICE_MATERIAL.iceSheen).toContain("0.14")
    expect(AN_ICE_MATERIAL.iceEdge).toContain("0.28")
    expect(AN_ICE_MATERIAL.panel).toBe(AN_TOKENS.panel)
    expect(AN_ICE_MATERIAL.keepComposerVoidGold).toBe(true)
    expect(AN_ICE_MATERIAL.avoidPurpleNebula).toBe(true)
    // Must stay more translucent than STAGE4-08 opaque charcoal residual
    expect(Number(AN_TOKENS.panel.match(/0\.\d+/)?.[0])).toBeLessThan(0.4)
    expect(Number(AN_TOKENS.panelRaised.match(/0\.\d+/)?.[0])).toBeLessThan(0.45)
    expect(AN_COMPOSER_SURFACE.fill).toBe(AN_TOKENS.void)
    expect(AN_COMPOSER_SURFACE.send).toBe(AN_TOKENS.goldDeep)
    expect(AN_COMPOSER_SURFACE.ownedAttr).toBe('data-an-owned="composer"')
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

  test("AN composer chrome hides OC chips/mic and keeps gold send (AP-STAGE4-13)", () => {
    expect(AN_COMPOSER_SURFACE.hideOcChips).toBe(true)
    expect(AN_COMPOSER_SURFACE.hideMicCall).toBe(true)
    expect(AN_COMPOSER_SURFACE.keepGoldSend).toBe(true)
    expect(AN_COMPOSER_SURFACE.placeholderTemplate).toBe("Message {bot}…")
    // STAGE4-12 ownership must remain the presentation pin
    expect(AN_COMPOSER_SURFACE.ownedAttr).toBe('data-an-owned="composer"')
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

  test("Review panel + motion surface markers (AP-STAGE4-17)", () => {
    expect(AN_REVIEW_SURFACE.navId).toBe("review")
    expect(AN_REVIEW_SURFACE.partAttr).toBe('data-an-part="review"')
    expect(AN_REVIEW_SURFACE.collapsible).toBe(true)
    expect(AN_REVIEW_SURFACE.preferInAppOverOsWindow).toBe(true)
    expect(AN_REVIEW_SURFACE.tabs).toEqual(["browser", "code", "files", "documents"])
    expect(AN_MOTION_SURFACE.feel).toBe("holographic-ice-companion")
    expect(AN_MOTION_SURFACE.intentionalMotions.length).toBeGreaterThanOrEqual(3)
    expect(AN_MOTION_SURFACE.avoidPurpleNebula).toBe(true)
    expect(AN_COMPOSER_SURFACE.ownedAttr).toBe('data-an-owned="composer"')
  })

  test("Review content bind + deeper holo motion (AP-STAGE4-18 retained / 19 extends)", () => {
    expect(AN_MOTION_SURFACE.depth).toBe("jarvis-adjacent-ice-glass")
    expect(AN_MOTION_SURFACE.continuousLight).toBe(true)
    expect(AN_MOTION_SURFACE.intentionalMotions).toContain("holo-sheen-sweep")
    expect(AN_MOTION_SURFACE.intentionalMotions).toContain("preview-surface-settle")
    expect(AN_REVIEW_CONTENT_SURFACE.bindFromWorkspaceRead).toBe(true)
    expect(AN_REVIEW_CONTENT_SURFACE.emptyShellsForbidden).toBe(true)
    expect(AN_REVIEW_CONTENT_SURFACE.codePart).toBe("review-code-editor")
    expect(AN_REVIEW_CONTENT_SURFACE.documentPart).toBe("review-document-preview")
    expect(AN_COMPOSER_SURFACE.ownedAttr).toBe('data-an-owned="composer"')
    expect(AN_REVIEW_SURFACE.navId).toBe("review")
  })

  test("Presence personality + fuller docs + Settings AN (AP-STAGE4-19)", () => {
    expect(AN_MOTION_SURFACE.slice).toBe("AP-STAGE4-19")
    expect(AN_MOTION_SURFACE.personality).toBe("micro-spring-companion")
    expect(AN_MOTION_SURFACE.intentionalMotions).toContain("presence-micro-spring")
    expect(AN_MOTION_SURFACE.intentionalMotions).toContain("roster-companion-aura")
    expect(AN_MOTION_SURFACE.intentionalMotions).toContain("settings-ice-settle")
    expect(AN_PRESENCE_PERSONALITY.slice).toBe("AP-STAGE4-19")
    expect(AN_PRESENCE_PERSONALITY.notGrokCopy).toBe(true)
    expect(AN_PRESENCE_PERSONALITY.markers.personality).toBe("stage4-19")
    expect(AN_REVIEW_CONTENT_SURFACE.slice).toBe("AP-STAGE4-19")
    expect(AN_REVIEW_CONTENT_SURFACE.fullerDocuments).toBe(true)
    expect(AN_REVIEW_CONTENT_SURFACE.docxTextExtract).toBe(true)
    expect(AN_SETTINGS_SURFACE.ownedAttr).toBe('data-an-owned="settings"')
    expect(AN_SETTINGS_SURFACE.partAttr).toBe('data-an-part="settings"')
    expect(AN_SETTINGS_SURFACE.slice).toBe("AP-ENGINE-PORT-02")
    expect(AN_SETTINGS_SURFACE.enginePort).toBe("02")
    expect(AN_SETTINGS_SURFACE.hideOcProductChrome).toBe(true)
    expect(AN_SETTINGS_SURFACE.dropOcSettingsReactImport).toBe(true)
    expect(AN_SETTINGS_SURFACE.opencodeFinePrintOnly).toBe(true)
    expect(AN_SETTINGS_SURFACE.aporeticAbout).toBe(true)
    // Preserve STAGE4-12/13 composer ownership bar
    expect(AN_COMPOSER_SURFACE.ownedAttr).toBe('data-an-owned="composer"')
  })

  test("Computer attach surface markers (AP-BF-01)", () => {
    expect(AN_COMPUTER_ATTACH_SURFACE.backend).toBe("local-browser")
    expect(AN_COMPUTER_ATTACH_SURFACE.partAttr).toBe('data-an-part="computer-attach"')
    expect(AN_COMPUTER_ATTACH_SURFACE.pathLabel).toContain("Edge/Chrome")
    // STAGE4-11/12 ownership markers must not be redefined by BF-01
    expect(AN_COMPOSER_SURFACE.ownedAttr).toBe('data-an-owned="composer"')
  })

  test("Computer external surface markers (AP-BF-04)", () => {
    expect(AN_COMPUTER_EXTERNAL_SURFACE.backend).toBe("external-chromium")
    expect(AN_COMPUTER_EXTERNAL_SURFACE.loopbackOnly).toBe(true)
    expect(AN_COMPUTER_EXTERNAL_SURFACE.partAttr).toBe('data-an-part="computer-external"')
    expect(AN_COMPUTER_ATTACH_SURFACE.paths).toContain("external-chromium")
    expect(AN_COMPOSER_SURFACE.ownedAttr).toBe('data-an-owned="composer"')
  })

  test("Computer feed surface markers (AP-BF-02)", () => {
    expect(AN_COMPUTER_FEED_SURFACE.partAttr).toBe('data-an-part="computer-feed"')
    expect(AN_COMPUTER_FEED_SURFACE.watchOnly).toBe(true)
    expect(AN_COMPUTER_FEED_SURFACE.includeCursorInCapture).toBe(false)
    expect(AN_COMPOSER_SURFACE.ownedAttr).toBe('data-an-owned="composer"')
  })

  test("Computer control surface markers (AP-BF-03)", () => {
    expect(AN_COMPUTER_CONTROL_SURFACE.partAttr).toBe('data-an-part="computer-control"')
    expect(AN_COMPUTER_CONTROL_SURFACE.singleController).toBe(true)
    expect(AN_COMPOSER_SURFACE.ownedAttr).toBe('data-an-owned="composer"')
  })

  test("Computer screencast surface markers (AP-BF-05)", () => {
    expect(AN_COMPUTER_SCREENCAST_SURFACE.partAttr).toBe('data-an-part="computer-screencast"')
    expect(AN_COMPUTER_SCREENCAST_SURFACE.framePart).toBe("computer-screencast-frame")
    expect(AN_COMPUTER_SCREENCAST_SURFACE.includeCursorInCapture).toBe(false)
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
