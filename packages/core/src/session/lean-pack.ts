/**
 * FLOW-GENIUS-02 / Stage 6 — lean shared context pack for SessionRunner (and later F3).
 *
 * One assembly surface: mission objective + decisions + constraints + pending +
 * done+evidence + task card + last N messages + source-cited retrieval.
 * Not whole history. Large tool output → artifact pointer + short preview + honest marker.
 *
 * Pure: no DB, clock, or network. Callers supply mission/task/message facts.
 */
export * as SessionLeanPack from "./lean-pack.js"

import { Token } from "../util/token.js"

/** Default recent turns kept verbatim beside the lean pack (Stage 6 last-N). */
export const DEFAULT_RECENT_MESSAGES = 8

/** Preview chars kept when replacing a large tool dump with an artifact pointer. */
export const TOOL_PREVIEW_CHARS = 240

/** Honest marker when tool / message text is truncated (matches compaction honesty). */
export const TRUNCATED_MARKER = "[truncated]"

/** Section header used so merge can detect a pack already present (no duplicate paste). */
export const LEAN_PACK_HEADER = "## Aporetic lean context"

export type DecisionFact = {
  readonly id?: string
  readonly text: string
}

export type ConstraintFact = {
  readonly text: string
}

export type PendingFact = {
  readonly id?: string
  readonly title: string
  readonly state?: string
}

export type DoneFact = {
  readonly id?: string
  readonly title: string
  readonly evidence?: string
}

export type TaskCardFact = {
  readonly id?: string
  readonly title: string
  readonly state?: string
  readonly owner?: string
  readonly body?: string
}

export type MessageFact = {
  readonly id?: string
  readonly role: "user" | "assistant" | "system" | "tool" | string
  readonly text: string
}

export type CitedRetrieval = {
  /** Stable source id or path — required for honesty (no anonymous dumps). */
  readonly source: string
  readonly excerpt: string
}

export type LeanPackInput = {
  readonly objective?: string
  readonly decisions?: ReadonlyArray<DecisionFact>
  readonly constraints?: ReadonlyArray<ConstraintFact>
  readonly pending?: ReadonlyArray<PendingFact>
  readonly done?: ReadonlyArray<DoneFact>
  readonly taskCard?: TaskCardFact
  readonly messages?: ReadonlyArray<MessageFact>
  /** Caps recent messages; default DEFAULT_RECENT_MESSAGES. */
  readonly recentMessageLimit?: number
  readonly retrieval?: ReadonlyArray<CitedRetrieval>
}

export type LeanPackSection =
  | "objective"
  | "decisions"
  | "constraints"
  | "pending"
  | "done"
  | "task"
  | "recent"
  | "retrieval"

export type LeanPack = {
  readonly text: string
  readonly estimatedTokens: number
  readonly sections: ReadonlyArray<LeanPackSection>
  readonly recentKept: number
  readonly recentDropped: number
  readonly toolPointers: number
}

export type ArtifactPointer = {
  readonly text: string
  readonly truncated: boolean
  readonly previewChars: number
  readonly originalChars: number
}

/** Large tool/result dump → pointer + short preview + truncation marker when needed. */
export function artifactPointer(
  output: string,
  opts?: { readonly artifactId?: string; readonly previewChars?: number },
): ArtifactPointer {
  const previewChars = opts?.previewChars ?? TOOL_PREVIEW_CHARS
  const originalChars = [...output].length
  if (originalChars <= previewChars) {
    return { text: output, truncated: false, previewChars: originalChars, originalChars }
  }
  let end = 0
  let kept = 0
  for (const char of output) {
    if (kept === previewChars) break
    end += char.length
    kept++
  }
  const preview = output.slice(0, end)
  const id = opts?.artifactId?.trim()
  const pointer = id && id.length > 0 ? `artifact:${id}` : "artifact:(unsaved)"
  return {
    text: `[${pointer}]\n${preview}\n${TRUNCATED_MARKER}`,
    truncated: true,
    previewChars: kept,
    originalChars,
  }
}

/** Keep the last N messages; older ones are dropped from the lean pack (not deleted from storage). */
export function selectRecentMessages<T>(
  messages: ReadonlyArray<T>,
  limit: number = DEFAULT_RECENT_MESSAGES,
): { readonly kept: ReadonlyArray<T>; readonly dropped: number } {
  const n = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : DEFAULT_RECENT_MESSAGES
  if (messages.length <= n) return { kept: messages, dropped: 0 }
  return { kept: messages.slice(messages.length - n), dropped: messages.length - n }
}

const line = (label: string, value: string) => `${label}: ${value.trim()}`

const bullet = (value: string) => `- ${value.trim()}`

/**
 * Assemble the shared lean pack text. Empty optional sections are omitted.
 * Retrieval entries without a source are skipped (no anonymous dumps).
 */
export function assembleLeanPack(input: LeanPackInput): LeanPack {
  const sections: LeanPackSection[] = []
  const blocks: string[] = [LEAN_PACK_HEADER]
  let toolPointers = 0

  const objective = input.objective?.trim()
  if (objective) {
    sections.push("objective")
    blocks.push("### Objective", objective)
  }

  const decisions = (input.decisions ?? []).filter((d) => d.text.trim().length > 0)
  if (decisions.length > 0) {
    sections.push("decisions")
    blocks.push(
      "### Decisions",
      ...decisions.map((d) => bullet(d.id ? `${d.id}: ${d.text}` : d.text)),
    )
  }

  const constraints = (input.constraints ?? []).filter((c) => c.text.trim().length > 0)
  if (constraints.length > 0) {
    sections.push("constraints")
    blocks.push("### Constraints", ...constraints.map((c) => bullet(c.text)))
  }

  const pending = (input.pending ?? []).filter((p) => p.title.trim().length > 0)
  if (pending.length > 0) {
    sections.push("pending")
    blocks.push(
      "### Pending",
      ...pending.map((p) => {
        const state = p.state ? ` [${p.state}]` : ""
        const id = p.id ? `${p.id} ` : ""
        return bullet(`${id}${p.title}${state}`.trim())
      }),
    )
  }

  const done = (input.done ?? []).filter((d) => d.title.trim().length > 0)
  if (done.length > 0) {
    sections.push("done")
    blocks.push(
      "### Done + evidence",
      ...done.map((d) => {
        const id = d.id ? `${d.id} ` : ""
        const evidence = d.evidence?.trim()
        return evidence
          ? bullet(`${id}${d.title} — evidence: ${evidence}`.trim())
          : bullet(`${id}${d.title}`.trim())
      }),
    )
  }

  const task = input.taskCard
  if (task && task.title.trim().length > 0) {
    sections.push("task")
    const bits = [
      line("Task", task.title),
      task.id ? line("Id", task.id) : undefined,
      task.state ? line("State", task.state) : undefined,
      task.owner ? line("Owner", task.owner) : undefined,
      task.body?.trim() ? task.body.trim() : undefined,
    ].filter((x): x is string => x !== undefined)
    blocks.push("### Task card", ...bits)
  }

  const limit = input.recentMessageLimit ?? DEFAULT_RECENT_MESSAGES
  const { kept, dropped } = selectRecentMessages(input.messages ?? [], limit)
  if (kept.length > 0) {
    sections.push("recent")
    const lines = kept.map((m) => {
      const pointed = artifactPointer(m.text)
      if (pointed.truncated) toolPointers += 1
      const id = m.id ? ` (${m.id})` : ""
      return bullet(`[${m.role}]${id} ${pointed.text}`)
    })
    blocks.push("### Recent messages", ...lines)
  }

  const retrieval = (input.retrieval ?? []).filter(
    (r) => r.source.trim().length > 0 && r.excerpt.trim().length > 0,
  )
  if (retrieval.length > 0) {
    sections.push("retrieval")
    blocks.push(
      "### Cited retrieval",
      ...retrieval.map((r) => {
        const pointed = artifactPointer(r.excerpt)
        if (pointed.truncated) toolPointers += 1
        return bullet(`source:${r.source.trim()} — ${pointed.text}`)
      }),
    )
  }

  const text = blocks.length === 1 ? "" : blocks.join("\n\n")
  return {
    text,
    estimatedTokens: Token.estimate(text),
    sections,
    recentKept: kept.length,
    recentDropped: dropped,
    toolPointers,
  }
}

/** True when `text` already contains a lean pack header (avoid re-paste). */
export function hasLeanPack(text: string | undefined): boolean {
  return typeof text === "string" && text.includes(LEAN_PACK_HEADER)
}

/**
 * Merge lean pack into the SessionRunner `initial` instruction layer once.
 * Empty pack → unchanged initial. Already-present pack → unchanged (no duplicate).
 */
export function mergeLeanPackIntoInitial(initial: string, packText: string | undefined): string {
  const pack = packText?.trim() ?? ""
  if (pack.length === 0) return initial
  if (hasLeanPack(initial)) return initial
  const base = initial.trim()
  return base.length === 0 ? pack : `${pack}\n\n${base}`
}

/**
 * Measure naive full-history paste vs lean pack for fixtures (no invented %).
 * `fullHistory` is the raw concat a bad path would re-inject.
 */
export function measureLeanVsFull(input: {
  readonly fullHistory: string
  readonly pack: LeanPack
}): {
  readonly fullTokens: number
  readonly leanTokens: number
  readonly tokensSaved: number
} {
  const fullTokens = Token.estimate(input.fullHistory)
  const leanTokens = input.pack.estimatedTokens
  return {
    fullTokens,
    leanTokens,
    tokensSaved: Math.max(0, fullTokens - leanTokens),
  }
}
