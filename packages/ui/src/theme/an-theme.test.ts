import { describe, expect, test } from "bun:test"
import { DEFAULT_THEMES, anTheme } from "./default-themes"
import { resolveTheme } from "./resolve"
import type { DesktopTheme } from "./types"

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
})
