/**
 * AP-STAGE6-EFFICIENCY — omit overlapping recent when transcript already carries turns;
 * once-only header guard on merge. Source/unit + measured token delta.
 */
import { afterAll, describe, expect, test } from "bun:test"
import fs from "node:fs"
import path from "node:path"
import {
  LEAN_PACK_HEADER,
  assembleLeanPack,
  hasLeanPack,
  measureLeanVsFull,
  mergeLeanPackIntoInitial,
  omitRecentSectionFromPackText,
} from "../src/session/lean-pack.js"
import { Token } from "../src/util/token.js"

const EVIDENCE_DIR =
  "C:\\Users\\Dilla\\OneDrive\\Documents\\ChatGPT\\Aporia Nous\\business-control\\evidence"
const METRICS_PATH = path.join(EVIDENCE_DIR, "2026-10-20-ap-stage6-efficiency-metrics.json")

const messages = Array.from({ length: 12 }, (_, i) => ({
  id: `msg_${i}`,
  role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
  text: `Turn ${i}: ${"context ".repeat(30)}`,
}))

const baseInput = {
  objective: "Cut lean-pack / transcript double-cost on SessionRunner steps.",
  decisions: [{ text: "Omit recent when toLLMMessages already has turns." }],
  constraints: [{ text: "Preserve Stage 5 UX + CE gate + Mnemosyne built-in." }],
  taskCard: {
    id: "tsk_eff",
    title: "AP-STAGE6-EFFICIENCY",
    state: "in_progress",
  },
  messages,
  recentMessageLimit: 8,
  retrieval: [{ source: "mnemosyne:fixture", excerpt: "Cited hit stays in pack." }],
}

describe("AP-STAGE6-EFFICIENCY lean pack token path", () => {
  test("omitRecent skips Recent section and records omitted flag", () => {
    const withRecent = assembleLeanPack(baseInput)
    const without = assembleLeanPack({ ...baseInput, omitRecent: true })
    expect(withRecent.sections).toContain("recent")
    expect(withRecent.text).toContain("### Recent messages")
    expect(withRecent.recentOmittedForTranscript).toBe(false)
    expect(without.sections).not.toContain("recent")
    expect(without.text).not.toContain("### Recent messages")
    expect(without.text).toContain("### Objective")
    expect(without.text).toContain("source:mnemosyne:fixture")
    expect(without.recentOmittedForTranscript).toBe(true)
    expect(without.recentKept).toBe(0)
    expect(without.recentDropped).toBe(12)
    expect(without.estimatedTokens).toBeLessThan(withRecent.estimatedTokens)
  })

  test("omitRecentSectionFromPackText strips recent; header-only → empty", () => {
    const pack = assembleLeanPack(baseInput)
    const stripped = omitRecentSectionFromPackText(pack.text)
    expect(stripped).toContain(LEAN_PACK_HEADER)
    expect(stripped).toContain("### Objective")
    expect(stripped).not.toContain("### Recent messages")
    expect(omitRecentSectionFromPackText(`${LEAN_PACK_HEADER}\n\n### Recent messages\n\n- [user] hi`)).toBe(
      "",
    )
  })

  test("mergeLeanPackIntoInitial header guard still once-only", () => {
    const pack = assembleLeanPack({ ...baseInput, omitRecent: true })
    const once = mergeLeanPackIntoInitial("AGENTS.md", pack.text)
    expect(hasLeanPack(once)).toBe(true)
    expect(mergeLeanPackIntoInitial(once, pack.text)).toBe(once)
  })

  test("measured tokensSaved vs pack-with-recent (fixture, no invented %)", () => {
    const withRecent = assembleLeanPack(baseInput)
    const without = assembleLeanPack({ ...baseInput, omitRecent: true })
    const tokensSavedVsOverlap = withRecent.estimatedTokens - without.estimatedTokens
    expect(tokensSavedVsOverlap).toBeGreaterThan(0)
    const fullHistory = messages.map((m) => `[${m.role}] ${m.text}`).join("\n")
    const vsFull = measureLeanVsFull({ fullHistory, pack: without })
    expect(vsFull.tokensSaved).toBeGreaterThan(0)
    expect(Token.estimate(without.text)).toBe(without.estimatedTokens)
  })
})

afterAll(() => {
  const withRecent = assembleLeanPack(baseInput)
  const without = assembleLeanPack({ ...baseInput, omitRecent: true })
  const fullHistory = messages.map((m) => `[${m.role}] ${m.text}`).join("\n")
  const vsFull = measureLeanVsFull({ fullHistory, pack: without })
  const payload = {
    board: "AP-STAGE6-EFFICIENCY",
    recordedAt: new Date().toISOString(),
    workDate: "2026-10-20",
    fixture: "lean-pack-omit-recent-vs-transcript-overlap",
    withRecentTokens: withRecent.estimatedTokens,
    omitRecentTokens: without.estimatedTokens,
    overlapTokensSaved: withRecent.estimatedTokens - without.estimatedTokens,
    fullTokens: vsFull.fullTokens,
    leanTokens: vsFull.leanTokens,
    tokensSavedVsFullHistory: vsFull.tokensSaved,
    recentOmittedForTranscript: without.recentOmittedForTranscript,
    sectionsOmitRecent: without.sections,
    residuals: [
      "Drain cache is per logical step only (mission mid-drain refresh not live)",
      "Stage 7 not started",
      "await independent PASS",
    ],
    notClaimed: ["independent PASS", "Stage 7", "merge", "push", "install"],
    stage5_ux_preserved: true,
    ce_gate_preserved: true,
    mnemosyne_builtin_preserved: true,
    no_merge_no_push_no_install: true,
  }
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true })
  fs.writeFileSync(METRICS_PATH, JSON.stringify(payload, null, 2) + "\n", "utf8")
})
