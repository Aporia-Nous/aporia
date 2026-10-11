import { describe, expect, mock, test } from "bun:test"
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

mock.module("electron", () => ({ ipcMain: { handle() {} } }))
const { persistMcp, validate } = await import("./aporia-mcp")

describe("aporia mcp persist", () => {
  test("keeps comments and other keys, backs up, writes env refs", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ap-"))
    const file = path.join(dir, "opencode.jsonc")
    writeFileSync(file, '{\n  // my comment\n  "model": "deepseek/deepseek-chat",\n  "mcp": { "old": { "type": "local", "command": ["x"] } }\n}\n')
    const { config, name } = validate("github", { type: "local", command: ["npx", "gh"], environment: { T: "{env:T}" } })
    const result = persistMcp(file, name, config)
    const text = readFileSync(file, "utf8")
    expect(text).toContain("// my comment")
    expect(text).toContain('"model": "deepseek/deepseek-chat"')
    expect(text).toContain('"old"')
    expect(text).toContain('"T": "{env:T}"')
    expect(result.backup).toBeDefined()
    expect(readdirSync(dir).length).toBe(2)
  })

  test("rejects literal secrets", () => {
    expect(() => validate("x", { type: "local", command: ["a"], environment: { T: "ghp_secret" } })).toThrow()
    expect(() => validate("x", { type: "remote", url: "https://a", headers: { Authorization: "Bearer abc" } })).toThrow()
  })
})
