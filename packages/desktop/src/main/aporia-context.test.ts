import { test, expect } from "bun:test"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createContextStore, entryId, handleContext } from "./aporia-context"

test("add + all round-trips an entry with its source", () => {
  const dir = mkdtempSync(join(tmpdir(), "ctx-"))
  const s = createContextStore(dir)
  const e = s.add({
    topic: "billing",
    tags: ["invoice"],
    text: "Ali pays monthly",
    source: { kind: "session", ref: "ses_1:msg_1", sessionID: "ses_1", messageID: "msg_1" },
  })
  expect(e.source.ref).toBe("ses_1:msg_1")
  expect(s.all()).toHaveLength(1)
})

test("add is idempotent for the same source+topic+text", () => {
  const dir = mkdtempSync(join(tmpdir(), "ctx-"))
  const s = createContextStore(dir)
  const input = { topic: "billing", tags: [] as string[], text: "x", source: { kind: "session" as const, ref: "ses_1:msg_1" } }
  s.add(input)
  s.add(input)
  expect(s.all()).toHaveLength(1)
})

test("query filters by topic and tag", () => {
  const dir = mkdtempSync(join(tmpdir(), "ctx-"))
  const s = createContextStore(dir)
  s.add({ topic: "billing", tags: ["invoice"], text: "a", source: { kind: "session", ref: "r1" } })
  s.add({ topic: "perseus", tags: ["wave"], text: "b", source: { kind: "session", ref: "r2" } })
  expect(s.query({ topic: "billing" })).toHaveLength(1)
  expect(s.query({ tag: "wave" })).toHaveLength(1)
  expect(s.query({ topic: "nope" })).toHaveLength(0)
})

test("entryId is stable across calls", () => {
  const a = { topic: "t", tags: [] as string[], text: "x", source: { kind: "session" as const, ref: "r" } }
  expect(entryId(a)).toBe(entryId(a))
})

test("reopening the store sees persisted entries", () => {
  const dir = mkdtempSync(join(tmpdir(), "ctx-"))
  createContextStore(dir).add({ topic: "t", tags: [], text: "x", source: { kind: "session", ref: "r" } })
  expect(createContextStore(dir).all()).toHaveLength(1)
})

test("handleContext dispatches all/add/query and throws on an unknown op", () => {
  const dir = mkdtempSync(join(tmpdir(), "ctx-"))
  const store = createContextStore(dir)
  expect((handleContext(store, { op: "all" }) as any).entries).toHaveLength(0)
  const added = handleContext(store, {
    op: "add",
    entry: { topic: "t", tags: [], text: "x", source: { kind: "session", ref: "r" } },
  }) as any
  expect(added.entry.source.ref).toBe("r")
  expect((handleContext(store, { op: "query", q: { topic: "t" } }) as any).entries).toHaveLength(1)
  expect(() => handleContext(store, { op: "nope" })).toThrow()
})

