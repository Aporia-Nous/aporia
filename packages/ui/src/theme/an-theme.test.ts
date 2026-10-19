import { describe, expect, test } from "bun:test"
import { DEFAULT_THEMES, anTheme } from "./default-themes"
import { resolveTheme } from "./resolve"
import type { DesktopTheme } from "./types"
import { resolveThemeVariantV2 } from "./v2/resolve"

describe("AN black/gold desktop theme", () => {
  test("registers as theme id an with black/gold dark seeds", () => {
    expect(DEFAULT_THEMES.an).toBeDefined()
    expect(DEFAULT_THEMES.an.id).toBe("an")
    expect(DEFAULT_THEMES.an.name).toBe("AN Black/Gold")
    expect(anTheme.id).toBe("an")
    const dark = anTheme.dark
    expect("palette" in dark).toBe(true)
    if ("palette" in dark) {
      expect(dark.palette.neutral.toLowerCase()).toBe("#020509")
      expect(dark.palette.primary.toLowerCase()).toBe("#f0c66d")
      expect(dark.palette.accent?.toLowerCase()).toBe("#d79a2e")
      expect(dark.palette.success.toLowerCase()).toBe("#3be78c")
    }
  })

  test("resolves without throwing and keeps gold primary in dark CSS", () => {
    const theme = anTheme as DesktopTheme
    const resolved = resolveTheme(theme)
    expect(resolved.dark).toBeDefined()
    expect(resolved.light).toBeDefined()
    const cssBlob = JSON.stringify(resolved.dark)
    expect(cssBlob.toLowerCase()).toContain("f0c66d")
  })

  test("dark v2 composer surfaces pin void fill and gold send contrast (AP-STAGE4-03)", () => {
    const theme = anTheme as DesktopTheme
    const tokens = resolveThemeVariantV2(theme.dark, true)
    expect(String(tokens["v2-background-bg-base"]).toLowerCase()).toBe("#020509")
    expect(String(tokens["v2-background-bg-layer-01"]).toLowerCase()).toBe("#020509")
    expect(String(tokens["v2-background-bg-deep"]).toLowerCase()).toBe("#020509")
    expect(String(tokens["v2-background-bg-icon-button-contrast"]).toLowerCase()).toBe("#d79a2e")
    // Navy/indigo OpenCode band from DESIGN-GAPS must not remain as composer fill
    expect(String(tokens["v2-background-bg-layer-01"]).toLowerCase()).not.toBe("#121b37")
    expect(String(tokens["v2-background-bg-layer-01"]).toLowerCase()).not.toContain("111726")
  })
})
