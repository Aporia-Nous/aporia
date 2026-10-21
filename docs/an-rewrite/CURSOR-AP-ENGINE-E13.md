# AP-ENGINE-E13 — Cap auto-compacts per drain + Failed — stall/churn

**Status:** INDEPENDENT PASS  
**Work date / recorded:** 2026-10-19 (America/Chicago)  
**Worktree:** `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4`  
**Branch:** `stage4-an-shell`  
**Base:** `72dce8c771` (AP-ENGINE-E05 INDEPENDENT PASS)  
**Code:** `1f7e4c25c8` · **Tip:** `4c42d1d289`  
**Board evidence:** `business-control/evidence/2026-10-19-ap-engine-e13-independent-pass.txt`

## Scope

| ID | Finding | Change |
|---|---|---|
| **E13** | Rigid compact↔retry loops stall the turn | Drain-scoped budget: max **2** completed auto/overflow compacts; further attempts surface `Failed — stall/churn` (`compaction.stall`); manual `/compact` uncapped; overflow recovery once unchanged |

**Left alone:** PORT-02; second-pass audit (SSE/MCP/sqlite/perf); merge/push.

**Note:** E13 finishes the original top-10 act-first list from `ENGINE-EFFICIENCY-AUDIT.md`.

## Proof (independent verifier)

- HEAD tip `4c42d1d289` matches claimed; code `1f7e4c25c8` on base `72dce8c771` (ancestors verified)
- Unit re-run: `drain-compact-budget` **3** + runner E13/overflow/once filter **6** = **9** pass; `typecheck` exit 0
- Source bars: `drain-compact-budget.ts` (`MAX_AUTO_COMPACTS_PER_DRAIN=2`, `STALL_CHURN_ERROR`); `SessionRunner.autoOrOverflowCompact`; manual path uncapped; `recoverOverflow` may fail `StepFailedError` for stall
- Live CDP (`APORETIC_CDP_PORT=9223`): `cdp-probe-engine-e13.mjs` → `ok:true` EXIT=0 marker `AP-ENGINE-E13 send 1792433542528`; EnginePort send/stream non-regress; `ws.close` + `process.exit`
- Writer prior live-DEV marker retained: `AP-ENGINE-E13 send 1792433267590`

## Do-not-break (checked)

Send / stream / tools / BYOK / sessions / EnginePort — live send non-regress + unit overflow-once + undersized auto + E13 stall after two autos.

## Residuals

- Original top-10 act-first list complete (E07…E13)
- PORT-02 alone; second-pass audit alone
- No merge/push
