/**
 * AP-MODELS-01b — free-path default model + honest free+BYOK product brief copy.
 * OpenCode Free (keyless Zen alias) is the default; paid = BYOK; Aporetic does not subsidize inference.
 */

/** OpenCode Free catalog alias (keyless Zen path). Not a paid DeepSeek BYOK string. */
export const AN_FREE_PATH_DEFAULT_MODEL = "opencode/big-pickle" as const

/** AnShell Conversation empty-state tip (product brief, not design freestyle). */
export const AN_FREE_BYOK_CONVERSATION_EMPTY =
  "No messages yet — send from the composer. Free models: OpenCode Free or local (Ollama / LM Studio). Paid models: your key (BYOK). Aporetic does not subsidize inference."

/** Settings → About product brief line. */
export const AN_FREE_BYOK_PRODUCT_BRIEF =
  "Free path: OpenCode Free (keyless) and/or local Ollama / LM Studio. Paid path: connect your own provider key (BYOK). Aporetic does not subsidize inference — no second model stack."

export function isFreePathDefaultModel(model: string | undefined | null): boolean {
  return (model ?? "").trim() === AN_FREE_PATH_DEFAULT_MODEL
}
