import { describe, expect, mock, test } from "bun:test"
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

mock.module("electron", () => ({
  ipcMain: { handle() {} },
  BrowserWindow: { fromWebContents: () => undefined },
  dialog: { showSaveDialog: async () => ({ filePath: undefined }), showOpenDialog: async () => ({ filePaths: [] }) },
  app: { getPath: () => process.env.APORIA_HOME ?? "", on() {}, once() {} },
}))
mock.module("./aporia-log", () => ({ aporiaLog: { error() {}, info() {}, warn() {} } }))
const { persistMcp, validate } = await import("./aporia-mcp")

describe("aporia mcp persist", () => {
  test("keeps comments and other keys, backs up, writes env refs", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ap-"))
    const file = path.join(dir, "opencode.jsonc")
    writeFileSync(file, '{\n  // my comment\n  "model": "deepseek/deepseek-chat",\n  "mcp": { "old": { "type": "local", "command": ["x"] } }\n}\n')
    const { config, name } = validate("github", { type: "local", command: ["npx", "gh"], environment: { T: "{env:T}" } })
    const result = await persistMcp(file, name, config)
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

describe("aporia mcp oauth casing", () => {
  test("accepts camelCase OAuth (live config) and emits snake_case for the schema", () => {
    const { name, config } = validate("asana--client2", {
      type: "remote",
      url: "https://mcp.asana.com/sse",
      oauth: {
        clientId: "{env:ASANA_CLIENT_ID}",
        clientSecret: "{env:ASANA_CLIENT_SECRET}",
        redirectUri: "http://127.0.0.1:1455/callback",
      },
    })
    expect(name).toBe("asana--client2")
    expect(config.oauth).toEqual({
      client_id: "{env:ASANA_CLIENT_ID}",
      client_secret: "{env:ASANA_CLIENT_SECRET}",
      redirect_uri: "http://127.0.0.1:1455/callback",
    })
  })

  test("still accepts snake_case OAuth fields", () => {
    const { config } = validate("x", { type: "remote", url: "https://a", oauth: { client_id: "{env:X}" } })
    expect(config.oauth).toEqual({ client_id: "{env:X}" })
  })

  test("rejects a literal OAuth client secret in either casing", () => {
    expect(() => validate("x", { type: "remote", url: "https://a", oauth: { clientId: "literal" } })).toThrow()
    expect(() => validate("x", { type: "remote", url: "https://a", oauth: { client_id: "literal" } })).toThrow()
  })
})
