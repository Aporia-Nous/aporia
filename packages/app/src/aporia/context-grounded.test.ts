import { test, expect } from "bun:test"
import { buildGroundedPrompt, extractCitations, verifyGrounded } from "./context-grounded"

test("prompt lists entries with ids and caps the count", () => {
  const entries = Array.from({ length: 30 }, (_, i) => ({ id: "id" + i, topic: "t", text: "x" + i }))
  const { prompt, allowedIds } = buildGroundedPrompt("q", entries, 20)
  expect(allowedIds).toHaveLength(20)
  expect(prompt).toContain("id0")
  expect(prompt).not.toContain("id25")
})

test("empty entries yields an explicit no-source instruction", () => {
  const { prompt, allowedIds } = buildGroundedPrompt("q", [])
  expect(allowedIds).toHaveLength(0)
  expect(prompt.toLowerCase()).toContain("no source")
})

test("extractCitations finds bracketed and bare ids", () => {
  expect(extractCitations("as [abc12345] says")).toContain("abc12345")
  expect(extractCitations("see 0123abcd too")).toContain("0123abcd")
  expect(extractCitations("nothing here")).toEqual([])
})

test("verifyGrounded: cited id in the allowed set is ok", () => {
  expect(verifyGrounded("because [abc12345]", ["abc12345"]).ok).toBe(true)
})

test("verifyGrounded: no citation at all is uncited", () => {
  expect(verifyGrounded("definitely true", ["abc12345"]).reason).toBe("uncited")
})

test("verifyGrounded: citing an id outside the set is bad-cite", () => {
  expect(verifyGrounded("[deadbeef]", ["abc12345"]).reason).toBe("bad-cite")
})

test("verifyGrounded: empty allowed set with an answer is no-source", () => {
  expect(verifyGrounded("I think...", []).reason).toBe("no-source")
})
