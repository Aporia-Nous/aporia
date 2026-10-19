import { describe, expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

const KEY = "dialog.model.unpaid.freeModels.title"
const localeDir = import.meta.dir
const KEY_LINE = new RegExp(`"${KEY.replace(/\./g, "\\.")}"\\s*:\\s*"([^"]*)"`)

describe("free-model copy honesty", () => {
  test("en attributes free models to OpenCode, not Aporetic", async () => {
    const { dict } = await import("./en")
    expect(dict[KEY]).toBe("Free models provided by OpenCode")
    expect(dict[KEY]).not.toMatch(/Aporetic|Aporia/i)
    expect(dict["provider.connect.opencode.freeName"]).toBe("OpenCode Free")
  })

  test("non-EN locale files do not claim Aporetic subsidizes free models", () => {
    const files = readdirSync(localeDir).filter((name) => name.endsWith(".ts") && name !== "en.ts" && !name.includes(".test."))

    let checked = 0
    for (const file of files) {
      const source = readFileSync(join(localeDir, file), "utf8")
      const match = source.match(KEY_LINE)
      if (!match) continue
      checked += 1
      const value = match[1]
      expect(value, file).not.toMatch(/Aporetic|Aporia/i)
      expect(value, file).toContain("OpenCode")
    }

    expect(checked).toBeGreaterThan(40)
  })
})
