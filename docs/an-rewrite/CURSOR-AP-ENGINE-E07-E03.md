# AP-ENGINE-E07 + AP-ENGINE-E03 — Stage4 compaction efficiency

**Status:** OPEN implemented+live-DEV (NOT INDEPENDENT PASS; writer does not self-PASS)  
**Work date / recorded:** 2026-10-19 (America/Chicago)  
**Worktree:** `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4`  
**Branch:** `stage4-an-shell`  
**Base:** `538e7b1999` (AP-ENGINE-PORT-01 INDEPENDENT PASS)

## Scope

| ID | Finding | Change |
|---|---|---|
| **E07** | Port Stage0 `boundRecentText` (AP-CURSOR-09) | Cap keep-exceeding recent with `[recent truncated to keep]` in `splitConversation` |
| **E03** | Batch `Compaction.Delta` | 100ms batch like LLM text publisher; flush on stepFinish/success/interrupt; cancel pending on Failed |

**Left alone:** E01/E02/E04; PORT-02; Stage0 wholesale cherry-pick; merge/push.

## Proof

- Unit: `packages/core` `session-compaction` (+ related compact/native/transport/projector) — focused suites green; `typecheck` exit 0
- Keep-exceed fixtures: user + assistant overshoot → `status: completed`, recent ≤ keep, marker present
- Delta batch: 3 textDelta → 1 ephemeral Compaction.Delta; Failed drops pending; no durable delta rows
- Live CDP (`APORETIC_CDP_PORT=9223`): `cdp-probe-engine-e07-e03.mjs` → `ok:true` EXIT=0 marker `AP-ENGINE-E07-E03 send 1792428034546`; EnginePort send/stream non-regress; `ws.close` + `process.exit`

## Do-not-break (checked)

Send / stream / tools / BYOK / sessions / EnginePort — live send non-regress + unit compact paths.

## Residuals

- Independent verifier PASS still OPEN
- running-DEV may need core reload/restart to execute new compaction code in-process (unit is source of truth for E07/E03)
- Next ranked: E01, E02, E04 (not this slice)
- PORT-02 untouched
