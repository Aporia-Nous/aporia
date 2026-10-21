# AP-STAGE8-02 — AnShell stream hotpath measured (non-design)

| Field | Value |
|-------|-------|
| status | **IMPLEMENTED + MEASURED** (OPEN for independent PASS — not Stage 8 complete) |
| branch | `stage4-an-shell` |
| worktree | `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4` |
| tip / code | `5bac458f62` |
| docs / HEAD | `24633efd92` (code tip `5bac458f62` ancestor) |
| base | AP-STAGE8-01 tip `d53552a156` / HEAD prior `6df5c48589` |
| authority | Ali continue-finish 2026-10-21 (except design) |
| merge/push/install | **No** |

## Intent

Second Stage 8 non-design slice under Ali finish auth: measure AnShell Conversation stream projection hotpath (`buildContextCards` + `buildConversationStreamItems`) with coherent p50/p95 and pin Stage 5 quiet-entry (no idle wallpaper). **No** visual redesign, brand look changes, or Review/Computer freestyle. Visual fidelity vs mockups remains deferred.

## What shipped

| Piece | Path |
|-------|------|
| `AN_PERF_SURFACE` + `measureStreamHotpath` + evaluate | `packages/app/src/shell/an/perf-contract.ts` |
| Units | `packages/app/src/shell/an/perf-contract.test.ts` |
| Metrics | `business-control/evidence/2026-10-21-ap-stage8-02-metrics.json` |

## Checks (P1–P4)

| id | bar | result |
|----|-----|--------|
| P1 | stream hotpath measured (msgs/iters + finite p50≤p95) | PASS (writer) |
| P2 | quiet-entry: idle 0 computer/team wallpaper; mission stack empty | PASS (writer) |
| P3 | projection scale: turns=msgs; quiet reads not surfaced | PASS (writer) |
| P4 | noVisualRedesign scope pin | PASS (writer) |

## Writer metrics (fixture)

- msgs=80 iters=24
- p50Ms / p95Ms recorded in metrics JSON (soft budget p95 &lt; 250ms — coherence only)
- turns=80 items=91 cards=11; idleWallpaperCardCount=0; quietReadCardsSurfaced=0
- Honesty: baseline/coherence — **not** wall-clock win vs prior baseline; **not** live CDP paint

## Writer verification

- perf-contract → **5 pass**
- a11y-contract → **6 pass** (STAGE8-01 non-regress)
- shell/an + flows-util → **190 pass** (was 185 + 5)
- Stage 7 isolation-attach non-regress → **6 pass**
- tokens → **26 pass**

## Residuals OK

- Stage 8 overall not complete; await independent PASS
- Visual fidelity / side-by-side mockup audit — deferred (Ali design-except)
- Live CDP paint / FPS not claimed
- Engine E26 harness remains separate (engine runtime; not this AnShell stream slice)
- Stage 9 not started

## Not claimed

- Independent PASS
- Stage 8 complete / visual PASS
- Wall-clock win vs baseline
- Live CDP perf audit
- Merge / push / install
- UI redesign
