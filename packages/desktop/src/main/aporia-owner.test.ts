import { afterEach, beforeEach, describe, expect, mock, setSystemTime, test } from "bun:test"
import { appendFileSync, existsSync, mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

let userData = ""
mock.module("electron", () => ({
  ipcMain: { handle() {} },
  BrowserWindow: { fromWebContents: () => undefined },
  dialog: { showSaveDialog: async () => ({ filePath: undefined }), showOpenDialog: async () => ({ filePaths: [] }) },
  app: { getPath: () => userData, on() {}, once() {} },
}))
mock.module("./aporia-log", () => ({ aporiaLog: { error() {}, info() {}, warn() {} } }))

const { logActivity, spentToday, readActivity } = await import("./aporia-owner")

const activityFile = () => path.join(userData, "aporia-activity.jsonl")
const spendFile = (day: string) => path.join(userData, `spend-${day}.json`)

beforeEach(() => {
  userData = mkdtempSync(path.join(tmpdir(), "aporia-owner-"))
  setSystemTime(new Date("2026-10-11T10:00:00Z"))
})
afterEach(() => setSystemTime())

describe("incremental daily spend", () => {
  test("sums logged spends and persists a per-day spend file", () => {
    logActivity({ kind: "votel", detail: "a", ok: true, amount: 1.5 })
    logActivity({ kind: "votel", detail: "b", ok: true, amount: 2 })
    logActivity({ kind: "settings", detail: "no amount", ok: true }) // ignored (no amount)
    logActivity({ kind: "votel", detail: "blocked", ok: false, amount: 99 }) // ignored (not ok)
    expect(spentToday()).toBe(3.5)
    expect(existsSync(spendFile("2026-10-11"))).toBe(true)
    expect(JSON.parse(readFileSync(spendFile("2026-10-11"), "utf8"))).toEqual({ day: "2026-10-11", total: 3.5 })
  })

  test("does not re-read the whole activity log on each poll", () => {
    logActivity({ kind: "votel", detail: "a", ok: true, amount: 4 })
    expect(spentToday()).toBe(4)
    // A spend appended straight to the log (bypassing logActivity) must not change the cached total:
    // proves spentToday reads the small spend file, not the activity log.
    appendFileSync(activityFile(), JSON.stringify({ at: "2026-10-11T11:00:00Z", kind: "votel", detail: "out of band", ok: true, amount: 100 }) + "\n")
    expect(spentToday()).toBe(4)
    // The activity view still reads the raw log.
    expect(readActivity().length).toBe(2)
  })

  test("resets across a day rollover", () => {
    logActivity({ kind: "votel", detail: "a", ok: true, amount: 5 })
    expect(spentToday()).toBe(5)
    setSystemTime(new Date("2026-10-12T00:30:00Z"))
    expect(spentToday()).toBe(0)
    logActivity({ kind: "votel", detail: "b", ok: true, amount: 2 })
    expect(spentToday()).toBe(2)
  })

  test("backfills the day total from the log once when no spend file exists yet", () => {
    // Spends that happened in an earlier process run (log only, no spend file).
    appendFileSync(activityFile(), JSON.stringify({ at: "2026-10-11T09:00:00Z", kind: "votel", detail: "prior", ok: true, amount: 7 }) + "\n")
    setSystemTime(new Date("2026-10-11T12:00:00Z"))
    expect(spentToday()).toBe(7)
    expect(JSON.parse(readFileSync(spendFile("2026-10-11"), "utf8"))).toEqual({ day: "2026-10-11", total: 7 })
  })
})
