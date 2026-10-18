import type { SessionMessageInfo, TokenUsageInfo } from "@opencode/client/promise"

/** Prompt tokens of a model call: input plus cache read/write. Not cumulative session usage. */
export function promptTokens(tokens: TokenUsageInfo | undefined) {
  if (!tokens) return 0
  return tokens.input + tokens.cache.read + tokens.cache.write
}

/** Model output of a call: output plus reasoning. */
export function summaryTokens(tokens: TokenUsageInfo | undefined) {
  if (!tokens) return 0
  return tokens.output + tokens.reasoning
}

/**
 * Active context after a compaction: the next completed assistant's prompt size.
 * Returns undefined until that request exists so the UI does not invent a number.
 */
export function resultingContextAfterCompaction(
  messages: ReadonlyArray<SessionMessageInfo>,
  compactionID: string,
): number | undefined {
  const start = messages.findIndex((message) => message.id === compactionID)
  if (start < 0) return undefined

  for (let i = start + 1; i < messages.length; i++) {
    const message = messages[i]
    if (!message) continue
    if (message.type === "compaction") return undefined
    if (message.type !== "assistant" || !message.tokens) continue
    const prompt = promptTokens(message.tokens)
    return prompt > 0 ? prompt : undefined
  }

  return undefined
}

export function formatCompactionUsageLabel(input: {
  tokens: TokenUsageInfo | undefined
  resultingContext?: number
  format: (value: number) => string
}): string {
  if (!input.tokens) return ""

  const prompt = promptTokens(input.tokens)
  const summary = summaryTokens(input.tokens)
  if (prompt + summary <= 0) return ""

  const parts = [
    `prompt sent ${input.format(prompt)}`,
    `summary written ${input.format(summary)}`,
  ]

  if (input.resultingContext !== undefined && input.resultingContext > 0) {
    parts.push(`resulting context ${input.format(input.resultingContext)}`)
  }

  return parts.join(" · ")
}
