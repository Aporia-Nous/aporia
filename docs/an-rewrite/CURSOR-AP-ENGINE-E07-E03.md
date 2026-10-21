# AP-ENGINE-E07 + AP-ENGINE-E03 — Stage4 compaction efficiency

**Status:** INDEPENDENT PASS (both E07 + E03)  
**Work date / recorded:** 2026-10-19 (America/Chicago)  
**Worktree:** `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4`  
**Branch:** `stage4-an-shell`  
**Base:** `538e7b1999` (AP-ENGINE-PORT-01 INDEPENDENT PASS)  
**Code:** `7467e14aee` · **Tip:** `ac95b11f0f`  
**Independent verifier:** 2026-10-19 — re-ran unit + live CDP; board evidence `business-control/evidence/2026-10-19-ap-engine-e07-e03-independent-pass.txt`

## Scope

| ID | Finding | Change |
|---|---|---|
| **E07** | Port Stage0 `boundRecentText` (AP-CURSOR-09) | Cap keep-exceeding recent with `[recent truncated to keep]` in `splitConversation` |
| **E03** | Batch `Compaction.Delta` | 100ms batch like LLM text publisher; flush on stepFinish/success/interrupt; cancel pending on Failed |

**Left alone:** E01/E02/E04; PORT-02; Stage0 wholesale cherry-pick; merge/push.

## Proof

- Unit (independent re-run): `session-compaction` **24** pass; focused compact/native/transport/projector (+compaction) **51** pass / 0 fail; `typecheck` exit 0
- Keep-exceed fixtures: user + assistant overshoot → `status: completed`, recent ≤ keep, marker present
- Delta batch: 3 textDelta → 1 ephemeral Compaction.Delta; Failed drops pending; no durable delta rows
- Source bars confirmed: `boundRecentText` + `[recent truncated to keep]`; `COMPACTION_DELTA_BATCH_MS = 100`
- Live CDP independent (`APORETIC_CDP_PORT=9223`): `cdp-probe-engine-e07-e03.mjs` → `ok:true` EXIT=0 marker `AP-ENGINE-E07-E03 send 1792428183477`; EnginePort send/stream non-regress; `ws.close` + `process.exit`
- Writer prior marker retained: `1792428034546`

## Do-not-break (checked)

Send / stream / tools / BYOK / sessions / EnginePort — live send non-regress + unit compact paths.

## Residuals

- running-DEV may need core reload/restart to execute new compaction code in-process (unit is source of truth for E07/E03)
- Next ranked: E01, E02, E04 (not this slice)
- PORT-02 untouched
- No merge/push
