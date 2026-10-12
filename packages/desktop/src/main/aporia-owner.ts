// APORIA: Owner mode. Off by default on every install. When on:
//  - the Votel bridge may call any votel-mcp tool (not only reads);
//  - the global OpenCode config gets `"permission": "allow"` so the engine auto-approves tools
//    (a backup is written first; turning Owner mode off removes the key again).
// Every bridge action is appended to an activity log the UI shows. An optional daily spend cap
// (USD, off unless set) blocks spend-type Votel calls through this bridge once reached.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { app, ipcMain } from "electron"
import { editConfig, globalConfigFile, updateGlobalConfig } from "./aporia-config"
import { aporiaLog } from "./aporia-log"

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
  const at = new Date().toISOString()
  // Keep the daily spend total incrementally instead of re-parsing the whole activity log per poll.
  // Update it before appending so the one-time backfill (missing spend file) cannot see this entry twice.
  if (entry.ok && typeof entry.amount === "number") {
    const state = loadSpend(at.slice(0, 10))
    state.total += entry.amount
    persistSpend(state)
  }
  appendFileSync(logFile(), JSON.stringify({ at, ...entry }) + "\n")
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

type SpendState = { path: string; day: string; total: number }
let spend: SpendState | undefined
const todayKey = () => new Date().toISOString().slice(0, 10)
const spendFile = (day: string) => path.join(app.getPath("userData"), `spend-${day}.json`)

// Sum of ok, spend-typed entries logged for `day`. Only used once per day (see loadSpend) to seed the
// running total when the small spend file is missing (e.g. first poll after an app restart).
function sumLoggedSpend(day: string): number {
  if (!existsSync(logFile())) return 0
  return readFileSync(logFile(), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => { try { return JSON.parse(line) } catch { return undefined } })
    .filter((e): e is { at: string; ok: boolean; amount: number } => !!e && e.ok === true && typeof e.at === "string" && e.at.startsWith(day) && typeof e.amount === "number")
    .reduce((sum, e) => sum + e.amount, 0)
}

function loadSpend(day: string): SpendState {
  const filePath = spendFile(day)
  if (spend?.path === filePath) return spend
  try {
    const value = JSON.parse(readFileSync(filePath, "utf8"))
    spend = { path: filePath, day, total: typeof value.total === "number" ? value.total : 0 }
  } catch {
    spend = { path: filePath, day, total: sumLoggedSpend(day) }
    persistSpend(spend)
  }
  return spend
}

function persistSpend(state: SpendState) {
  try {
    writeFileSync(state.path, JSON.stringify({ day: state.day, total: state.total }))
  } catch (error) {
    aporiaLog.error("aporia spend persist failed", error instanceof Error ? (error.stack ?? error.message) : String(error))
  }
}

export function spentToday() {
  return loadSpend(todayKey()).total
}

async function setEnginePermission(owner: boolean) {
  // Validated, serialized write: a malformed config is refused (not corrupted), one `.bak` kept.
  await updateGlobalConfig(globalConfigFile(), editConfig(["permission"], owner ? "allow" : undefined), {
    defaultText: "{}\n",
  })
}

export function registerAporiaOwnerHandler() {
  ipcMain.handle("aporia:owner", async (_event, input: { op: string; owner?: unknown; spendCap?: unknown }) => {
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
      if (next.owner !== prev.owner) await setEnginePermission(next.owner)
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
