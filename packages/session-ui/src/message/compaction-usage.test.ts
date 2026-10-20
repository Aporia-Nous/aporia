import { expect, test } from "bun:test"
import type { SessionMessageInfo, TokenUsageInfo } from "@opencode/client/promise"
import {
  formatCompactionUsageLabel,
  promptTokens,
  resultingContextAfterCompaction,
  summaryTokens,
} from "./compaction-usage"

const tokens = (partial: Partial<TokenUsageInfo> & Pick<TokenUsageInfo, "input" | "output">): TokenUsageInfo => ({
  reasoning: 0,
  ...partial,
  cache: partial.cache ?? { read: 0, write: 0 },
})

test("promptTokens sums input and cache; summaryTokens sums output and reasoning", () => {
  const usage = tokens({ input: 100, output: 20, reasoning: 5, cache: { read: 40, write: 10 } })
  expect(promptTokens(usage)).toBe(150)
  expect(summaryTokens(usage)).toBe(25)
})

test("formatCompactionUsageLabel names prompt and summary; omits resulting until known", () => {
  const usage = tokens({ input: 67_748, output: 6_033, reasoning: 759 })
  expect(formatCompactionUsageLabel({ tokens: usage, format: String })).toBe(
    "prompt sent 67748 · summary written 6792",
  )
  expect(
    formatCompactionUsageLabel({ tokens: usage, resultingContext: 59_640, format: String }),
  ).toBe("prompt sent 67748 · summary written 6792 · resulting context 59640")
})

test("resultingContextAfterCompaction uses the next assistant prompt and stops at the next compaction", () => {
  const messages = [
    { id: "c1", type: "compaction", status: "completed", tokens: tokens({ input: 1, output: 1 }) },
    { id: "u1", type: "user", text: "hi" },
    {
      id: "a1",
      type: "assistant",
      tokens: tokens({ input: 500, output: 10, cache: { read: 100, write: 0 } }),
    },
    { id: "c2", type: "compaction", status: "completed" },
    {
      id: "a2",
      type: "assistant",
      tokens: tokens({ input: 900, output: 10 }),
    },
  ] as SessionMessageInfo[]

  expect(resultingContextAfterCompaction(messages, "c1")).toBe(600)
  expect(resultingContextAfterCompaction(messages, "c2")).toBe(900)
  expect(resultingContextAfterCompaction(messages, "missing")).toBeUndefined()
})

test("resultingContextAfterCompaction stays undefined when no later assistant has tokens", () => {
  const messages = [
    { id: "c1", type: "compaction", status: "completed", tokens: tokens({ input: 10, output: 2 }) },
    { id: "u1", type: "user", text: "go" },
  ] as SessionMessageInfo[]

  expect(resultingContextAfterCompaction(messages, "c1")).toBeUndefined()
})
