import { describe, expect, test } from "bun:test"
import {
  anSettingsAboutIntro,
  anSettingsOwnedAttrs,
  shouldOwnAnSettings,
} from "./settings-chrome"
import { AN_PRODUCT_BYLINE, AN_PRODUCT_NAME, AN_SETTINGS_SURFACE } from "./tokens"

describe("settings-chrome (AP-ENGINE-PORT-02)", () => {
  test("owns Settings only when AnShell enabled", () => {
    expect(shouldOwnAnSettings(true)).toBe(true)
    expect(shouldOwnAnSettings(false)).toBe(false)
    expect(anSettingsOwnedAttrs(true)["data-an-owned"]).toBe(AN_SETTINGS_SURFACE.ownedValue)
    expect(anSettingsOwnedAttrs(true)["data-an-theme"]).toBe("an")
    expect(anSettingsOwnedAttrs(true)["data-an-engine-port"]).toBe("02")
    expect(anSettingsOwnedAttrs(true)["data-an-settings"]).toBe(AN_SETTINGS_SURFACE.slice)
    expect(anSettingsOwnedAttrs(false)).toEqual({})
  })

  test("About intro is Aporetic product + byline; OpenCode fine print only", () => {
    const intro = anSettingsAboutIntro()
    expect(intro.product).toBe(AN_PRODUCT_NAME)
    expect(intro.byline).toBe(AN_PRODUCT_BYLINE)
    expect(intro.basedOn).toContain("OpenCode")
    expect(intro.finePrint.toLowerCase()).toContain("opencode")
    expect(AN_SETTINGS_SURFACE.dropOcSettingsReactImport).toBe(true)
    expect(AN_SETTINGS_SURFACE.opencodeFinePrintOnly).toBe(true)
    expect(AN_SETTINGS_SURFACE.part).toBe("settings")
  })
})
