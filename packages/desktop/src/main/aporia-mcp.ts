// APORIA: persist Connect-apps MCP servers into the user's GLOBAL OpenCode config.
// - edits only the `mcp.<name>` key through the serialized config writer (aporia-config), so
//   comments/other keys are preserved and writes are validated + backed up once
// - accepts {env:NAME} references only; literal secrets are rejected
import { ipcMain } from "electron"
import { editConfig, globalConfigFile, updateGlobalConfig, updateGlobalConfigSync } from "./aporia-config"

export { globalConfigFile } from "./aporia-config"

export const AporiaMcpPersistChannel = "aporia:mcp-persist"

const DEFAULT_CONFIG = '{\n  "$schema": "https://opencode.ai/config.json"\n}\n'

const ENV_REF = /^\{(env:[A-Za-z_][A-Za-z0-9_]*|vault:[A-Za-z0-9_.-]{1,100})\}$/
const BEARER_REF = /^Bearer \{(env:[A-Za-z_][A-Za-z0-9_]*|vault:[A-Za-z0-9_.-]{1,100})\}$/
const NAME = /^[a-z0-9][a-z0-9_-]{0,63}$/i

type McpConfig =
  | { type: "local"; command: string[]; environment?: Record<string, string> }
  | {
      type: "remote"
      url: string
      headers?: Record<string, string>
      oauth?: { client_id: string; client_secret?: string; redirect_uri?: string }
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
    let oauth: { client_id: string; client_secret?: string; redirect_uri?: string } | undefined
    if (c.oauth !== undefined) {
      const o = c.oauth as Record<string, unknown>
      // The engine's schema is snake_case, but the live config writes camelCase; accept either on read
      // and emit snake_case (so a second-account clone of a camelCase entry no longer throws).
      const clientId = o.client_id ?? o.clientId
      const clientSecret = o.client_secret ?? o.clientSecret
      const redirectUri = o.redirect_uri ?? o.redirectUri
      if (typeof clientId !== "string" || !ENV_REF.test(clientId)) throw new Error("oauth.client_id must be {env:NAME}")
      if (clientSecret !== undefined && (typeof clientSecret !== "string" || !ENV_REF.test(clientSecret)))
        throw new Error("oauth.client_secret must be {env:NAME}")
      if (redirectUri !== undefined && (typeof redirectUri !== "string" || !/^http:\/\/127\.0\.0\.1:\d+\/[a-z/]*$/.test(redirectUri)))
        throw new Error("oauth.redirect_uri must be a 127.0.0.1 loopback URL")
      oauth = {
        client_id: clientId,
        ...(typeof clientSecret === "string" ? { client_secret: clientSecret } : {}),
        ...(typeof redirectUri === "string" ? { redirect_uri: redirectUri } : {}),
      }
    }
    return {
      name,
      config: {
        type: "remote",
        url: c.url,
        ...(Object.keys(headers).length ? { headers: headers as Record<string, string> } : {}),
        ...(oauth ? { oauth } : {}),
      },
    }
  }
  throw new Error("Unsupported MCP type")
}

/** Serialized write (used by the IPC handler and the accounts flow). */
export function persistMcp(file: string, name: string, config: McpConfig) {
  return updateGlobalConfig(file, editConfig(["mcp", name], config), { defaultText: DEFAULT_CONFIG })
}

/** Synchronous variant for the startup path (atomic on the event loop; see aporia-config). */
export function persistMcpSync(file: string, name: string, config: McpConfig) {
  return updateGlobalConfigSync(file, editConfig(["mcp", name], config), { defaultText: DEFAULT_CONFIG })
}

export function registerAporiaMcpHandler() {
  ipcMain.handle(AporiaMcpPersistChannel, async (_event, input: { name?: unknown; config?: unknown }) => {
    const { name, config } = validate(input?.name, input?.config)
    return persistMcp(globalConfigFile(), name, config)
  })
}
