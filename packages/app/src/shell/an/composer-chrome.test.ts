import { describe, expect, test } from "bun:test"
import { AN_COMPOSER_SURFACE } from "./tokens"
import { anComposerBotLabel, anComposerPlaceholder, isAnOwnedComposerHost } from "./composer-chrome"

describe("AP-STAGE4-13 AN composer chrome", () => {
  test("surface pins hide OC chips/mic/call and keep gold send + ownership", () => {
    expect(AN_COMPOSER_SURFACE.hideOcChips).toBe(true)
    expect(AN_COMPOSER_SURFACE.hideMicCall).toBe(true)
    expect(AN_COMPOSER_SURFACE.keepGoldSend).toBe(true)
    expect(AN_COMPOSER_SURFACE.placeholderTemplate).toBe("Message {bot}…")
    expect(AN_COMPOSER_SURFACE.ownedAttr).toBe('data-an-owned="composer"')
    expect(AN_COMPOSER_SURFACE.ownedValue).toBe("composer")
    expect(AN_COMPOSER_SURFACE.send).toBe("#d79a2e")
  })

  test("bot label strips aporia- and title-cases", () => {
    expect(anComposerBotLabel("aporia-grok")).toBe("Grok")
    expect(anComposerBotLabel("Aporia-Grok")).toBe("Grok")
    expect(anComposerBotLabel("aporia-copy-humanizer")).toBe("Copy Humanizer")
    expect(anComposerBotLabel("build")).toBe("Build")
    expect(anComposerBotLabel("")).toBe("teammate")
    expect(anComposerBotLabel(null)).toBe("teammate")
  })

  test("placeholder is Message {bot}… not OpenCode Ask anything", () => {
    expect(anComposerPlaceholder("aporia-grok")).toBe("Message Grok…")
    expect(anComposerPlaceholder(undefined)).toBe("Message teammate…")
    expect(anComposerPlaceholder("aporia-grok")).not.toContain("Ask anything")
    expect(anComposerPlaceholder("aporia-grok")).not.toContain("/")
    expect(anComposerPlaceholder("aporia-grok")).not.toContain("@")
  })

  test("owned-host detector requires AnShell + STAGE4-12 dock marker", () => {
    const doc = new DOMParser().parseFromString(
      `<div data-component="an-shell"><div data-an-owned="composer"></div></div>`,
      "text/html",
    )
    expect(isAnOwnedComposerHost(doc)).toBe(true)
    const bare = new DOMParser().parseFromString(`<div data-component="composer"></div>`, "text/html")
    expect(isAnOwnedComposerHost(bare)).toBe(false)
    const shellOnly = new DOMParser().parseFromString(`<div data-component="an-shell"></div>`, "text/html")
    expect(isAnOwnedComposerHost(shellOnly)).toBe(false)
  })
})
