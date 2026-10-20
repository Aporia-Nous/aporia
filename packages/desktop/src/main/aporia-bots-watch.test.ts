import { beforeEach, describe, expect, mock, test } from "bun:test"
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

const home = mkdtempSync(path.join(tmpdir(), "aporia-home-"))
const config = mkdtempSync(path.join(tmpdir(), "aporia-config-"))
process.env.APORIA_HOME = home
process.env.XDG_CONFIG_HOME = config

const quitHandlers: string[] = []
mock.module("electron", () => ({
  ipcMain: { handle() {} },
  BrowserWindow: { fromWebContents: () => undefined },
  dialog: { showSaveDialog: async () => ({ filePath: undefined }), showOpenDialog: async () => ({ filePaths: [] }) },
  app: { getPath: () => home, once: (event: string, _fn: () => void) => void quitHandlers.push(event), on() {} },
}))
mock.module("./aporia-log", () => ({ aporiaLog: { error() {}, info() {}, warn() {} } }))

const bots = await import("./aporia-bots")

const AGENTS = path.join(config, "opencode", "agents")
const agentFile = (slug: string) => path.join(AGENTS, `aporia-${slug}.md`)

function makeBot(slug: string, memory: string) {
  const dir = path.join(home, "bots", slug)
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    path.join(dir, "bot.json"),
    JSON.stringify({ slug, name: slug, role: `${slug} role`, instructions: "do things", model: "deepseek/deepseek-flash", tools: [], mcps: [], skills: [], routines: [], sessions: [], created: "2026-01-01T00:00:00.000Z" }),
  )
  writeFileSync(path.join(dir, "MEMORY.md"), memory)
}

beforeEach(() => {
  mkdirSync(path.join(home, "memory"), { recursive: true })
  mkdirSync(path.join(home, "handoff"), { recursive: true })
  writeFileSync(path.join(home, "memory", "USER.md"), "# Shared memory\n\nAli likes plain talk.\n")
  writeFileSync(path.join(home, "handoff", "MEMORY-AND-TOOLS.md"), "# Rules\n\nBe careful.\n")
  for (const slug of ["alpha", "beta"]) makeBot(slug, `# ${slug} memory\n\n`)
})

describe("regeneration scope", () => {
  test("regenerating one bot's change leaves other agent files untouched", () => {
    bots.regenerateAll()
    const before = { a: readFileSync(agentFile("alpha"), "utf8"), b: readFileSync(agentFile("beta"), "utf8") }

    writeFileSync(path.join(home, "bots", "alpha", "MEMORY.md"), "# alpha memory\n\nBRAND NEW FACT\n")
    bots.regenerateChanged(path.join(home, "bots", "alpha", "MEMORY.md"))

    expect(readFileSync(agentFile("alpha"), "utf8")).not.toBe(before.a)
    expect(readFileSync(agentFile("alpha"), "utf8")).toContain("BRAND NEW FACT")
    expect(readFileSync(agentFile("beta"), "utf8")).toBe(before.b)
  })

  test("a change to bot.json only regenerates that bot", () => {
    bots.regenerateAll()
    const beforeB = readFileSync(agentFile("beta"), "utf8")
    const alpha = JSON.parse(readFileSync(path.join(home, "bots", "alpha", "bot.json"), "utf8"))
    writeFileSync(path.join(home, "bots", "alpha", "bot.json"), JSON.stringify({ ...alpha, role: "a brand new role" }))
    bots.regenerateChanged(path.join(home, "bots", "alpha", "bot.json"))
    expect(readFileSync(agentFile("alpha"), "utf8")).toContain("a brand new role")
    expect(readFileSync(agentFile("beta"), "utf8")).toBe(beforeB)
  })

  test("a shared USER.md change regenerates every bot", () => {
    bots.regenerateAll()
    const beforeA = readFileSync(agentFile("alpha"), "utf8")
    const beforeB = readFileSync(agentFile("beta"), "utf8")
    writeFileSync(path.join(home, "memory", "USER.md"), "# Shared memory\n\nA NEW SHARED FACT\n")
    bots.regenerateChanged(path.join(home, "memory", "USER.md"))
    expect(readFileSync(agentFile("alpha"), "utf8")).not.toBe(beforeA)
    expect(readFileSync(agentFile("beta"), "utf8")).not.toBe(beforeB)
    expect(readFileSync(agentFile("beta"), "utf8")).toContain("A NEW SHARED FACT")
  })

  test("changeTargets maps paths to the affected scope", () => {
    expect(bots.changeTargets(path.join(home, "bots", "alpha", "MEMORY.md"))).toEqual(["alpha"])
    expect(bots.changeTargets(path.join(home, "bots", "beta", "bot.json"))).toEqual(["beta"])
    expect(bots.changeTargets(path.join(home, "memory", "USER.md"))).toBe("*")
    expect(bots.changeTargets(path.join(home, "bots", "alpha", "routines-state.json"))).toEqual([])
  })
})

describe("watchers", () => {
  test("watchers are installed then closed, and a finalizer is registered", () => {
    bots.watchMemory()
    expect(bots.isWatching()).toBe(true)
    expect(quitHandlers).toContain("will-quit")
    bots.closeWatchers()
    expect(bots.isWatching()).toBe(false)
  })
})

describe("source guards", () => {
  const source = readFileSync(new URL("./aporia-bots.ts", import.meta.url), "utf8")
  test("no swallowed errors on the regeneration / watcher paths", () => {
    expect(source).not.toContain("catch {}")
    expect(source).toContain("aporiaLog.error")
  })
})
