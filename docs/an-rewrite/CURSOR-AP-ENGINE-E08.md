# AP-ENGINE-E08 — Structured recent by message ID

| Field | Value |
|-------|-------|
| status | **OPEN implemented+live-DEV** (**no** self-PASS / INDEPENDENT PASS; **no** merge/push; **not** Stage 4/8 PASS) |
| branch | `stage4-an-shell` |
| tip | `0c06dcf8ef` |
| code | `45fdba0432` |
| base | `933595427f` (AP-ENGINE-E23 DONE MEASURED + E24 INDEPENDENT PASS) |
| worktree | `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4` |
| scope | E08 Phase B: `recentMessageIDs` on summary checkpoints; history expand; LLM omits string dump when expand succeeds |
| merge/push/install | **No** |

## Intent

Stop re-sending stringified recent (tool calls as text) on every post-compact primary request. Store retained recent as message IDs, expand from DB into real turns, keep dual-written `recent` string for legacy/fallback. Preserve native providerContext path, resume after restart, fork, EnginePort/sessions.

## What shipped

### Schema
- Optional `recentMessageIDs: SessionMessage.ID[]` on Compaction Running/Completed + Compaction.Started/Ended.

### Compaction (`packages/core/src/session/compaction.ts`)
- `splitConversation` writes IDs when `boundRecentText` does not truncate; else string-only fallback.
- Dual-write `recent` string + IDs when structured.
- Flatten uses dual-written string only when structured recent is not already present in context.

### History (`packages/core/src/session/history.ts`)
- After post-compaction load, expand IDs (full set required) immediately after checkpoint; clear in-memory `recent` so LLM path does not double-count.

### toLLMMessages
- When `recentMessageIDs` set and `recent` cleared (expand success): summary-only checkpoint text; following messages are real turns.
- When IDs set but `recent` still present: keep `<recent-context>` string fallback.

### Projector / updater
- Persist `recentMessageIDs` on Started/Ended.

## Writer verification (2026-10-19) — OPEN implemented+live-DEV

- Code `45fdba0432` on base `933595427f`
- `bun test` packages/core session-compaction + history-open-tools + runner-message → **60 pass / 0 fail**
- `bun test` packages/core native + projector + provider-context → **33 pass / 0 fail**
- `bun test` packages/app `src/shell/an` → **118 pass / 0 fail**
- Live CDP `cdp-probe-engine-e08.mjs` (`APORETIC_CDP_PORT=9223`) → RESULT `ok:true` **EXIT=0** marker `AP-ENGINE-E08 send 1792463120727` (ws closed)
  - enginePort=`03`; typed+sendClick; Settings `02` AN-owned; Message Grok…; 4E Contraptions
- Shots: `96`–`98`
- Evidence: `business-control/evidence/2026-10-19-ap-engine-e08-live-dev.txt`

## Honest residuals

- Keep-exceed truncate path still string-only (no IDs) — correct for partial text
- Partial ID resolution falls back to dual-written string (no silent drop)
- Structured recent tool outputs are full parts (not TOOL_OUTPUT_MAX_CHARS flatten) — may estimate slightly above keep
- Live DEV binary may still be pre-E08 until hard restart — CDP proves EnginePort/sessions non-regress
- CDP `markerHit` may prefix-match prior board markers on a crowded stream; typed+sendClick+RESULT still met bar
- Left alone (same-slice conflict / L scope): E26, E12, E14
- **Not** claimed: INDEPENDENT PASS; Stage 4/8 PASS; merge; push

## Board

- `AP-ENGINE-E08` → **OPEN** implemented+live-DEV (await independent verifier)
- Next ranked residual after E08 PASS: E26 / E12 / E14
