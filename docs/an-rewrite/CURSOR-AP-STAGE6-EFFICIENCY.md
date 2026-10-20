# AP-STAGE6-EFFICIENCY — lean-pack / transcript double-cost cut

| Field | Value |
|-------|-------|
| status | **IMPLEMENTED + MEASURED** (await independent PASS) |
| branch | `stage4-an-shell` |
| worktree | `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4` |
| tip / code | `c62dbaf22e` |
| docs / HEAD | *(docs tip after this commit)* |
| base | AP-STAGE6-HOST-DB `e603321625` / docs `dc72d21179` |
| merge/push/install | **No** |

## Intent

After Stage 6 ACCEPT + HOST-DB PASS, Ali `continue` authorized the efficiency residual from the lean-pack brief: mission-linked SessionRunner was re-injecting the lean pack (including **Recent messages**) on every model step while those same turns already entered via `toLLMMessages` — double token cost. Do **not** invent Stage 7. Preserve Stage 5 UX + CE gate + Mnemosyne built-in.

## What shipped

| Piece | Path |
|-------|------|
| `omitRecent` + `recentOmittedForTranscript` + strip helper | `packages/core/src/session/lean-pack.ts` |
| Transcript-path strip before merge (defense-in-depth) | `packages/core/src/session/model-request.ts` `baseTranscript` |
| Loader default omit when messages supplied | `packages/core/src/session/mission-fold.ts` |
| Drain once-per-step pack cache + omitRecent | `packages/core/src/session/runner/llm.ts` |
| Generate omitRecent | `packages/core/src/session/generate.ts` |
| Units + metrics | `packages/core/test/session-lean-pack-efficiency.test.ts` |

## Token path change

1. **Assemble:** SessionRunner / SessionGenerate call `loadLeanPackForSession({ omitRecent: true })` so the pack does **not** paste `### Recent messages` when those turns are already on the transcript.
2. **Merge:** `baseTranscript` strips any residual Recent section when `messages.length > 0`, then `mergeLeanPackIntoInitial` (honest `LEAN_PACK_HEADER` guard — no double paste into the same initial).
3. **Drain cache:** pack text assembled once per logical `runStep` (not every model attempt/retry inside the step).

Mission objective / decisions / constraints / task / cited retrieval still inject; only overlapping recent is cut.

## Writer verification

- `session-lean-pack-efficiency` → **4 pass**
- `session-lean-pack` → **6**; `session-mission-fold` → **6**; mnemosyne-wire → **9**; stage6-i → **8**
- CE-01 + CE-02 → **12 pass**; AnShell tokens → **26 pass**
- Runner J fixtures 2/3/6 → **3 pass**; compaction J3 covered in suite
- Fixture measure: withRecentTokens **694** → omitRecentTokens **99** (overlapTokensSaved **595**); vs full history tokensSaved **677**
- Metrics: `business-control/evidence/2026-10-20-ap-stage6-efficiency-metrics.json`

## Residuals OK

- Drain cache is per logical step only (mission mid-drain refresh not live)
- Stage 7 not started
- Await independent PASS

## Not claimed

- Independent PASS
- Stage 7 / FLOW-GENIUS-05
- Merge / push / install
