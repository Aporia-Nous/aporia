import { test, expect } from "bun:test"
import { buildMemoryPrompt, extractCitations } from "./context-grounded"

test("memory prompt lists entries with ids and caps the count", () => {
  const entries = Array.from({ length: 30 }, (_, i) => ({ id: "id" + i, topic: "t", text: "x" + i }))
  const { prompt, ids } = buildMemoryPrompt("q", entries, 20)
  expect(ids).toHaveLength(20)
  expect(prompt).toContain("id0")
  expect(prompt).not.toContain("id25")
})

test("empty memory leaves the task unchanged — no refusal instruction", () => {
  const { prompt, ids } = buildMemoryPrompt("Do the thing", [])
  expect(ids).toHaveLength(0)
  expect(prompt).toBe("Do the thing")
  expect(prompt.toLowerCase()).not.toContain("no source")
})

test("memory prompt never tells the bot to answer only from the facts", () => {
  const { prompt } = buildMemoryPrompt("q", [{ id: "abc12345", topic: "t", text: "x" }])
  expect(prompt.toLowerCase()).not.toContain("only from")
  expect(prompt).toContain("abc12345")
})

test("extractCitations finds bracketed and bare ids", () => {
  expect(extractCitations("as [abc12345] says")).toContain("abc12345")
  expect(extractCitations("see 0123abcd too")).toContain("0123abcd")
  expect(extractCitations("nothing here")).toEqual([])
})
