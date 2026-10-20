# AP-ENGINE-E23 + AP-ENGINE-E24 — WAL multi-session measure + overflow classify harden

| Field | Value |
|-------|-------|
| status | **OPEN implemented+live-DEV** (**no** self-PASS / INDEPENDENT PASS; **no** merge/push; **not** Stage 4/8 PASS) |
| branch | `stage4-an-shell` |
| tip | `90765775ef06` |
| code | `3ef4237673` |
| base | `98fe8869b9` (AP-ENGINE-E27 INDEPENDENT PASS) |
| worktree | `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4` |
| scope | E23 measure-only multi-session SQLite stress + metrics; E24 structured overflow codes + false-positive exclusions |
| merge/push/install | **No** |

## Intent

- **E23:** Prove multi-session WAL durable publish contention with numbers (busy count, p50/p95). Notify-outside-lock already landed as E27 — do not re-touch bus locks here. **No product runtime PASS claim** from measure alone.
- **E24:** Prefer structured provider overflow codes before phrase heuristics; exclude concurrent/output/config false positives that would wrongly trigger compact recovery. Preserve Workers AI 413→context-overflow and payload-too-large / incomplete-stream paths.

## What shipped

### E23 — measure (`packages/core/test/bus-multi-session-stress.test.ts`)
- File-backed WAL DB; 8 sessions × 24 sequential durable publishes, sessions concurrent.
- Asserts `journal_mode=wal`, `busyOrLocked=0`, per-aggregate seq complete.
- Emits `E23_METRICS` + writes `business-control/evidence/2026-10-19-ap-engine-e23-metrics.json`.
- Sample (live run): publishes=192, busyOrLocked=0, p50Ms≈0.37, **p95Ms≈26.2**, maxMs≈40.

### E24 — code (`packages/ai/src/provider-error.ts`)
- `CONTEXT_OVERFLOW_CODES` set (incl. `prompt_too_long`, `context_window_exceeded`, `input_tokens_exceeded`, …) checked before phrase scan.
- Narrow exclusions: concurrent/connection caps, output-token-limit-exceeded, missing/unconfigured context window — without matching Workers AI “input and maximum output tokens … context window” phrasing.
- Unit fixtures for false-positive phrases + structured-code-first classification.

### Tests / probe
- Unit: `provider-error` **39** pass; bus **54** + E23 stress **1** → **55**; shell/an **118**.
- CDP: `cdp-probe-engine-e23-e24.mjs` shots 93–95.

## Writer verification (2026-10-19) — OPEN implemented+live-DEV

- Code `3ef4237673` on base `98fe8869b9`
- `bun test` packages/ai `test/provider-error.test.ts` → **39 pass / 0 fail**
- `bun test` packages/core `test/bus-multi-session-stress.test.ts` + `test/bus.test.ts` → **55 pass / 0 fail**
- `bun test` packages/app `src/shell/an` → **118 pass / 0 fail**
- Live CDP `cdp-probe-engine-e23-e24.mjs` (`APORETIC_CDP_PORT=9223`) → RESULT `ok:true` **EXIT=0** marker `AP-ENGINE-E23-E24 send 1792462372432` (ws closed)
  - enginePort=`03`; typed+sendClick; Settings `02` AN-owned; Message Grok…; 4E Contraptions
- Shots: `93`–`95`
- Evidence: `business-control/evidence/2026-10-19-ap-engine-e23-e24-live-dev.txt` + `2026-10-19-ap-engine-e23-metrics.json`

## Honest residuals

- **E23 is measure-only** — board stays OPEN with metrics; **do not** claim product code PASS / wall-clock win vs baseline without E26 harness comparison
- E27 notifyLocks still serial per aggregate; single SQLite writer remains
- Per-provider overflow corpus expansion still open (audit §5b)
- Frames/sec telemetry behind flag not shipped (optional E24 item)
- CDP `markerHit` may prefix-match prior board markers on a crowded stream; typed+sendClick+RESULT still met bar
- **Not** claimed: INDEPENDENT PASS; Stage 4/8 PASS; merge; push

## Board

- `AP-ENGINE-E23` → **OPEN** (measure + evidence metrics; not code PASS)
- `AP-ENGINE-E24` → **OPEN** implemented+live-DEV (await independent verifier)
- Next ranked residual: E08 / E26 / E12 / E14 (pass-2 backlog)
