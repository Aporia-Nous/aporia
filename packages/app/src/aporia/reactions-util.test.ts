import { describe, expect, test } from "bun:test"
import { reactionSignature, type Reaction } from "./reactions-util"

const a: Reaction = { at: "2026-01-01T00:00:00Z", by: "ali", emoji: "👍", messageID: "m1" }
const b: Reaction = { at: "2026-01-01T00:00:01Z", by: "bot", emoji: "🎉", messageID: "m2" }

describe("reactionSignature", () => {
  test("is stable for identical inputs so idle polls can early-out", () => {
    expect(reactionSignature([a, b], ["m1", "m2"])).toBe(reactionSignature([a, b], ["m1", "m2"]))
  })

  test("changes when the reaction list changes", () => {
    expect(reactionSignature([a], ["m1"])).not.toBe(reactionSignature([a, b], ["m1"]))
  })

  test("changes when the visible rows change (a scroll reveals new turns)", () => {
    expect(reactionSignature([a], ["m1"])).not.toBe(reactionSignature([a], ["m1", "m2"]))
  })

  test("treats a missing list as empty", () => {
    expect(reactionSignature(undefined, [])).toBe(reactionSignature([], []))
  })
})
