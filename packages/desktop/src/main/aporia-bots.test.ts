import { beforeEach, describe, expect, mock, test } from "bun:test"

// `aporia-bots` registers Electron IPC handlers on import; the module only needs `ipcMain.handle`.
// SAFETY: this mirrors Electron's untyped ipcMain handler signature; the test only reads the capture.
/* oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-unknown-returns -- see SAFETY above */
type Handler = (event: unknown, input: { readonly op?: string }) => unknown
/* oxlint-enable anti-slop/no-unknown-parameters, anti-slop/no-unknown-returns */

let botsHandler: Handler | undefined

mock.module("electron", () => ({
  ipcMain: {
    handle: (channel: string, fn: Handler) => {
      if (channel === "aporia:bots") botsHandler = fn
    },
  },
  BrowserWindow: { fromWebContents: () => undefined },
  dialog: { showSaveDialog: async () => ({ filePath: undefined }), showOpenDialog: async () => ({ filePaths: [] }) },
  app: { getPath: () => process.env.APORIA_HOME ?? "", on() {}, once() {} },
}))
mock.module("./aporia-log", () => ({ aporiaLog: { error() {}, info() {}, warn() {} } }))

const { botsHealth, registerAporiaBotsHandler, startBots } = await import("./aporia-bots")

describe("aporia bots health", () => {
  // `startBots([])` runs no steps and only normalizes the module-global health flag, so each test is
  // independent of what a prior test left behind (no filesystem work).
  beforeEach(() => startBots([]))

  test("starts healthy and reports the failing stage instead of swallowing it", () => {
    expect(botsHealth().ok).toBe(true)

    // A failing stage is surfaced (throws + records health), never swallowed to console.error.
    expect(() =>
      startBots([
        ["seed", () => {}],
        ["memory-mcp", () => {
          throw new Error("disk full")
        }],
      ]),
    ).toThrow(/memory-mcp/)

    const health = botsHealth()
    expect(health.ok).toBe(false)
    expect(health.stage).toBe("memory-mcp")
    expect(health.error).toContain("disk full")
  })

  test("returns to healthy after a successful run", () => {
    startBots([["seed", () => {}]])
    expect(botsHealth()).toEqual({ ok: true, at: expect.any(String) })
  })

  test("exposes the health flag over the bots ipc channel", () => {
    registerAporiaBotsHandler()
    expect(botsHandler).toBeDefined()
    expect(botsHandler!({}, { op: "health" })).toMatchObject({ ok: true })
  })
})
