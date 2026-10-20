import { describe, expect, test } from "bun:test"
import {
  MAX_AUTO_COMPACTS_PER_DRAIN,
  STALL_CHURN_ERROR,
  createDrainCompactBudget,
  recordAutoCompactCompleted,
  reserveAutoCompact,
} from "../src/session/runner/drain-compact-budget.js"

describe("AP-ENGINE-E13 drain compact budget", () => {
  test("allows MAX_AUTO_COMPACTS_PER_DRAIN completed auto/overflow slots", () => {
    const budget = createDrainCompactBudget()
    expect(MAX_AUTO_COMPACTS_PER_DRAIN).toBe(2)
    for (let i = 0; i < MAX_AUTO_COMPACTS_PER_DRAIN; i++) {
      expect(reserveAutoCompact(budget)).toEqual({ ok: true })
      recordAutoCompactCompleted(budget)
    }
    expect(budget.used).toBe(MAX_AUTO_COMPACTS_PER_DRAIN)
  })

  test("reserves fail with Failed — stall/churn after the cap", () => {
    const budget = createDrainCompactBudget()
    recordAutoCompactCompleted(budget)
    recordAutoCompactCompleted(budget)
    expect(reserveAutoCompact(budget)).toEqual({ ok: false, error: STALL_CHURN_ERROR })
    expect(STALL_CHURN_ERROR).toEqual({
      type: "compaction.stall",
      message: "Failed — stall/churn",
    })
  })

  test("skipped attempts do not consume the budget until completed", () => {
    const budget = createDrainCompactBudget()
    expect(reserveAutoCompact(budget)).toEqual({ ok: true })
    // No recordAutoCompactCompleted — skipped/failed compact does not count.
    expect(reserveAutoCompact(budget)).toEqual({ ok: true })
    expect(budget.used).toBe(0)
  })
})
