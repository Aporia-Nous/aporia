import type { SessionMessageInfo } from "@opencode/client/promise"

/** One visible turn in the AN-owned Conversation stream (presentation only). */
export type AnConversationTurn = {
  id: string
  role: "user" | "assistant"
  text: string
  /** Assistant agent id when known — display only. */
  agent?: string
  streaming?: boolean
}

function assistantText(msg: Extract<SessionMessageInfo, { type: "assistant" }>): {
  text: string
  streaming: boolean
} {
  const chunks: string[] = []
  for (const part of msg.content) {
    if (!part || part.type !== "text") continue
    const t = typeof part.text === "string" ? part.text : ""
    if (t.length) chunks.push(t)
  }
  const text = chunks.join("\n\n").trim()
  const streaming = !msg.time?.completed && text.length > 0
  return { text, streaming }
}

/**
 * Map session messages → AN conversation turns.
 * Owns presentation of user + assistant text; tools map to in-conversation cards
 * via buildConversationStreamItems (AP-STAGE4-15). Skips empty / non-text message kinds.
 */
export function messagesToConversationTurns(
  messages: readonly SessionMessageInfo[],
): AnConversationTurn[] {
  const turns: AnConversationTurn[] = []
  for (const msg of messages) {
    if (!msg) continue
    if (msg.type === "user") {
      const text = typeof msg.text === "string" ? msg.text.trim() : ""
      if (!text) continue
      turns.push({ id: msg.id, role: "user", text })
      continue
    }
    if (msg.type === "assistant") {
      const { text, streaming } = assistantText(msg)
      if (!text) continue
      turns.push({
        id: msg.id,
        role: "assistant",
        text,
        agent: msg.agent,
        streaming,
      })
    }
  }
  return turns
}
