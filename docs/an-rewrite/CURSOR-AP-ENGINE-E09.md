# AP-ENGINE-E09 — Inline UsageUpdated (drop extra session row read)

**Status:** INDEPENDENT PASS  
**Work date / recorded:** 2026-10-19 (America/Chicago)  
**Worktree:** `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4`  
**Branch:** `stage4-an-shell`  
**Base:** `cec15203f8` (AP-ENGINE-E06 INDEPENDENT PASS)  
**Code:** `a59abe5b93` · **Tip:** `988fd1cb66`  
**Board evidence:** `business-control/evidence/2026-10-19-ap-engine-e09-independent-pass.txt`

## Scope

| ID | Finding | Change |
|---|---|---|
| **E09** | `publishSessionUsage` re-SELECTs session token columns after every Step.Ended / Failed / UsageRecorded | `applyUsage` RETURNING new totals; publish `UsageUpdated` from the same projection path; remove subscribe+SELECT loop |

**Left alone:** E10/E05/E13; PORT-02; merge/push.

## Proof (independent verifier)

- HEAD tip `988fd1cb66` matches claimed; code `a59abe5b93` on base `cec15203f8` (ancestors verified)
- Unit re-run: `session-projector` **17** pass (incl. Step.Ended UsageUpdated, UsageRecorded cumulative RETURNING, Failed-without-usage skip); `typecheck` exit 0
- Source bars: `applyUsage` `.returning(...)`; `publishUsageTotals` from projection handlers; no `bus.subscribe([Step.Ended, Step.Failed, UsageRecorded])` SELECT fanout
- Live CDP (`APORETIC_CDP_PORT=9223`): `cdp-probe-engine-e09.mjs` → `ok:true` EXIT=0 marker `AP-ENGINE-E09 send 1792431515126`; EnginePort send/stream non-regress; `ws.close` + `process.exit`
- Writer prior live-DEV marker retained: `AP-ENGINE-E09 send 1792431274552`

## Do-not-break (checked)

Send / stream / tools / BYOK / sessions / EnginePort — live send non-regress + unit usage footer totals + Failed-without-usage does not emit UsageUpdated.

## Residuals

- Next ranked: E10 later; E05/E13 later
- PORT-02 untouched
- running-DEV may need core reload for in-process projector path (unit is source of truth for E09)
- No merge/push
