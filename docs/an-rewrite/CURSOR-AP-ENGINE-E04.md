# AP-ENGINE-E04 — Skip end Snapshot.capture when no local tools

**Status:** INDEPENDENT PASS  
**Work date / recorded:** 2026-10-19 (America/Chicago)  
**Worktree:** `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4`  
**Branch:** `stage4-an-shell`  
**Base:** `07a9b89719` (AP-ENGINE-E01/E02 INDEPENDENT PASS)  
**Code:** `ffcf38d2ae` · **Tip:** `b3c1e3de53`  
**Board evidence:** `business-control/evidence/2026-10-19-ap-engine-e04-independent-pass.txt`  
**Writer live-DEV (prior):** `business-control/evidence/2026-10-19-ap-engine-e04-live-dev.txt`

## Scope

| ID | Finding | Change |
|---|---|---|
| **E04** | Dual git `Snapshot.capture` every successful step | Skip end capture when no local tools ran; reuse start + `files=[]`; dual-capture when any local tool ran; FS-touching name heuristic as safety net |

**Left alone:** E06/E09; PORT-02; merge/push.

## Proof (independent re-run)

- HEAD `b3c1e3de53` verified; code `ffcf38d2ae` + base `07a9b89719` ancestors
- Unit: `session-step` + `snapshot` + `session-compaction` + `session-context-cache` **47** pass / 0 fail; `typecheck` exit 0
- Source bars: `Snapshot.shouldCaptureEndSnapshot` / `toolMayTouchFilesystem`; step path skips `snapshots.capture()` when `needsEndCapture` false; reuse start + `files=[]`; dual-capture when tools ran; `publisher.recordedToolNames()`
- Live CDP (`APORETIC_CDP_PORT=9223`): `cdp-probe-engine-e04.mjs` → `ok:true` EXIT=0 marker `AP-ENGINE-E04 send 1792429972055`; EnginePort send/stream non-regress; `ws.close` + `process.exit`

## Do-not-break (checked)

Send / stream / tools / BYOK / sessions / EnginePort — live send non-regress + unit text-only (1 capture) + edit tool (2 captures). `configure(false)` unchanged.

## Residuals

- running-DEV may need core reload/restart for in-process snapshot skip (unit is source of truth for E04)
- Next ranked: E06 (not this slice); E09 later
- PORT-02 untouched
- No merge/push
- Documented risk: sneaky side effects outside tools may miss file list — prefer false-positive capture when any local tool ran
