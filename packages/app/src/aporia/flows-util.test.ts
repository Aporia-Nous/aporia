import { describe, expect, test } from "bun:test"
import {
  duration,
  errorText,
  isOpen,
  parseDefinition,
  requestId,
  runLabel,
  slashInput,
  startedToast,
  stepLine,
} from "./flows-util"

describe("flow slash input", () => {
  test("a JSON object is the input, anything else is text, nothing is {}", () => {
    expect(slashInput(undefined)).toEqual({})
    expect(slashInput("   ")).toEqual({})
    expect(slashInput('{"who":"ali","n":2}')).toEqual({ who: "ali", n: 2 })
    expect(slashInput("hello there")).toEqual({ text: "hello there" })
    expect(slashInput("{not json")).toEqual({ text: "{not json" })
    expect(slashInput("[1,2]")).toEqual({ text: "[1,2]" })
    expect(slashInput("42")).toEqual({ text: "42" })
  })
})

describe("add Contraption from JSON", () => {
  test("only a JSON object passes; the server does the real validation", () => {
    expect(parseDefinition("")).toEqual({ ok: false, error: "Paste a Contraption definition (JSON) first." })
    expect(parseDefinition("[]").ok).toBe(false)
    expect(parseDefinition("{oops").ok).toBe(false)
    expect(parseDefinition('{"id":"a"}')).toEqual({ ok: true, definition: { id: "a" } })
  })
})

describe("request ids", () => {
  test("match what the server accepts and differ per click", () => {
    const a = requestId("slash")
    const b = requestId("slash")
    expect(a).toMatch(/^[A-Za-z0-9_-]{8,64}$/)
    expect(a).not.toBe(b)
    expect(requestId("x", () => 0, () => 0)).toBe("x-0-aaaaaaaaaa")
  })
})

describe("labels and timeline", () => {
  test("statuses, durations and step lines read plainly", () => {
    expect(runLabel("needs-attention")).toBe("Needs you")
    expect(isOpen("waiting")).toBe(true)
    expect(isOpen("completed")).toBe(false)
    expect(duration(0, 120)).toBe("120 ms")
    expect(duration(0, 3400)).toBe("3.4 s")
    expect(duration(0, 120_000)).toBe("2 min")
    expect(duration(5)).toBe("")
    expect(
      stepLine({ id: "fetch", type: "http", status: "succeeded", attempts: 2, startedAt: 0, endedAt: 250, tokens: 0 }),
    ).toBe("● fetch · http · succeeded · 2 attempts · 250 ms · 0 tokens")
    expect(stepLine({ id: "x", name: "Send", type: "http", status: "needs-attention", attempts: 1, tokens: 0 })).toBe(
      "! Send · http · needs-attention · 0 tokens",
    )
    expect(startedToast("Greet", true)).toBe('Started Contraption "Greet"')
    expect(startedToast("Greet", false)).toContain("already")
    expect(startedToast("Greet", false)).toContain("Contraption")
    expect(errorText({ problems: ["a", "b"] })).toBe("a; b")
    expect(errorText(new Error("boom"))).toBe("boom")
  })
})
