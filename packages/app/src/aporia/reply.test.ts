import { describe, expect, test } from "bun:test"
import { isSilentReply } from "./reply"

describe("isSilentReply", () => {
  test("treats PASS as staying silent, with or without a full stop or padding", () => {
    for (const text of ["PASS", "pass", "Pass.", "  PASS  ", "\nPASS.\n"]) expect(isSilentReply(text)).toBe(true)
  })

  test("keeps a real answer, so nothing useful is dropped", () => {
    for (const text of [
      "PASS on that, but here is the number you asked for.",
      "Nothing further needed, standing state unchanged.",
      "Already answered this one.",
      "",
    ])
      expect(isSilentReply(text)).toBe(false)
  })
})
