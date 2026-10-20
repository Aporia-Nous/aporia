# AP-ENGINE-E26 — Engine hot-path wall-clock harness

| Field | Value |
|-------|-------|
| status | **OPEN implemented+live-DEV** (**no** self-PASS / INDEPENDENT PASS; **DONE MEASURED** awaits independent verifier — harness only, not product code PASS) |
| branch | `stage4-an-shell` |
| tip | `28a8557194` |
| code | `eb7179f500` |
| base | `d683e31f80` (AP-ENGINE-E08 INDEPENDENT PASS) |
| worktree | `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4` |
| scope | E26 process gap: `perf/engine-hotpath.md` + bun script/test measuring select / due-estimate / publish / optional SSE — **not** test-suite speed |
| merge/push/install | **No** |

## Intent

Pass-2 audit: `perf/test-suite.md` only speeds the opencode test suite. Efficiency claims for E01/E02/E04 and later need a dedicated engine hot-path harness before anyone cites ms wins. This slice **lands the harness + baseline metrics**; it does **not** claim a product runtime optimization PASS.

## What shipped

- `perf/engine-hotpath.md` — goal, commands, metric keys, honesty rules (separate from `perf/test-suite.md`)
- `packages/core/script/engine-hotpath-lib.ts` + `benchmark-engine-hotpath.ts`
- `packages/core` script `benchmark:engine-hotpath`
- `packages/core/test/engine-hotpath-bench.test.ts` — asserts cache hits; writes `business-control/evidence/2026-10-19-ap-engine-e26-metrics.json`
- Optional SSE via relative EventFeed import (encode-once + offer lag)
- CDP non-regress probe `cdp-probe-engine-e26.mjs` shots 99–101

## Sample metrics (writer CLI)

See `2026-10-19-ap-engine-e26-metrics.json` — e.g. select p50≈0.17ms / p95≈0.635ms (20 drains × 6 selects; snapshotCalls=20 hits=100); due cheapP50≈0.001ms vs preciseP50≈0.011ms; publish p50≈0.343ms; SSE offers=48 overflowDrops=0.

## Writer verification (2026-10-19) — OPEN implemented+live-DEV

- Base `d683e31f80`
- `bun test` packages/core `test/engine-hotpath-bench.test.ts` → **1 pass / 0 fail**
- `bun run benchmark:engine-hotpath` → E26_METRICS printed + evidence JSON
- `bun test` packages/app `src/shell/an` → **118 pass / 0 fail**
- Live CDP `cdp-probe-engine-e26.mjs` (`APORETIC_CDP_PORT=9223`) → RESULT `ok:true` **EXIT=0** marker `AP-ENGINE-E26 send 1792463706791` (ws closed)
  - enginePort=`03`; Settings `02` AN-owned; Message Grok…; 4E Contraptions
- Shots: `99`–`101`
- Evidence: `business-control/evidence/2026-10-19-ap-engine-e26-live-dev.txt` + metrics JSON

## Honest residuals

- **E26 is harness / measure infrastructure** — board OPEN; verifier → **DONE MEASURED** (not product code PASS / wall-clock win vs a prior baseline compare)
- Mock tools + file SQLite — relative before/after only; not provider RTT
- E12 / E14 still open (opportunistic code residuals)
- CDP `markerHit` may prefix-match prior board markers on a crowded stream
- **Not** claimed: INDEPENDENT PASS (product); Stage 4/8 PASS; merge; push

## Board

- `AP-ENGINE-E26` → **OPEN** implemented+live-DEV (await independent verifier → DONE MEASURED)
- Next ranked residual: **E12** / **E14**
