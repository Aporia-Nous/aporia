// APORIA: persist Connect-apps MCP servers into the user's GLOBAL OpenCode config.
// - backs up the file before every write
// - edits only the `mcp.<name>` key with jsonc-parser, so comments/other keys are preserved
// - accepts {env:NAME} references only; literal secrets are rejected
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import { ipcMain } from "electron"
import { applyEdits, modify, parse, type ParseError } from "jsonc-parser"

export const AporiaMcpPersistChannel = "aporia:mcp-persist"

const ENV_REF = /^\{env:[A-Za-z_][A-Za-z0-9_]*\}$/
const BEARER_REF = /^Bearer \{env:[A-Za-z_][A-Za-z0-9_]*\}$/
const NAME = /^[a-z0-9][a-z0-9_-]{0,63}$/i

type McpConfig =
  | { type: "local"; command: string[]; environment?: Record<string, string> }
  | { type: "remote"; url: string; headers?: Record<string, string> }

export function globalConfigFile() {
  const base = process.env.XDG_CONFIG_HOME || path.join(homedir(), ".config")
  const dir = path.join(base, "opencode")
  for (const name of ["opencode.jsonc", "opencode.json", "config.json"]) {
    const file = path.join(dir, name)
    if (existsSync(file)) return file
  }
  return path.join(dir, "opencode.json")
}

export function validate(name: unknown, config: unknown): { name: string; config: McpConfig } {
  if (typeof name !== "string" || !NAME.test(name)) throw new Error("Invalid server name")
  const c = config as Record<string, unknown>
  if (c?.type === "local") {
    if (!Array.isArray(c.command) || !c.command.every((part) => typeof part === "string") || !c.command.length)
      throw new Error("Invalid command")
    const environment = (c.environment ?? {}) as Record<string, unknown>
    for (const value of Object.values(environment))
      if (typeof value !== "string" || !ENV_REF.test(value)) throw new Error("Environment values must be {env:NAME}")
    return {
      name,
      config: {
        type: "local",
        command: c.command as string[],
        ...(Object.keys(environment).length ? { environment: environment as Record<string, string> } : {}),
      },
    }
  }
  if (c?.type === "remote") {
    if (typeof c.url !== "string" || !/^https:\/\//.test(c.url)) throw new Error("Remote URL must be https")
    const headers = (c.headers ?? {}) as Record<string, unknown>
    for (const value of Object.values(headers))
      if (typeof value !== "string" || !(ENV_REF.test(value) || BEARER_REF.test(value)))
        throw new Error("Header values must reference {env:NAME}")
    return {
      name,
      config: {
        type: "remote",
        url: c.url,
        ...(Object.keys(headers).length ? { headers: headers as Record<string, string> } : {}),
      },
    }
  }
  throw new Error("Unsupported MCP type")
}

export function persistMcp(file: string, name: string, config: McpConfig, now = new Date()) {
  mkdirSync(path.dirname(file), { recursive: true })
  const original = existsSync(file) ? readFileSync(file, "utf8") : ""
  const errors: ParseError[] = []
  if (original.trim()) {
    parse(original, errors, { allowTrailingComma: true })
    if (errors.length) throw new Error(`Could not parse ${path.basename(file)}; left it unchanged`)
  }
  let backup: string | undefined
  if (original) {
    backup = `${file}.aporia-bak-${now.toISOString().replace(/[:.]/g, "-")}`
    copyFileSync(file, backup)
  }
  const base = original.trim() ? original : '{\n  "$schema": "https://opencode.ai/config.json"\n}\n'
  const edits = modify(base, ["mcp", name], config, { formattingOptions: { insertSpaces: true, tabSize: 2 } })
  writeFileSync(file, applyEdits(base, edits), "utf8")
  return { file, backup }
}

export function registerAporiaMcpHandler() {
  ipcMain.handle(AporiaMcpPersistChannel, (_event, input: { name?: unknown; config?: unknown }) => {
    const { name, config } = validate(input?.name, input?.config)
    return persistMcp(globalConfigFile(), name, config)
  })
}
