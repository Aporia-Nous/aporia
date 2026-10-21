import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, describe, expect, mock, test } from "bun:test"

// `aporia-bots` reads APORIA_HOME once at import, so it is set before the module loads. Without it the store would
// write into a real bot folder.
const home = mkdtempSync(path.join(tmpdir(), "aporia-fyi-"))
process.env.APORIA_HOME = home

mock.module("electron", () => ({
  ipcMain: { handle() {} },
  BrowserWindow: { fromWebContents: () => undefined },
  dialog: { showSaveDialog: async () => ({ filePath: undefined }), showOpenDialog: async () => ({ filePaths: [] }) },
  app: { getPath: () => home, on() {}, once() {} },
}))
mock.module("./aporia-log", () => ({ aporiaLog: { error() {}, info() {}, warn() {} } }))

const { BOTS_DIR, fyiAppend, fyiDrain } = await import("./aporia-bots")

afterAll(() => rmSync(home, { recursive: true, force: true }))

describe("held no-reply messages", () => {
  test("are written beside the bot, so a restart does not lose them", () => {
    fyiAppend({ slug: "ash", from: "grok", text: "closed already" })
    const file = path.join(BOTS_DIR, "ash", "fyi.json")
    const onDisk = JSON.parse(readFileSync(file, "utf8"))
    expect(onDisk).toHaveLength(1)
    expect(onDisk[0]).toMatchObject({ from: "grok", text: "closed already" })
  })

  test("are read exactly once", () => {
    fyiAppend({ slug: "seo", from: "webby", text: "first" })
    fyiAppend({ slug: "seo", from: "webby", text: "second" })
    expect(fyiDrain("seo").map((e) => e.text)).toEqual(["first", "second"])
    expect(fyiDrain("seo")).toEqual([])
  })

  test("start empty for a bot that has never been sent one", () => {
    expect(fyiDrain("rep-boss")).toEqual([])
  })

  test("keep the newest when a bot is flooded", () => {
    for (let i = 0; i < 60; i++) fyiAppend({ slug: "grok", from: "ali", text: `note ${i}` })
    const held = fyiDrain("grok")
    expect(held).toHaveLength(50)
    expect(held.at(-1)?.text).toBe("note 59")
    expect(held[0]?.text).toBe("note 10")
  })

  test("refuse a slug that is not a plain folder name", () => {
    expect(() => fyiDrain("../../escape")).toThrow()
    expect(() => fyiAppend({ slug: "..\\escape", from: "x", text: "y" })).toThrow()
  })
})
