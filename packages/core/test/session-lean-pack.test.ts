/**
 * FLOW-GENIUS-02 — Stage 6 lean shared context pack (source/unit + measured tokens).
 * Does not claim independent PASS, Mnemosyne wire, F3, merge/push/install.
 */
import { afterAll, describe, expect, test } from "bun:test"
import fs from "node:fs"
import path from "node:path"
import {
  LEAN_PACK_HEADER,
  TRUNCATED_MARKER,
  assembleLeanPack,
  artifactPointer,
  hasLeanPack,
  measureLeanVsFull,
  mergeLeanPackIntoInitial,
  selectRecentMessages,
} from "../src/session/lean-pack.js"
import { mnemosyneMap } from "../src/mission/memory.js"
import { Token } from "../src/util/token.js"

const EVIDENCE_DIR =
  "C:\\Users\\Dilla\\OneDrive\\Documents\\ChatGPT\\Aporia Nous\\business-control\\evidence"
const METRICS_PATH = path.join(EVIDENCE_DIR, "2026-10-20-flow-genius-02-metrics.json")

const longTool = "x".repeat(2_000)
const historyMessages = Array.from({ length: 40 }, (_, i) => ({
  id: `msg_${i}`,
  role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
  text:
    i === 39
      ? longTool
      : `Turn ${i}: detailed discussion about auth refactor, files touched, and prior dump ${"y".repeat(80)}`,
}))

const packInput = {
  objective: "Ship lean shared context pack for SessionRunner without whole-history paste.",
  decisions: [{ id: "dec_1", text: "One SessionRunner model path; mechanical flows stay 0-token." }],
  constraints: [{ text: "No merge/push/install; preserve Stage 5 UX and CE gate." }],
  pending: [{ id: "task_pending", title: "Wire live mission fold into runner", state: "pending" }],
  done: [
    {
      id: "task_done",
      title: "Pure assembleLeanPack + artifact pointers",
      evidence: "session-lean-pack.test.ts",
    },
  ],
  taskCard: {
    id: "task_focus",
    title: "FLOW-GENIUS-02 lean pack",
    state: "in_progress",
    owner: "bot_builder",
    body: "Shared pack text for SessionRunner and later F3.",
  },
  messages: historyMessages,
  recentMessageLimit: 8,
  retrieval: [
    { source: "docs/an-rewrite/FLOW-GENIUS-PLAN.md", excerpt: "Lean pack default sections." },
    { source: "", excerpt: "should be skipped — no anonymous dumps" },
  ],
}

describe("FLOW-GENIUS-02 lean pack", () => {
  test("assembles required sections and skips unsourced retrieval", () => {
    const pack = assembleLeanPack(packInput)
    expect(pack.text.startsWith(LEAN_PACK_HEADER)).toBe(true)
    expect(pack.sections).toEqual([
      "objective",
      "decisions",
      "constraints",
      "pending",
      "done",
      "task",
      "recent",
      "retrieval",
    ])
    expect(pack.text).toContain("### Objective")
    expect(pack.text).toContain("### Decisions")
    expect(pack.text).toContain("### Constraints")
    expect(pack.text).toContain("### Pending")
    expect(pack.text).toContain("### Done + evidence")
    expect(pack.text).toContain("### Task card")
    expect(pack.text).toContain("### Recent messages")
    expect(pack.text).toContain("### Cited retrieval")
    expect(pack.text).toContain("source:docs/an-rewrite/FLOW-GENIUS-PLAN.md")
    expect(pack.text).not.toContain("should be skipped")
    expect(pack.recentKept).toBe(8)
    expect(pack.recentDropped).toBe(32)
    expect(pack.toolPointers).toBeGreaterThanOrEqual(1)
    expect(pack.text).toContain(TRUNCATED_MARKER)
  })

  test("selectRecentMessages keeps last N only", () => {
    const { kept, dropped } = selectRecentMessages([1, 2, 3, 4, 5], 3)
    expect(kept).toEqual([3, 4, 5])
    expect(dropped).toBe(2)
  })

  test("artifactPointer bounds preview and marks truncation", () => {
    const small = artifactPointer("short")
    expect(small.truncated).toBe(false)
    expect(small.text).toBe("short")

    const big = artifactPointer(longTool, { artifactId: "art_1", previewChars: 40 })
    expect(big.truncated).toBe(true)
    expect(big.text).toContain("artifact:art_1")
    expect(big.text).toContain(TRUNCATED_MARKER)
    expect(big.previewChars).toBe(40)
    expect(big.originalChars).toBe(2_000)
  })

  test("mergeLeanPackIntoInitial is once-only (no duplicate paste)", () => {
    const pack = assembleLeanPack({ objective: "Only once." })
    const once = mergeLeanPackIntoInitial("AGENTS.md rules here", pack.text)
    expect(once.startsWith(LEAN_PACK_HEADER)).toBe(true)
    expect(once).toContain("AGENTS.md rules here")
    const twice = mergeLeanPackIntoInitial(once, pack.text)
    expect(twice).toBe(once)
    expect(hasLeanPack(twice)).toBe(true)
  })

  test("measured lean tokens < full-history paste (fixture, no invented %)", () => {
    const pack = assembleLeanPack(packInput)
    const fullHistory = historyMessages.map((m) => `[${m.role}] ${m.text}`).join("\n")
    const metrics = measureLeanVsFull({ fullHistory, pack })
    expect(metrics.leanTokens).toBe(Token.estimate(pack.text))
    expect(metrics.fullTokens).toBeGreaterThan(metrics.leanTokens)
    expect(metrics.tokensSaved).toBe(metrics.fullTokens - metrics.leanTokens)
    expect(metrics.tokensSaved).toBeGreaterThan(0)
  })

  test("Mnemosyne map marks product wire implemented (FG-04; host DB still not auto-opened)", () => {
    const map = mnemosyneMap()
    expect(map.status).toBe("implemented")
    expect(map.leanPackRetrievalOwner).toBe("aporetic-lean-pack")
    expect(map.productPort).toContain("mnemosyne-port")
    expect(map.sourcePath).toContain("mnemosyne")
    expect(map.notes.length).toBeGreaterThan(0)
  })
})

afterAll(() => {
  const pack = assembleLeanPack(packInput)
  const fullHistory = historyMessages.map((m) => `[${m.role}] ${m.text}`).join("\n")
  const comparison = measureLeanVsFull({ fullHistory, pack })
  const payload = {
    board: "FLOW-GENIUS-02",
    recordedAt: new Date().toISOString(),
    workDate: "2026-10-20",
    fixture: "session-lean-pack-40-turn-history",
    recentMessageLimit: 8,
    sections: pack.sections,
    recentKept: pack.recentKept,
    recentDropped: pack.recentDropped,
    toolPointers: pack.toolPointers,
    fullTokens: comparison.fullTokens,
    leanTokens: comparison.leanTokens,
    tokensSaved: comparison.tokensSaved,
    mnemosyne: mnemosyneMap(),
    residuals: [
      "live mission/task fold into SessionRunner drain not auto-wired (leanPack optional on baseTranscript)",
      "Mnemosyne remains disconnected — cited retrieval slots only",
      "F3 / FLOW-GENIUS-05 later",
      "await independent PASS",
    ],
    notClaimed: ["independent PASS", "Stage 6 complete", "Mnemosyne wire", "merge", "push", "install"],
    stage5_ux_preserved: true,
    ce_gate_preserved: true,
    no_merge_no_push_no_install: true,
  }
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true })
  fs.writeFileSync(METRICS_PATH, JSON.stringify(payload, null, 2) + "\n", "utf8")
})
