import { expect, test } from "bun:test"
import type { SessionMessageInfo, TokenUsageInfo } from "@opencode/client/promise"
import { contextTokens, formatTokens, tokenTotal } from "./session-stats"

const usage = (partial: Partial<TokenUsageInfo> & Pick<TokenUsageInfo, "input" | "output">): TokenUsageInfo => ({
  reasoning: 0,
  ...partial,
  cache: partial.cache ?? { read: 0, write: 0 },
})

test("tokenTotal is lifetime sum; contextTokens is last assistant prompt only", () => {
  const lifetime = usage({ input: 1_000_000, output: 50_000, reasoning: 1_000, cache: { read: 200_000, write: 0 } })
  expect(tokenTotal(lifetime)).toBe(1_251_000)

  const messages = [
    { id: "a0", type: "assistant", tokens: usage({ input: 90_000, output: 10, cache: { read: 5_000, write: 0 } }) },
    { id: "u1", type: "user", text: "continue" },
    { id: "a1", type: "assistant", tokens: usage({ input: 40_000, output: 20, cache: { read: 19_640, write: 0 } }) },
  ] as SessionMessageInfo[]

  expect(contextTokens(messages)).toBe(59_640)
  expect(contextTokens(messages)).not.toBe(tokenTotal(lifetime))
})

test("formatTokens uses compact k/M suffixes", () => {
  expect(formatTokens(500)).toBe("500")
  expect(formatTokens(5_900)).toBe("5.9k")
  expect(formatTokens(1_250_000)).toBe("1.3M")
})
