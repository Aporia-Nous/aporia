import { test, expect } from "bun:test"
import { needsResearch, researchPrompt } from "./expert-policy"

test("an expert with no findings must research first", () => {
  expect(needsResearch("expert", false)).toBe(true)
})

test("an expert that already has a finding may answer", () => {
  expect(needsResearch("expert", true)).toBe(false)
})

test("a worker never has to research", () => {
  expect(needsResearch("worker", false)).toBe(false)
})

test("no kind behaves like a worker", () => {
  expect(needsResearch(undefined, false)).toBe(false)
})

test("the research prompt names the scope and the question", () => {
  const prompt = researchPrompt("Is X safe?", ["safety", "med"])
  expect(prompt).toContain("safety, med")
  expect(prompt).toContain("Is X safe?")
})

test("the research prompt falls back when there is no scope", () => {
  expect(researchPrompt("q", undefined).toLowerCase()).toContain("general")
})
