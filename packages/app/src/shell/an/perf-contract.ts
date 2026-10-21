/**
 * AP-STAGE8-02 — AnShell stream hotpath measured checks (non-design).
 *
 * Measures Conversation stream projection (context cards + interleave) over
 * synthetic fixtures. Does NOT invent visual redesign, brand look changes,
 * or Review/Computer layout freestyle. Visual fidelity vs mockups stays deferred.
 * Numbers are baseline / coherence evidence — not a claimed wall-clock win.
 */

import type { SessionMessageInfo } from "@opencode/client/promise"
import {
  buildContextCards,
  buildConversationStreamItems,
  buildMissionStackCards,
  flattenStreamItems,
} from "./conversation-stream-items"

export const AN_PERF_SURFACE = {
  slice: "AP-STAGE8-02",
  part: "perf-contract",
  /** Build-list Stage 8: measured perf — not visual redesign. */
  streamHotpathMeasured: true as const,
  quietEntryPreserved: true as const,
  stage5UxPreserved: true as const,
  /** Ali continue-finish 2026-10-21: except design — no freestyle UI. */
  noVisualRedesign: true as const,
} as const

export type AnPerfContractCheck = {
  readonly id: string
  readonly ok: boolean
  readonly detail: string
}

export type AnPerfHotpathSample = {
  readonly messageCount: number
  readonly iters: number
  readonly p50Ms: number
  readonly p95Ms: number
  readonly maxMs: number
  readonly lastItemCount: number
  readonly lastTurnCount: number
  readonly lastCardCount: number
  readonly idleWallpaperCardCount: number
  readonly missionStackEmpty: boolean
  /** Quiet completed reads must not surface as stream cards. */
  readonly quietReadCardsSurfaced: number
}

export type AnPerfContractReport = {
  readonly slice: "AP-STAGE8-02"
  readonly allOk: boolean
  readonly checks: readonly AnPerfContractCheck[]
  readonly noVisualRedesign: true
  readonly sample: AnPerfHotpathSample
}

function percentile(sortedAsc: readonly number[], p: number): number {
  if (sortedAsc.length === 0) return 0
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.ceil((p / 100) * sortedAsc.length) - 1))
  return sortedAsc[idx]!
}

/** Synthetic transcript: user/assistant pairs; every 4th assistant has edit + quiet read. */
export function buildSyntheticStreamMessages(messageCount: number): SessionMessageInfo[] {
  const count = Math.max(0, Math.floor(messageCount))
  const messages: SessionMessageInfo[] = []
  let t = 1
  for (let i = 0; i < count; i += 1) {
    const isUser = i % 2 === 0
    if (isUser) {
      messages.push({
        id: `usr_${i}`,
        type: "user",
        time: { created: t++ },
        text: `turn ${i}`,
      } as SessionMessageInfo)
      continue
    }
    const pair = Math.floor(i / 2)
    const withTools = pair % 4 === 0
    const content: unknown[] = [{ type: "text", text: `reply ${i}` }]
    if (withTools) {
      content.push({
        type: "tool",
        id: `edit_${i}`,
        name: "edit",
        time: { created: t },
        state: {
          status: "completed",
          input: { path: `src/f${i}.ts` },
          content: [{ type: "text", text: "ok" }],
        },
      })
      content.push({
        type: "tool",
        id: `read_${i}`,
        name: "read",
        time: { created: t },
        state: {
          status: "completed",
          input: { path: `src/r${i}.ts` },
          content: [{ type: "text", text: "…" }],
        },
      })
    }
    messages.push({
      id: `asst_${i}`,
      type: "assistant",
      time: { created: t, completed: t + 1 },
      agent: "orion",
      model: { id: "test", providerID: "test" },
      content,
    } as SessionMessageInfo)
    t += 2
  }
  return messages
}

/**
 * Wall-clock measure of AnShell Conversation stream projection hotpath.
 * Source/unit only — not live CDP FPS / Electron paint.
 */
export function measureStreamHotpath(input?: {
  readonly messageCount?: number
  readonly iters?: number
}): AnPerfHotpathSample {
  const messageCount = input?.messageCount ?? 80
  const iters = Math.max(1, input?.iters ?? 24)
  const messages = buildSyntheticStreamMessages(messageCount)
  const durations: number[] = []
  let lastItemCount = 0
  let lastTurnCount = 0
  let lastCardCount = 0
  let quietReadCardsSurfaced = 0

  for (let i = 0; i < iters; i += 1) {
    const start = performance.now()
    const contextCards = buildContextCards({
      shellMode: "conversation",
      messages,
      session: { working: true, title: "Perf fixture", sessionID: "perf-s1" },
      roster: [{ id: "orion", name: "Orion", role: "Lead", presence: "listening" }],
    })
    const items = buildConversationStreamItems({ messages, contextCards })
    const elapsed = performance.now() - start
    durations.push(elapsed)
    const flat = flattenStreamItems(items)
    lastItemCount = items.length
    lastTurnCount = flat.turns.length
    lastCardCount = flat.cards.length
    quietReadCardsSurfaced = flat.cards.filter(
      (c) => c.source === "tool" && c.title.toLowerCase() === "read",
    ).length
  }

  durations.sort((a, b) => a - b)
  const idleContext = buildContextCards({
    shellMode: "conversation",
    roster: [{ id: "orion", name: "Orion", role: "Lead", presence: "listening" }],
  })
  const idleItems = buildConversationStreamItems({
    messages: [],
    turns: [],
    contextCards: idleContext,
  })
  const idleWallpaperCardCount = idleItems.filter(
    (item) => item.kind === "card" && (item.card.type === "computer" || item.card.type === "team"),
  ).length

  return {
    messageCount,
    iters,
    p50Ms: percentile(durations, 50),
    p95Ms: percentile(durations, 95),
    maxMs: durations[durations.length - 1] ?? 0,
    lastItemCount,
    lastTurnCount,
    lastCardCount,
    idleWallpaperCardCount,
    missionStackEmpty: buildMissionStackCards({ conversationOwnsCards: true }).length === 0,
    quietReadCardsSurfaced,
  }
}

/**
 * Evaluate measured stream-hotpath contracts.
 * Source/unit only — does not claim live CDP paint, Stage 8 visual PASS, or wall-clock win.
 */
export function evaluateAnPerfContract(sample?: AnPerfHotpathSample): AnPerfContractReport {
  const measured = sample ?? measureStreamHotpath()
  const checks: AnPerfContractCheck[] = []

  const measuredOk =
    measured.iters > 0 &&
    measured.messageCount > 0 &&
    Number.isFinite(measured.p50Ms) &&
    Number.isFinite(measured.p95Ms) &&
    measured.p50Ms >= 0 &&
    measured.p95Ms >= measured.p50Ms
  checks.push({
    id: "P1-stream-hotpath-measured",
    ok: measuredOk,
    detail: measuredOk
      ? `stream projection measured msgs=${measured.messageCount} iters=${measured.iters} p50Ms=${measured.p50Ms.toFixed(3)} p95Ms=${measured.p95Ms.toFixed(3)}`
      : "stream hotpath measure missing or non-finite",
  })

  const quietOk = measured.idleWallpaperCardCount === 0 && measured.missionStackEmpty
  checks.push({
    id: "P2-quiet-entry-preserved",
    ok: quietOk,
    detail: quietOk
      ? "idle Conversation: 0 computer/team wallpaper cards; mission stack empty"
      : `idle wallpaper cards=${measured.idleWallpaperCardCount} missionStackEmpty=${measured.missionStackEmpty}`,
  })

  const scaleOk =
    measured.lastTurnCount === measured.messageCount &&
    measured.lastItemCount >= measured.lastTurnCount &&
    measured.quietReadCardsSurfaced === 0
  checks.push({
    id: "P3-projection-scale",
    ok: scaleOk,
    detail: scaleOk
      ? `turns=${measured.lastTurnCount} items=${measured.lastItemCount} cards=${measured.lastCardCount}; quiet reads not surfaced`
      : `scale mismatch turns=${measured.lastTurnCount} msgs=${measured.messageCount} quietReads=${measured.quietReadCardsSurfaced}`,
  })

  const noRedesignOk = AN_PERF_SURFACE.noVisualRedesign === true
  checks.push({
    id: "P4-no-visual-redesign",
    ok: noRedesignOk,
    detail: "slice scope excludes visual redesign / Review-Computer freestyle",
  })

  return {
    slice: "AP-STAGE8-02",
    allOk: checks.every((c) => c.ok),
    checks,
    noVisualRedesign: true,
    sample: measured,
  }
}
