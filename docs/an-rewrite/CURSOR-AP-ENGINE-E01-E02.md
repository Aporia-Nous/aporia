# AP-ENGINE-E01 + AP-ENGINE-E02 — Stage4 selection + due() efficiency

**Status:** OPEN implemented+live-DEV (writer; not self-PASS)  
**Work date / recorded:** 2026-10-19 (America/Chicago)  
**Worktree:** `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4`  
**Branch:** `stage4-an-shell`  
**Base:** `ac95b11f0f` (AP-ENGINE-E07/E03 INDEPENDENT PASS)

## Scope

| ID | Finding | Change |
|---|---|---|
| **E01** | Drain-scoped `SessionContext.select` cache | `beginDrain`/`endDrain`; fingerprint (agent/permissions/tool revision/catalog generation/entries epoch); `mcpTools.flush` once per drain; `context.load` still per attempt |
| **E02** | Cheap `due()` / estimate | `estimateContextCheap` + margin fast-path; `Tool.Snapshot.definitionTokens` cached at snapshot; full `estimatePrompt` near ceiling / overflow |

**Left alone:** E04/E06; PORT-02; merge/push.

## Proof (writer)

- Unit: `session-compaction` + E02 cases; `session-context-cache` (select once across 3 stable steps); focused compact/native/transport/projector + context-cache suite pass; `typecheck` exit 0
- Live CDP (`APORETIC_CDP_PORT=9223`): `cdp-probe-engine-e01-e02.mjs` → `ok:true` EXIT=0 marker `AP-ENGINE-E01-E02 send 1792428725037`; EnginePort send/stream non-regress; `ws.close` + `process.exit`

## Do-not-break (checked)

Send / stream / tools / BYOK / sessions / EnginePort — live send non-regress + unit select/due paths.

## Residuals

- Independent verifier must re-run unit + CDP before PASS
- running-DEV may need core reload/restart for in-process select/due code (unit is source of truth for E01/E02)
- Next ranked: E04 (not this slice); E06 later
- PORT-02 untouched
- No merge/push
