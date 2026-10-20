import { describe, expect, mock, test } from "bun:test"

// `aporia-routines` imports electron (BrowserWindow/dialog/ipcMain) and electron-log at module load;
// the cron helpers under test need none of that, so stub the pieces the module references.
mock.module("electron", () => ({
  ipcMain: { handle() {} },
  BrowserWindow: { fromWebContents: () => undefined },
  dialog: { showSaveDialog: async () => ({ filePath: undefined }), showOpenDialog: async () => ({ filePaths: [] }) },
}))
mock.module("./aporia-log", () => ({ aporiaLog: { error() {}, info() {}, warn() {} } }))
mock.module("./aporia-vault-store", () => ({ resolveVault: async () => new Map() }))

const { nextRun, cronMatches } = await import("./aporia-routines")

// Reference implementation: the original brute-force minute stepper. Used only to prove the new
// arithmetic `nextRun` returns the same *first* matching minute for crons with a match inside a year.
function bruteNext(cron: string, from: Date) {
  const d = new Date(Math.ceil(from.getTime() / 60000) * 60000)
  for (let i = 0; i < 60 * 24 * 366; i++, d.setTime(d.getTime() + 60000)) if (cronMatches(cron, d)) return d.toISOString()
  return undefined
}

describe("nextRun", () => {
  test("a pathological cron (Feb 29) resolves fast and with a correct date", () => {
    const from = new Date("2028-02-01T12:00:00Z")
    const started = performance.now()
    const run = nextRun("0 0 29 2 *", from)
    const elapsed = performance.now() - started
    expect(elapsed).toBeLessThan(50)
    // 2028-02-29 00:00 America/Chicago (CST, UTC-6) -> 06:00Z
    expect(run).toBe("2028-02-29T06:00:00.000Z")
  })

  test("a Feb 29 cron with no match inside a year still resolves to the next one", () => {
    // From 2026 there is no Feb 29 for > 500 days; the brute-force year cap would return undefined.
    const run = nextRun("0 0 29 2 *", new Date("2026-10-11T00:00:00Z"))
    expect(run).toBe("2028-02-29T06:00:00.000Z")
  })

  test("a normal weekday cron is correct", () => {
    // Monday 2026-03-09 is the next weekday 08:00 Chicago after Sunday 2026-03-08 12:00Z.
    const run = nextRun("0 8 * * 1-5", new Date("2026-03-08T12:00:00Z"))
    expect(run).toBe(bruteNext("0 8 * * 1-5", new Date("2026-03-08T12:00:00Z")))
    expect(run).toBe("2026-03-09T13:00:00.000Z") // CDT, UTC-5
  })

  test("matches the brute-force reference across DST spring-forward", () => {
    const from = new Date("2026-03-08T07:30:00Z")
    expect(nextRun("0 2 * * *", from)).toBe(bruteNext("0 2 * * *", from))
    // 2:00 America/Chicago does not exist on 2026-03-08; the next is 2026-03-09 02:00 CDT.
    expect(nextRun("0 2 * * *", from)).toBe("2026-03-09T07:00:00.000Z")
  })

  test("matches the brute-force reference across DST fall-back (repeated hour)", () => {
    const from = new Date("2026-11-01T06:30:00Z") // 01:30 CDT
    expect(nextRun("0 1 * * *", from)).toBe(bruteNext("0 1 * * *", from))
    expect(nextRun("0 1 * * *", from)).toBe("2026-11-01T07:00:00.000Z") // 01:00 CST
  })

  test("returns the next minute for an every-minute cron", () => {
    const from = new Date("2026-03-08T12:00:30Z")
    expect(nextRun("* * * * *", from)).toBe("2026-03-08T12:01:00.000Z")
  })

  test("agrees with brute force for a spread of crons and starts", () => {
    const crons = ["*/15 * * * *", "0 */6 * * *", "30 9 * * 1-5", "0 0 1 * *", "0 12 * * 0", "5 4 15 * *", "*/20 8-17 * * 1-5"]
    const starts = [
      new Date("2026-01-15T00:00:00Z"),
      new Date("2026-03-07T23:00:00Z"),
      new Date("2026-06-01T12:34:00Z"),
      new Date("2026-11-01T05:00:00Z"),
    ]
    for (const cron of crons) for (const from of starts) expect(nextRun(cron, from)).toBe(bruteNext(cron, from))
  })
})

describe("cronMatches", () => {
  test("keeps the existing dom/dow semantics", () => {
    // 2026-03-09 08:00 Chicago == 13:00Z, a Monday.
    expect(cronMatches("0 8 * * 1", new Date("2026-03-09T13:00:00Z"))).toBe(true)
    expect(cronMatches("0 8 * * 2", new Date("2026-03-09T13:00:00Z"))).toBe(false)
    expect(cronMatches("0 8 9 3 *", new Date("2026-03-09T13:00:00Z"))).toBe(true)
  })
})
