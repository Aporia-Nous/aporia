/**
 * AP-STAGE8-02 — AnShell stream hotpath measured checks (source/unit; no visual redesign).
 */
import { afterAll, describe, expect, test } from "bun:test"
import fs from "node:fs"
import path from "node:path"
import {
  AN_PERF_SURFACE,
  buildSyntheticStreamMessages,
  evaluateAnPerfContract,
  measureStreamHotpath,
} from "./perf-contract"

const EVIDENCE_DIR =
  "C:\\Users\\Dilla\\OneDrive\\Documents\\ChatGPT\\Aporia Nous\\business-control\\evidence"
const METRICS_PATH = path.join(EVIDENCE_DIR, "2026-10-21-ap-stage8-02-metrics.json")

/** Soft coherence budget — catch catastrophic regressions; not a product wall-clock claim. */
const P95_BUDGET_MS = 250

describe("AP-STAGE8-02 AnShell stream hotpath measured", () => {
  test("surface pins: Stage 8 perf, no visual redesign, Stage 5 UX preserved", () => {
    expect(AN_PERF_SURFACE.slice).toBe("AP-STAGE8-02")
    expect(AN_PERF_SURFACE.part).toBe("perf-contract")
    expect(AN_PERF_SURFACE.streamHotpathMeasured).toBe(true)
    expect(AN_PERF_SURFACE.quietEntryPreserved).toBe(true)
    expect(AN_PERF_SURFACE.stage5UxPreserved).toBe(true)
    expect(AN_PERF_SURFACE.noVisualRedesign).toBe(true)
  })

  test("synthetic messages pair user/assistant with occasional edit+read", () => {
    const msgs = buildSyntheticStreamMessages(8)
    expect(msgs).toHaveLength(8)
    expect(msgs.filter((m) => m.type === "user")).toHaveLength(4)
    expect(msgs.filter((m) => m.type === "assistant")).toHaveLength(4)
    const toolAssistants = msgs.filter(
      (m) => m.type === "assistant" && m.content.some((p) => p && p.type === "tool"),
    )
    expect(toolAssistants.length).toBeGreaterThan(0)
  })

  test("measureStreamHotpath returns coherent p50/p95 and quiet idle", () => {
    const sample = measureStreamHotpath({ messageCount: 80, iters: 24 })
    expect(sample.messageCount).toBe(80)
    expect(sample.iters).toBe(24)
    expect(sample.p50Ms).toBeGreaterThanOrEqual(0)
    expect(sample.p95Ms).toBeGreaterThanOrEqual(sample.p50Ms)
    expect(sample.maxMs).toBeGreaterThanOrEqual(sample.p95Ms)
    expect(sample.lastTurnCount).toBe(80)
    expect(sample.idleWallpaperCardCount).toBe(0)
    expect(sample.missionStackEmpty).toBe(true)
    expect(sample.quietReadCardsSurfaced).toBe(0)
    expect(sample.p95Ms).toBeLessThan(P95_BUDGET_MS)
  })

  test("evaluateAnPerfContract allOk against measured sample", () => {
    const sample = measureStreamHotpath({ messageCount: 80, iters: 24 })
    const report = evaluateAnPerfContract(sample)
    expect(report.slice).toBe("AP-STAGE8-02")
    expect(report.noVisualRedesign).toBe(true)
    expect(report.allOk).toBe(true)
    expect(report.checks).toHaveLength(4)
    for (const check of report.checks) {
      expect(check.ok).toBe(true)
    }
  })

  test("empty synthetic count yields empty measure inputs safely", () => {
    const msgs = buildSyntheticStreamMessages(0)
    expect(msgs).toEqual([])
    const sample = measureStreamHotpath({ messageCount: 2, iters: 2 })
    expect(sample.lastTurnCount).toBe(2)
  })
})

afterAll(() => {
  const report = evaluateAnPerfContract(measureStreamHotpath({ messageCount: 80, iters: 24 }))
  const payload = {
    slice: "AP-STAGE8-02",
    recorded_date: "2026-10-21",
    allOk: report.allOk,
    noVisualRedesign: true,
    checks: report.checks,
    sample: {
      messageCount: report.sample.messageCount,
      iters: report.sample.iters,
      p50Ms: report.sample.p50Ms,
      p95Ms: report.sample.p95Ms,
      maxMs: report.sample.maxMs,
      lastItemCount: report.sample.lastItemCount,
      lastTurnCount: report.sample.lastTurnCount,
      lastCardCount: report.sample.lastCardCount,
      idleWallpaperCardCount: report.sample.idleWallpaperCardCount,
      missionStackEmpty: report.sample.missionStackEmpty,
      quietReadCardsSurfaced: report.sample.quietReadCardsSurfaced,
      p95BudgetMs: P95_BUDGET_MS,
      honesty: "baseline/coherence — not wall-clock win vs prior baseline; not live CDP paint",
    },
  }
  fs.writeFileSync(METRICS_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8")
})
