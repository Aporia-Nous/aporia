/**
 * AP-STAGE8-01 — AnShell a11y contract (source/unit; no visual redesign).
 */
import { afterAll, describe, expect, test } from "bun:test"
import fs from "node:fs"
import path from "node:path"
import {
  AN_A11Y_LANDMARK_LABELS,
  AN_A11Y_SURFACE,
  evaluateAnA11yContract,
  hasFocusVisibleContract,
  hasReducedMotionContract,
} from "./a11y-contract"

const shellDir = import.meta.dir
const shellCss = fs.readFileSync(path.join(shellDir, "an-shell.css"), "utf8")
const shellTsx = [
  fs.readFileSync(path.join(shellDir, "an-shell.tsx"), "utf8"),
  fs.readFileSync(path.join(shellDir, "session-layout.tsx"), "utf8"),
  fs.readFileSync(path.join(shellDir, "conversation-stream.tsx"), "utf8"),
  fs.readFileSync(path.join(shellDir, "review-panel.tsx"), "utf8"),
].join("\n")

const EVIDENCE_DIR =
  "C:\\Users\\Dilla\\OneDrive\\Documents\\ChatGPT\\Aporia Nous\\business-control\\evidence"
const METRICS_PATH = path.join(EVIDENCE_DIR, "2026-10-21-ap-stage8-01-metrics.json")

describe("AP-STAGE8-01 AnShell a11y contract", () => {
  test("surface pins: Stage 8 a11y, no visual redesign, Stage 5 UX preserved", () => {
    expect(AN_A11Y_SURFACE.slice).toBe("AP-STAGE8-01")
    expect(AN_A11Y_SURFACE.part).toBe("a11y-contract")
    expect(AN_A11Y_SURFACE.reducedMotionRequired).toBe(true)
    expect(AN_A11Y_SURFACE.focusVisibleRequired).toBe(true)
    expect(AN_A11Y_SURFACE.landmarkAriaRequired).toBe(true)
    expect(AN_A11Y_SURFACE.noVisualRedesign).toBe(true)
    expect(AN_A11Y_SURFACE.stage5UxPreserved).toBe(true)
  })

  test("an-shell.css has prefers-reduced-motion disable contract", () => {
    expect(hasReducedMotionContract(shellCss)).toBe(true)
    expect(shellCss).toContain("prefers-reduced-motion")
    expect(shellCss).toContain("animation: none")
    expect(shellCss).toContain("transition: none")
  })

  test("an-shell.css has focus-visible interactive contract", () => {
    expect(hasFocusVisibleContract(shellCss)).toBe(true)
    expect(shellCss).toContain(":focus-visible")
    expect(shellCss).toContain("var(--an-focus)")
  })

  test("landmark aria labels present in Stage 5 UX sources", () => {
    for (const label of AN_A11Y_LANDMARK_LABELS) {
      expect(shellTsx.includes(label)).toBe(true)
    }
  })

  test("evaluateAnA11yContract allOk against live shell sources", () => {
    const report = evaluateAnA11yContract({ shellCss, shellTsx })
    expect(report.slice).toBe("AP-STAGE8-01")
    expect(report.noVisualRedesign).toBe(true)
    expect(report.allOk).toBe(true)
    expect(report.checks).toHaveLength(4)
    for (const check of report.checks) {
      expect(check.ok).toBe(true)
    }
  })

  test("card CSS carries reduced-motion animation disable (supporting)", () => {
    const cardCss = fs.readFileSync(path.join(shellDir, "cards", "an-card.css"), "utf8")
    expect(cardCss).toContain("prefers-reduced-motion")
    expect(cardCss).toContain("animation: none")
  })
})

afterAll(() => {
  const report = evaluateAnA11yContract({ shellCss, shellTsx })
  const payload = {
    slice: "AP-STAGE8-01",
    recorded_date: "2026-10-21",
    allOk: report.allOk,
    noVisualRedesign: true,
    checks: report.checks,
    landmarkLabelCount: AN_A11Y_LANDMARK_LABELS.length,
  }
  fs.writeFileSync(METRICS_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8")
})
