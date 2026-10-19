import { describe, expect, test } from "bun:test"
import {
  anSettingsAboutIntro,
  anSettingsOwnedAttrs,
  shouldOwnAnSettings,
} from "./settings-chrome"
import { AN_PRODUCT_BYLINE, AN_PRODUCT_NAME, AN_SETTINGS_SURFACE } from "./tokens"

describe("settings-chrome (AP-STAGE4-19)", () => {
  test("owns Settings only when AnShell enabled", () => {
    expect(shouldOwnAnSettings(true)).toBe(true)
    expect(shouldOwnAnSettings(false)).toBe(false)
    expect(anSettingsOwnedAttrs(true)["data-an-owned"]).toBe(AN_SETTINGS_SURFACE.ownedValue)
    expect(anSettingsOwnedAttrs(true)["data-an-theme"]).toBe("an")
    expect(anSettingsOwnedAttrs(false)).toEqual({})
  })

  test("About intro is Aporetic product + byline", () => {
    const intro = anSettingsAboutIntro()
    expect(intro.product).toBe(AN_PRODUCT_NAME)
    expect(intro.byline).toBe(AN_PRODUCT_BYLINE)
    expect(intro.basedOn).toContain("OpenCode")
  })
})
