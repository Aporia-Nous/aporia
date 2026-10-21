# AP-STAGE8-01 — AnShell a11y contract (non-design)

| Field | Value |
|-------|-------|
| status | **IMPLEMENTED + MEASURED** (OPEN for independent PASS — not Stage 8 complete) |
| branch | `stage4-an-shell` |
| worktree | `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4` |
| base | Stage 7 ACCEPT tip `270a8906a9` / HEAD prior `52258555ab` |
| authority | Ali continue-finish 2026-10-21 (except design) |
| merge/push/install | **No** |

## Intent

First Stage 8 slice under Ali finish auth: pin existing Stage 5 UX a11y contracts (reduced-motion, focus-visible, landmark aria) via source/unit. **No** visual redesign, brand look changes, or Review/Computer freestyle. Visual fidelity vs mockups remains deferred.

## What shipped

| Piece | Path |
|-------|------|
| `AN_A11Y_SURFACE` + evaluate helpers | `packages/app/src/shell/an/a11y-contract.ts` |
| Units | `packages/app/src/shell/an/a11y-contract.test.ts` |
| Metrics | `business-control/evidence/2026-10-21-ap-stage8-01-metrics.json` |

## Checks (A1–A4)

| id | bar | result |
|----|-----|--------|
| A1 | prefers-reduced-motion disables animation+transition | PASS |
| A2 | focus-visible interactive contract | PASS |
| A3 | 8 landmark aria labels in Stage 5 UX sources | PASS |
| A4 | noVisualRedesign scope pin | PASS |

## Writer verification

- a11y-contract → **6 pass**
- shell/an + flows-util → **185 pass** (was 179 + 6)
- Stage 7 isolation-attach non-regress → **6 pass**
- tokens → **26 pass**

## Residuals OK

- Independent PASS of this slice
- Stage 8 overall not complete
- Visual fidelity / side-by-side mockup audit — deferred (Ali design-except)
- Perf measured hotpath — later STAGE8 slice
- Stage 9 not started

## Not claimed

- Stage 8 complete / visual PASS
- Live CDP a11y audit
- Merge / push / install
- UI redesign
