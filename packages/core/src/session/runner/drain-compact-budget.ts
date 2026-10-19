import type { SessionError } from "@opencode/schema/session-error"

/**
 * AP-ENGINE-E13: hard cap on completed auto/overflow compactions per drain.
 * Manual `/compact` is uncapped. Overflow recovery once (`recoverOverflow`) remains;
 * this budget stops compact↔retry stall/churn after the capped completions.
 */
export const MAX_AUTO_COMPACTS_PER_DRAIN = 2

/** Actionable Failed surface when the drain compact budget is exhausted. */
export const STALL_CHURN_ERROR = {
  type: "compaction.stall",
  message: "Failed — stall/churn",
} as const satisfies SessionError.Error

export type DrainCompactBudget = {
  used: number
}

export const createDrainCompactBudget = (): DrainCompactBudget => ({ used: 0 })

/** Reserve a slot before starting an auto/overflow compact. */
export const reserveAutoCompact = (
  budget: DrainCompactBudget,
): { readonly ok: true } | { readonly ok: false; readonly error: typeof STALL_CHURN_ERROR } => {
  if (budget.used >= MAX_AUTO_COMPACTS_PER_DRAIN) {
    return { ok: false, error: STALL_CHURN_ERROR }
  }
  return { ok: true }
}

export const recordAutoCompactCompleted = (budget: DrainCompactBudget): void => {
  budget.used += 1
}
