import { test, expect } from "bun:test"
import { scopedEntries, normaliseFact, isDuplicate } from "./context-scope"

test("scopedEntries keeps only entries whose topic is in scope", () => {
  const entries = [{ id: "1", topic: "billing" }, { id: "2", topic: "perseus" }]
  expect(scopedEntries(entries, ["billing"]).map((e) => e.id)).toEqual(["1"])
})

test("undefined scopes means no scope yet — returns everything (Phase-2 fallback)", () => {
  const entries = [{ id: "1", topic: "billing" }]
  expect(scopedEntries(entries, undefined)).toHaveLength(1)
})

test("an empty scope list sees nothing", () => {
  const entries = [{ id: "1", topic: "billing" }]
  expect(scopedEntries(entries, [])).toHaveLength(0)
})

test("normaliseFact ignores case, whitespace, and line endings", () => {
  expect(normaliseFact("  Hello   World\r\n")).toBe(normaliseFact("hello world"))
})

test("isDuplicate is true for the same topic and normalised text", () => {
  const existing = [{ topic: "billing", text: "Ali pays monthly" }]
  expect(isDuplicate({ topic: "billing", text: "ali  pays\nmonthly" }, existing)).toBe(true)
})

test("isDuplicate is false for a different topic or text", () => {
  const existing = [{ topic: "billing", text: "Ali pays monthly" }]
  expect(isDuplicate({ topic: "other", text: "Ali pays monthly" }, existing)).toBe(false)
  expect(isDuplicate({ topic: "billing", text: "something else" }, existing)).toBe(false)
})
