// APORIA: local encrypted vault. File holds metadata in clear and each value DPAPI-encrypted.
// Config text may reference entries as {vault:NAME}; they are resolved in memory at load time and
// never written back to disk in plain text.
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { protect, unprotect } from "./aporia-dpapi.js"

export type VaultCategory = "Aporia Nous" | "Perseus" | "Personal"
export type VaultEntry = {
  id: string
  name: string
  category: VaultCategory
  kind: "api-key" | "password" | "token" | "private-key" | "secret"
  username?: string
  url?: string
  notes?: string
  source?: string
  value: string // DPAPI-protected, base64
  updated: string
}
export type VaultFile = { version: 1; entries: VaultEntry[] }

export const CATEGORIES: VaultCategory[] = ["Aporia Nous", "Perseus", "Personal"]
export const NAME = /^[A-Za-z0-9_.-]{1,100}$/

export function vaultPath() {
  if (process.env.APORIA_VAULT) return process.env.APORIA_VAULT
  const base =
    process.platform === "win32"
      ? (process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"))
      : path.join(os.homedir(), ".config")
  return path.join(base, "Aporia", "vault.json")
}

export function readVault(file = vaultPath()): VaultFile {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as VaultFile
    return parsed?.version === 1 && Array.isArray(parsed.entries) ? parsed : { version: 1, entries: [] }
  } catch {
    return { version: 1, entries: [] }
  }
}

export function writeVault(data: VaultFile, file = vaultPath()) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = file + ".tmp"
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 })
  fs.renameSync(tmp, file)
}

export function vaultStamp(file = vaultPath()) {
  try {
    return fs.statSync(file).mtimeMs
  } catch {
    return 0
  }
}

let cache: { stamp: number; values: Map<string, string> } | undefined

/** Resolve the given names to plaintext (missing names are omitted). One DPAPI call per load. */
export async function resolveVault(names: string[]) {
  const stamp = vaultStamp()
  if (!cache || cache.stamp !== stamp) cache = { stamp, values: new Map() }
  const wanted = [...new Set(names)].filter((name) => !cache!.values.has(name))
  if (wanted.length) {
    const entries = readVault().entries.filter((entry) => wanted.includes(entry.name))
    const plain = await unprotect(entries.map((entry) => entry.value)).catch(() => [] as string[])
    entries.forEach((entry, index) => plain[index] !== undefined && cache!.values.set(entry.name, plain[index]))
  }
  return cache.values
}

export async function upsertEntry(input: Omit<VaultEntry, "id" | "value" | "updated"> & { id?: string; plain?: string }) {
  if (!NAME.test(input.name)) throw new Error("Invalid entry name")
  if (!CATEGORIES.includes(input.category)) throw new Error("Invalid category")
  const data = readVault()
  const existing = data.entries.find((entry) => (input.id ? entry.id === input.id : entry.name === input.name))
  if (data.entries.some((entry) => entry.name === input.name && entry.id !== existing?.id)) throw new Error("Name already used")
  const value = input.plain !== undefined ? (await protect([input.plain]))[0] : existing?.value
  if (!value) throw new Error("A value is required")
  const { plain: _plain, ...meta } = input
  const next: VaultEntry = {
    ...existing,
    ...meta,
    id: existing?.id ?? crypto.randomUUID(),
    value,
    updated: new Date().toISOString(),
  } as VaultEntry
  data.entries = existing ? data.entries.map((entry) => (entry.id === existing.id ? next : entry)) : [...data.entries, next]
  writeVault(data)
  cache = undefined
  return next.id
}

export function deleteEntry(id: string) {
  const data = readVault()
  data.entries = data.entries.filter((entry) => entry.id !== id)
  writeVault(data)
  cache = undefined
}

export async function revealEntry(id: string) {
  const entry = readVault().entries.find((item) => item.id === id)
  if (!entry) throw new Error("Not found")
  return (await unprotect([entry.value]))[0]
}
