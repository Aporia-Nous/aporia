// APORIA: multiple accounts per MCP connector.
// Each account is its own MCP entry: the first keeps the plain name ("asana"), extra ones are
// "<app>--<label>" ("asana--client2"), so each gets its own OAuth tokens (per integration) and its own
// vault-backed secrets ({vault:ASANA__CLIENT2__KEY}). Agents target an account by its tool prefix.
// The active (default) account is recorded in accounts.json and written to an instructions file that
// the global config loads, so agents use it unless told a label. The config watcher hot-reloads all of it.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { app, ipcMain } from "electron"
import { applyEdits, modify, parse } from "jsonc-parser"
import { globalConfigFile, persistMcp, validate } from "./aporia-mcp"

const SEP = "--"
const LABEL = /^[a-z0-9][a-z0-9_]{0,30}$/
type Accounts = Record<string, { active: string; labels: Record<string, string> }> // app -> entry name -> display label
const store = () => path.join(app.getPath("userData"), "aporia-accounts.json")
const instructionsFile = () => path.join(path.dirname(globalConfigFile()), "aporia-accounts.md")

const readStore = (): Accounts => {
  try { return JSON.parse(readFileSync(store(), "utf8")) } catch { return {} }
}
const configFiles = () => {
  const dir = path.dirname(globalConfigFile())
  return ["opencode.jsonc", "opencode.json"].map((n) => path.join(dir, n)).filter(existsSync)
}
function allMcp() {
  const out: Record<string, { file: string; config: any }> = {}
  for (const file of configFiles()) {
    const mcp = parse(readFileSync(file, "utf8"), [], { allowTrailingComma: true })?.mcp ?? {}
    for (const [name, config] of Object.entries(mcp)) out[name] = { file, config }
  }
  return out
}
const appOf = (name: string) => name.split(SEP)[0]

function edit(file: string, keyPath: (string | number)[], value: unknown) {
  const text = readFileSync(file, "utf8")
  writeFileSync(file, applyEdits(text, modify(text, keyPath, value, { formattingOptions: { insertSpaces: true, tabSize: 2 } })), "utf8")
}

function writeInstructions(accounts: Accounts) {
  const lines = ["# Connector accounts (managed by Aporia)", ""]
  for (const [appName, info] of Object.entries(accounts)) {
    const names = Object.keys(info.labels)
    if (names.length < 2) continue
    lines.push(`- ${appName}: default account is "${info.labels[info.active] ?? info.active}" (MCP server \`${info.active}\`). Other accounts: ${names.filter((n) => n !== info.active).map((n) => `"${info.labels[n]}" (\`${n}\`)`).join(", ")}. Use a non-default account only when the user names its label.`)
  }
  writeFileSync(instructionsFile(), lines.join("\n") + "\n", "utf8")
  // make sure the global config loads it (hot-reloaded by the config watcher)
  const file = globalConfigFile()
  const cfg = parse(readFileSync(file, "utf8"), [], { allowTrailingComma: true }) ?? {}
  const list: string[] = Array.isArray(cfg.instructions) ? cfg.instructions : []
  if (!list.includes(instructionsFile())) edit(file, ["instructions"], [...list, instructionsFile()])
}

function save(accounts: Accounts) {
  writeFileSync(store(), JSON.stringify(accounts, null, 2))
  writeInstructions(accounts)
}

export function listAccounts() {
  const accounts = readStore()
  const groups: Record<string, { name: string; label: string; active: boolean }[]> = {}
  for (const name of Object.keys(allMcp())) {
    const a = appOf(name)
    const label = accounts[a]?.labels[name] ?? (name.includes(SEP) ? name.split(SEP)[1] : "default")
    ;(groups[a] ??= []).push({ name, label, active: (accounts[a]?.active ?? a) === name })
  }
  return groups
}

export function registerAporiaAccountsHandler() {
  ipcMain.handle("aporia:accounts", (_event, input: { action?: string; app?: string; name?: string; label?: string }) => {
    const accounts = readStore()
    const mcp = allMcp()
    const ensure = (a: string) => (accounts[a] ??= { active: a, labels: { [a]: "default" } })
    switch (input?.action) {
      case "list":
        return listAccounts()
      case "add": {
        const a = String(input.app ?? ""), label = String(input.label ?? "").toLowerCase()
        if (!mcp[a]) throw new Error("Connect the first account of this app first")
        if (!LABEL.test(label)) throw new Error("Label: lowercase letters, numbers, underscore")
        const name = `${a}${SEP}${label}`
        if (mcp[name]) throw new Error("That label already exists")
        // clone the base entry; per-account secrets point at their own vault entries
        const prefix = `${a}__${label}__`.toUpperCase().replace(/-/g, "_")
        const json = JSON.stringify(mcp[a].config).replace(/\{env:([A-Za-z0-9_]+)\}/g, (_m, k) =>
          /CLIENT_ID|CLIENT_SECRET/.test(k) ? `{env:${k}}` : `{vault:${prefix}${k}}`,
        )
        const { config } = validate(name, JSON.parse(json))
        const result = persistMcp(mcp[a].file, name, config)
        ensure(a).labels[name] = label
        save(accounts)
        return { name, backup: result.backup, vaultPrefix: prefix }
      }
      case "rename": {
        const name = String(input.name ?? ""), label = String(input.label ?? "").trim()
        if (!mcp[name] || !label || label.length > 40) throw new Error("Invalid rename")
        ensure(appOf(name)).labels[name] = label // display label only: keeps tokens and tool names stable
        save(accounts)
        return { ok: true }
      }
      case "set-active": {
        const name = String(input.name ?? "")
        if (!mcp[name]) throw new Error("Unknown account")
        const info = ensure(appOf(name))
        info.labels[name] ??= name.split(SEP)[1] ?? "default"
        info.active = name
        save(accounts)
        return { ok: true }
      }
      case "remove": {
        // called after the renderer has disconnected (tokens revoked/cleared) via the server API
        const name = String(input.name ?? "")
        if (!mcp[name] || !name.includes(SEP)) throw new Error("Only extra accounts can be removed")
        persistBackupAndDelete(mcp[name].file, name)
        const info = ensure(appOf(name))
        delete info.labels[name]
        if (info.active === name) info.active = appOf(name)
        save(accounts)
        return { ok: true }
      }
      default:
        throw new Error("Unknown accounts action")
    }
  })
}

function persistBackupAndDelete(file: string, name: string) {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(`${file}.aporia-bak-${new Date().toISOString().replace(/[:.]/g, "-")}`, readFileSync(file))
  edit(file, ["mcp", name], undefined)
}
