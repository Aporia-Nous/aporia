# AP-ENGINE-E01 + AP-ENGINE-E02 — Stage4 selection + due() efficiency

**Status:** INDEPENDENT PASS (both E01 + E02)  
**Work date / recorded:** 2026-10-19 (America/Chicago)  
**Worktree:** `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4`  
**Branch:** `stage4-an-shell`  
**Base:** `ac95b11f0f` (AP-ENGINE-E07/E03 INDEPENDENT PASS)  
**Code:** `07a9b89719` · **Tip:** `07a9b89719`  
**Independent verifier:** 2026-10-19 — re-ran unit + live CDP; board evidence `business-control/evidence/2026-10-19-ap-engine-e01-e02-independent-pass.txt`

## Scope

| ID | Finding | Change |
|---|---|---|
| **E01** | Drain-scoped `SessionContext.select` cache | `beginDrain`/`endDrain`; fingerprint (agent/permissions/tool revision/catalog generation/entries epoch); `mcpTools.flush` once per drain; `context.load` still per attempt |
| **E02** | Cheap `due()` / estimate | `estimateContextCheap` + margin fast-path; `Tool.Snapshot.definitionTokens` cached at snapshot; full `estimatePrompt` near ceiling / overflow |

**Left alone:** E04/E06; PORT-02; merge/push.

## Proof

- Unit (independent re-run): `session-compaction` + `session-context-cache` **28** pass; focused compact/native/transport/projector + context-cache **55** pass / 0 fail; `typecheck` exit 0
- Source bars confirmed: `beginDrain`/`endDrain` + fingerprint hit path + once-per-drain MCP flush; `estimateContextCheap` + `dueEstimateMargin` + `definitionTokens`
- Live CDP independent (`APORETIC_CDP_PORT=9223`): `cdp-probe-engine-e01-e02.mjs` → `ok:true` EXIT=0 marker `AP-ENGINE-E01-E02 send 1792428850212`; EnginePort send/stream non-regress; `ws.close` + `process.exit`
- Writer prior marker retained: `1792428725037`

## Do-not-break (checked)

Send / stream / tools / BYOK / sessions / EnginePort — live send non-regress + unit select/due paths.

## Residuals

- running-DEV may need core reload/restart for in-process select/due code (unit is source of truth for E01/E02)
- Next ranked: E04 (not this slice); E06 later
- PORT-02 untouched
- No merge/push
