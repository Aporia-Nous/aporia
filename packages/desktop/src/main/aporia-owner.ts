// APORIA: Owner mode. Off by default on every install. When on:
//  - the Votel bridge may call any votel-mcp tool (not only reads);
//  - the global OpenCode config gets `"permission": "allow"` so the engine auto-approves tools
//    (a backup is written first; turning Owner mode off removes the key again).
// Every bridge action is appended to an activity log the UI shows. An optional daily spend cap
// (USD, off unless set) blocks spend-type Votel calls through this bridge once reached.
import { appendFileSync, copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { app, ipcMain } from "electron"
import { applyEdits, modify } from "jsonc-parser"
import { globalConfigFile } from "./aporia-mcp"

export type OwnerState = { owner: boolean; spendCap?: number }
const file = () => path.join(app.getPath("userData"), "aporia-owner.json")
const logFile = () => path.join(app.getPath("userData"), "aporia-activity.jsonl")

export function ownerState(): OwnerState {
  try {
    const value = JSON.parse(readFileSync(file(), "utf8"))
    return { owner: value.owner === true, spendCap: typeof value.spendCap === "number" && value.spendCap > 0 ? value.spendCap : undefined }
  } catch {
    return { owner: false }
  }
}

export function logActivity(entry: { kind: string; detail: string; ok: boolean; amount?: number }) {
  appendFileSync(logFile(), JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n")
}

export function readActivity(limit = 200) {
  if (!existsSync(logFile())) return []
  return readFileSync(logFile(), "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .slice(-limit)
    .map((line) => JSON.parse(line))
    .reverse()
}

export function spentToday() {
  const day = new Date().toISOString().slice(0, 10)
  return readActivity(5000)
    .filter((e: { at: string; ok: boolean; amount?: number }) => e.ok && e.at.startsWith(day) && typeof e.amount === "number")
    .reduce((sum: number, e: { amount: number }) => sum + e.amount, 0)
}

function setEnginePermission(owner: boolean) {
  const target = globalConfigFile()
  const original = existsSync(target) ? readFileSync(target, "utf8") : "{}\n"
  if (existsSync(target)) copyFileSync(target, `${target}.aporia-bak-${Date.now()}`)
  const edits = modify(original, ["permission"], owner ? "allow" : undefined, {
    formattingOptions: { insertSpaces: true, tabSize: 2 },
  })
  writeFileSync(target, applyEdits(original, edits), "utf8")
}

export function registerAporiaOwnerHandler() {
  ipcMain.handle("aporia:owner", (_event, input: { op: string; owner?: unknown; spendCap?: unknown }) => {
    if (input?.op === "get") return { ...ownerState(), spentToday: spentToday() }
    if (input?.op === "activity") return readActivity()
    if (input?.op === "set") {
      const prev = ownerState()
      const next: OwnerState = {
        owner: input.owner === undefined ? prev.owner : input.owner === true,
        spendCap:
          input.spendCap === undefined
            ? prev.spendCap
            : typeof input.spendCap === "number" && input.spendCap > 0
              ? input.spendCap
              : undefined,
      }
      writeFileSync(file(), JSON.stringify(next, null, 2))
      if (next.owner !== prev.owner) setEnginePermission(next.owner)
      logActivity({
        kind: "settings",
        detail: `Owner mode ${next.owner ? "on" : "off"}; spend cap ${next.spendCap ? `$${next.spendCap}/day` : "off"}`,
        ok: true,
      })
      return { ...next, spentToday: spentToday() }
    }
    throw new Error("Unknown owner op")
  })
}
