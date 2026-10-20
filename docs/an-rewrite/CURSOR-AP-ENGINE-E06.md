# AP-ENGINE-E06 — Skip tool-schema clone when no request hooks

**Status:** INDEPENDENT PASS  
**Work date / recorded:** 2026-10-19 (America/Chicago)  
**Worktree:** `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4`  
**Branch:** `stage4-an-shell`  
**Base:** `b3c1e3de53` (AP-ENGINE-E04 INDEPENDENT PASS)  
**Code:** `c78aa04d69` · **Tip:** `cec15203f8`  
**Board evidence:** `business-control/evidence/2026-10-19-ap-engine-e06-independent-pass.txt`  
**Writer live-DEV (prior):** `business-control/evidence/2026-10-19-ap-engine-e06-live-dev.txt`

## Scope

| ID | Finding | Change |
|---|---|---|
| **E06** | Model-request prepare clones every tool schema every call | Fast path: if no `session` context/compaction/generate hooks for the request kind (+ provider), pass `inputSchema` by reference; else keep identity Map + `{ ...inputSchema }` clone |

**Left alone:** E09/E10; PORT-02; merge/push.

## Proof (independent re-run)

- HEAD `cec15203f8` verified; code `c78aa04d69` + base `b3c1e3de53` ancestors
- Unit: `session-model-request-hooks` + `session-model-request` + `session-generate` **17** pass; rename hook non-regress in `session-runner` **1** pass; `typecheck` exit 0
- Source bars: `hasToolHooks` via `hooks.has("session", toolHook, providerID)`; by-reference `toolsForHook` when false; clone Map when true; compaction-only hook does not force primary clone
- Live CDP (`APORETIC_CDP_PORT=9223`): `cdp-probe-engine-e06.mjs` → `ok:true` EXIT=0 marker `AP-ENGINE-E06 send 1792430610895`; EnginePort send/stream non-regress; `ws.close` + `process.exit`

## Do-not-break (checked)

Send / stream / tools / BYOK / sessions / EnginePort — live send non-regress + unit no-hook by-ref + hook rename/isolation + compaction-only hook does not force primary clone.

## Residuals

- running-DEV may need core reload/restart for in-process prepare path (unit is source of truth for E06)
- Next ranked: E09 later; E10 later
- PORT-02 untouched
- No merge/push
