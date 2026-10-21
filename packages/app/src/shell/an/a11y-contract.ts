/**
 * AP-STAGE8-01 — AnShell a11y contract (non-design).
 *
 * Pins existing Stage 5 UX accessibility contracts: reduced-motion, focus-visible,
 * and landmark aria labels. Does NOT invent visual redesign, brand look changes,
 * or Review/Computer layout freestyle. Visual fidelity vs mockups stays deferred.
 */

export const AN_A11Y_SURFACE = {
  slice: "AP-STAGE8-01",
  part: "a11y-contract",
  /** Build-list Stage 8: reduced motion + keyboard focus — not visual redesign. */
  reducedMotionRequired: true as const,
  focusVisibleRequired: true as const,
  landmarkAriaRequired: true as const,
  /** Ali continue-finish 2026-10-21: except design — no freestyle UI. */
  noVisualRedesign: true as const,
  stage5UxPreserved: true as const,
} as const

/** Required landmark / control aria-label substrings already in Stage 5 UX sources. */
export const AN_A11Y_LANDMARK_LABELS = [
  "AN navigation",
  "Bot Team roster",
  "Mission conversation",
  "Attention",
  "Conversation",
  "Takeover controls",
  "Open Review sidebar",
  "Collapse Review sidebar",
] as const

export type AnA11yContractCheck = {
  readonly id: string
  readonly ok: boolean
  readonly detail: string
}

export type AnA11yContractReport = {
  readonly slice: "AP-STAGE8-01"
  readonly allOk: boolean
  readonly checks: readonly AnA11yContractCheck[]
  readonly noVisualRedesign: true
}

/** True when CSS text includes a reduced-motion rule that disables animation/transition. */
export function hasReducedMotionContract(cssText: string): boolean {
  const reduced = /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/.test(cssText)
  if (!reduced) return false
  return /animation\s*:\s*none/i.test(cssText) && /transition\s*:\s*none/i.test(cssText)
}

/** True when interactive focus-visible outline/box-shadow contract is present. */
export function hasFocusVisibleContract(cssText: string): boolean {
  return (
    /:focus-visible/.test(cssText) &&
    (/box-shadow\s*:\s*var\(--an-focus\)/.test(cssText) || /outline\s*:/.test(cssText))
  )
}

/** Count how many required landmark labels appear in source text. */
export function countLandmarkLabels(sourceText: string): {
  readonly found: number
  readonly missing: readonly string[]
} {
  const missing: string[] = []
  let found = 0
  for (const label of AN_A11Y_LANDMARK_LABELS) {
    if (sourceText.includes(label)) found += 1
    else missing.push(label)
  }
  return { found, missing }
}

/**
 * Evaluate a11y contracts from shell CSS + concatenated TSX source.
 * Source/unit only — does not claim live CDP or Stage 8 visual PASS.
 */
export function evaluateAnA11yContract(input: {
  readonly shellCss: string
  readonly shellTsx: string
}): AnA11yContractReport {
  const checks: AnA11yContractCheck[] = []

  const reducedOk = hasReducedMotionContract(input.shellCss)
  checks.push({
    id: "A1-reduced-motion",
    ok: reducedOk,
    detail: reducedOk
      ? "prefers-reduced-motion: reduce disables animation+transition on an-shell"
      : "missing reduced-motion contract in an-shell.css",
  })

  const focusOk = hasFocusVisibleContract(input.shellCss)
  checks.push({
    id: "A2-focus-visible",
    ok: focusOk,
    detail: focusOk
      ? "focus-visible contract present for interactive controls"
      : "missing focus-visible contract in an-shell.css",
  })

  const landmarks = countLandmarkLabels(input.shellTsx)
  const landmarksOk = landmarks.missing.length === 0
  checks.push({
    id: "A3-landmark-aria",
    ok: landmarksOk,
    detail: landmarksOk
      ? `all ${AN_A11Y_LANDMARK_LABELS.length} landmark aria labels present`
      : `missing landmark labels: ${landmarks.missing.join(", ")}`,
  })

  const noRedesignOk = AN_A11Y_SURFACE.noVisualRedesign === true
  checks.push({
    id: "A4-no-visual-redesign",
    ok: noRedesignOk,
    detail: "slice scope excludes visual redesign / Review-Computer freestyle",
  })

  return {
    slice: "AP-STAGE8-01",
    allOk: checks.every((c) => c.ok),
    checks,
    noVisualRedesign: true,
  }
}
