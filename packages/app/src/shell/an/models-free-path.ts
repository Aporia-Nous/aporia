/**
 * AP-MODELS-01b — free-path default model + client-facing free + your-key product brief.
 * OpenCode Free (no key) is the default; paid = your own API key; Aporetic does not pay for model usage.
 */

/** OpenCode Free catalog alias (keyless Zen path). Not a paid DeepSeek BYOK string. */
export const AN_FREE_PATH_DEFAULT_MODEL = "opencode/big-pickle" as const

/** AnShell Conversation empty-state tip (product brief, not design freestyle). */
export const AN_FREE_BYOK_CONVERSATION_EMPTY =
  "No messages yet — type below to start. Free models: OpenCode Free, or run one locally with Ollama or LM Studio. Paid models: add your own API key. Aporetic does not pay for model usage."

/** Settings → About product brief line. */
export const AN_FREE_BYOK_PRODUCT_BRIEF =
  "Free to start: OpenCode Free (no key needed) and/or models you run locally with Ollama or LM Studio. For paid models, connect your own provider API key. Aporetic does not pay for model usage — there is no separate billing stack."

export function isFreePathDefaultModel(model: string | undefined | null): boolean {
  return (model ?? "").trim() === AN_FREE_PATH_DEFAULT_MODEL
}
