// APORIA: derive real numbers from the session's own messages (no estimates).
// Active context (last assistant prompt) and lifetime totals are different quantities — never conflate them in UI.
import type { SessionMessageInfo, TokenUsageInfo } from "@opencode/client/promise"

/** Session lifetime usage sum (all recorded token fields). Not the active model context. */
export function tokenTotal(tokens: TokenUsageInfo | undefined) {
  if (!tokens) return 0
  return tokens.input + tokens.output + tokens.reasoning + tokens.cache.read + tokens.cache.write
}

/** Tokens the last completed model call actually sent as context (active context). */
export function contextTokens(messages: SessionMessageInfo[]) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message?.type !== "assistant" || !message.tokens) continue
    const t = message.tokens
    return t.input + t.cache.read + t.cache.write
  }
  return 0
}

const FILE_TOOLS = new Set(["write", "edit", "patch", "multiedit", "apply_patch"])

function pathFromInput(input: unknown) {
  if (!input || typeof input !== "object") return undefined
  const record = input as Record<string, unknown>
  const value = record.filePath ?? record.file_path ?? record.path
  return typeof value === "string" ? value : undefined
}

export type TouchedFile = { path: string; via: string }

/** Files the agent created or edited: snapshot file lists plus file-writing tool calls. */
export function touchedFiles(messages: SessionMessageInfo[]): TouchedFile[] {
  const seen = new Map<string, TouchedFile>()
  for (const message of messages) {
    if (message.type !== "assistant") continue
    for (const file of message.snapshot?.files ?? []) seen.set(file, { path: file, via: "snapshot" })
    for (const part of message.content) {
      if (part.type !== "tool" || !FILE_TOOLS.has(part.name)) continue
      const path = pathFromInput((part.state as { input?: unknown }).input)
      if (path) seen.set(path, { path, via: part.name })
    }
  }
  return [...seen.values()]
}

export function formatTokens(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`
  return String(value)
}
