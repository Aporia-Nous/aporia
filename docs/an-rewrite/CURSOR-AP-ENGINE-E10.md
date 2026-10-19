# AP-ENGINE-E10 — Instruction observe once per drain (dirty-bit)

**Status:** OPEN implemented+live-DEV (NOT INDEPENDENT PASS; NOT self-PASS)  
**Work date / recorded:** 2026-10-19 (America/Chicago)  
**Worktree:** `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4`  
**Branch:** `stage4-an-shell`  
**Base:** `988fd1cb66` (AP-ENGINE-E09 INDEPENDENT PASS)  
**Code:** `0296c74fb7` · **Tip:** `e94a326ce0`  
**Board evidence:** `business-control/evidence/2026-10-19-ap-engine-e10-live-dev.txt`

## Scope

| ID | Finding | Change |
|---|---|---|
| **E10** | `InstructionState.prepare` on every `prepareContext` | Drain-scoped `PrepareGate`; skip re-observe while `SessionContext.instructionDirtyEpoch` unchanged; fresh Map per drain forces observe after location move |

**Left alone:** E05/E13; PORT-02; merge/push.

## Proof (writer live-DEV)

- Unit: `instruction-state` **14** + `session-context-cache` **3** = **17** pass; `typecheck` exit 0
- Source: `PrepareGate` on `InstructionState.prepare`; `instructionDirtyEpoch` (catalogGeneration + entriesEpoch); `instructionPrepared` Map reset each drain
- Live CDP (`APORETIC_CDP_PORT=9223`): `cdp-probe-engine-e10.mjs` → `ok:true` EXIT=0 marker `AP-ENGINE-E10 send 1792431821273`; EnginePort send/stream non-regress; `ws.close` + `process.exit`

## Do-not-break (checked)

Send / stream / tools / BYOK / sessions / EnginePort — live send non-regress + unit gate skip/dirty/ungated paths + InitializationBlocked still via ungated/first observe.

## Residuals

- Next ranked: E05/E13 later; PORT-02 alone
- Mid-turn AGENTS.md without `InstructionDiscovery.Updated` notify is not observed until next dirty bump or drain (no mtime poll in this slice)
- running-DEV may need core reload for in-process prepare path (unit is source of truth for E10)
- No merge/push
