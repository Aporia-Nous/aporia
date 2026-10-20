# FLOW-GENIUS-02 — Stage 6 lean shared context pack

| Field | Value |
|-------|-------|
| status | **IMPLEMENTED + MEASURED** (await independent PASS) |
| branch | `stage4-an-shell` |
| worktree | `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4` |
| tip / code | `0e74f69738` |
| docs tip | `0ebb20959b` |
| base | AP-CE-02 `de36bb2047` / docs `cc8c1f51a0` |
| merge/push/install | **No** |

## Intent

Ali confirmed FLOW-GENIUS-01 default (2026-10-20). Own Stage 6 lean prompt assembly as a **shared** pack for SessionRunner (and later F3). Preserve Stage 5 UX + CE gate. No Mnemosyne auto-wire; no F3; no merge/push/install.

## Contract

1. **Lean pack sections:** objective, decisions, constraints, pending, done+evidence, task card, last N messages, source-cited retrieval — not whole history.
2. **Large tool output →** artifact pointer + short preview + `[truncated]` marker.
3. **Once-only merge** into SessionRunner `initial` via `baseTranscript({ leanPack })` — no duplicate paste.
4. **Mnemosyne:** read-only map = **disconnected** from Aporetic lean pack (source tree may exist; not imported).
5. **Measure** fixture tokens before/after — no invented %.

## What shipped

| Piece | Path |
|-------|------|
| Shared pack | `packages/core/src/session/lean-pack.ts` |
| Mnemosyne map | `packages/core/src/mission/memory.ts` |
| SessionRunner merge hook | `packages/core/src/session/model-request.ts` (`leanPack?`) |
| Units + metrics | `packages/core/test/session-lean-pack.test.ts` |
| Metrics | `business-control/evidence/2026-10-20-flow-genius-02-metrics.json` |

## Writer verification

- `bun test test/session-lean-pack.test.ts` → **6 pass**
- CE gate non-regress: `flow-ce01` + `flow-ce02` → **12 pass**
- AnShell tokens → **26 pass** (Stage 5 chrome markers intact)
- Fixture: fullTokens **2162** → leanTokens **578** (tokensSaved **1584**); recent 8/40; toolPointers 1

## Not claimed

- Independent PASS
- Stage 6 complete / I tests 1–7 / J fixtures as Stage 6 acceptance
- Live mission/task fold auto-wired into every drain (optional `leanPack` only)
- Mnemosyne product wire
- Merge / push / install
