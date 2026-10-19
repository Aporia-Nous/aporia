# AP-ENGINE-E05 — Narrow settleStaleToolCalls (no full-history decode)

**Status:** OPEN implemented+live-DEV (NOT INDEPENDENT PASS; writer does not self-PASS)  
**Work date / recorded:** 2026-10-19 (America/Chicago)  
**Worktree:** `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4`  
**Branch:** `stage4-an-shell`  
**Base:** `f3617b6685` (AP-ENGINE-E10 INDEPENDENT PASS)  
**Code:** `7edeb4596c` · **Tip:** `703835c8ee`  
**Board evidence:** `business-control/evidence/2026-10-19-ap-engine-e05-live-dev.txt`

## Scope

| ID | Finding | Change |
|---|---|---|
| **E05** | `settleStaleToolCalls` decoded full post-compaction history | `SessionHistory.assistantsWithOpenTools` SQL-filters assistants with streaming/running tools (`json_each` + EXISTS); settle decodes only those rows; same `"latest"` compaction bound as prior `store.context` |

**Left alone:** E13; PORT-02; merge/push; full `SessionHistory.load` cache (audit longer path).

## Proof (writer live-DEV)

- Unit: `session-history-open-tools` **2** + interrupted-tool / abandoned-compaction runner filter **6** = **8** pass; `typecheck` exit 0
- Source bars: `assistantsWithOpenTools` EXISTS on tool `state.status` in (`streaming`,`running`); post-compaction `gte(seq)`; `settleStaleToolCalls` no longer calls `store.context`
- Live CDP (`APORETIC_CDP_PORT=9223`): `cdp-probe-engine-e05.mjs` → `ok:true` EXIT=0 marker `AP-ENGINE-E05 send 1792432372919`; EnginePort send/stream non-regress; `ws.close` + `process.exit`

## Do-not-break (checked)

Send / stream / tools / BYOK / sessions / EnginePort — live send non-regress + unit interrupted local/subagent/hosted/streaming-input settle + compaction-bound ignore orphan.

## Residuals

- Next ranked: E13 later; PORT-02 alone
- Longer audit path (decoded message cache / open_tools side table) not in this slice
- running-DEV may need core reload for in-process settle path (unit is source of truth for E05)
- No merge/push; independent verifier required for PASS
