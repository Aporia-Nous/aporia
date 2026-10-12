import { describe, expect, test } from "bun:test"
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { editConfig, updateGlobalConfig } from "./aporia-config"

const tmp = () => mkdtempSync(path.join(tmpdir(), "aporia-config-"))

describe("serialized global-config writer", () => {
  test("two writes issued concurrently both land (no lost edit)", async () => {
    const dir = tmp()
    const file = path.join(dir, "opencode.jsonc")
    writeFileSync(file, '{\n  "model": "deepseek/deepseek-chat"\n}\n')

    await Promise.all([
      updateGlobalConfig(file, editConfig(["x"], 1)),
      updateGlobalConfig(file, editConfig(["y"], 2)),
    ])

    const parsed = JSON.parse(readFileSync(file, "utf8"))
    expect(parsed.x).toBe(1)
    expect(parsed.y).toBe(2)
    // Comment-preserving edit kept the untouched key.
    expect(parsed.model).toBe("deepseek/deepseek-chat")
  })

  test("refuses a malformed config and leaves it byte-unchanged", async () => {
    const dir = tmp()
    const file = path.join(dir, "opencode.jsonc")
    writeFileSync(file, "{ this is not json")

    const before = readFileSync(file, "utf8")
    await expect(updateGlobalConfig(file, editConfig(["x"], 1))).rejects.toThrow(/left it unchanged/i)
    expect(readFileSync(file, "utf8")).toBe(before)
  })

  test("keeps a single .bak and prunes older timestamped backups", async () => {
    const dir = tmp()
    const file = path.join(dir, "opencode.jsonc")
    writeFileSync(file, '{ "a": 1 }\n')
    // Pre-existing legacy backups (as the old writers left behind).
    writeFileSync(`${file}.aporia-bak-2026-10-11T00-00-00-000Z`, "old")
    writeFileSync(`${file}.bak-1699999999999`, "old")

    for (let i = 0; i < 3; i++) await updateGlobalConfig(file, editConfig(["a"], i))

    const backups = readdirSync(dir).filter((name) => name.includes("bak"))
    expect(backups).toEqual(["opencode.jsonc.bak"])
    // The kept backup is the pre-write contents of the last write (after i=1).
    expect(JSON.parse(readFileSync(`${file}.bak`, "utf8")).a).toBe(1)
  })

  test("serializes edits from independent callers through one queue", async () => {
    const dir = tmp()
    const file = path.join(dir, "opencode.json")
    writeFileSync(file, "{}\n")

    // Fire off writes for distinct keys without awaiting between them; every key must survive.
    const writes = Array.from({ length: 8 }, (_, i) => updateGlobalConfig(file, editConfig([`k${i}`], i)))
    await Promise.all(writes)

    const parsed = JSON.parse(readFileSync(file, "utf8"))
    for (let i = 0; i < 8; i++) expect(parsed[`k${i}`]).toBe(i)
  })
})
