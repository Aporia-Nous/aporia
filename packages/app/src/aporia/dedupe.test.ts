import { describe, expect, test } from "bun:test"
import { createDedupe, fingerprint } from "./dedupe"

describe("fingerprint", () => {
  test("ignores whitespace differences but not different words, senders, or targets", () => {
    expect(fingerprint("a", "b", "  hello   world \n")).toBe(fingerprint("a", "b", "hello world"))
    expect(fingerprint("a", "b", "hello world")).not.toBe(fingerprint("a", "b", "hello worlds"))
    expect(fingerprint("a", "b", "hi")).not.toBe(fingerprint("c", "b", "hi"))
    expect(fingerprint("a", "b", "hi")).not.toBe(fingerprint("a", "c", "hi"))
  })
})

describe("createDedupe", () => {
  test("drops the second copy of the same words inside the window", () => {
    const dedupe = createDedupe(10 * 60_000)
    const key = fingerprint("grok", "ash", "do you have the Apify token?")
    expect(dedupe.duplicate(key, "m1", 1_000)).toBe(false)
    expect(dedupe.duplicate(key, "m2", 2_000)).toBe(true)
  })

  test("never treats a retry of the same message as a duplicate", () => {
    const dedupe = createDedupe(10 * 60_000)
    const key = fingerprint("grok", "ash", "still working on it")
    expect(dedupe.duplicate(key, "m1", 1_000)).toBe(false)
    expect(dedupe.duplicate(key, "m1", 30_000)).toBe(false)
    expect(dedupe.duplicate(key, "m1", 60_000)).toBe(false)
  })

  test("lets the same words through again once the window has passed", () => {
    const dedupe = createDedupe(1_000)
    const key = fingerprint("routine-check", "ash", "run the morning check")
    expect(dedupe.duplicate(key, "m1", 0)).toBe(false)
    expect(dedupe.duplicate(key, "m2", 500)).toBe(true)
    expect(dedupe.duplicate(key, "m3", 1_500)).toBe(false)
  })

  test("keeps distinct messages apart and forgets expired ones", () => {
    const dedupe = createDedupe(1_000)
    expect(dedupe.duplicate(fingerprint("a", "b", "one"), "m1", 0)).toBe(false)
    expect(dedupe.duplicate(fingerprint("a", "b", "two"), "m2", 0)).toBe(false)
    expect(dedupe.size).toBe(2)
    expect(dedupe.duplicate(fingerprint("a", "b", "three"), "m3", 5_000)).toBe(false)
    expect(dedupe.size).toBe(1)
  })
})
