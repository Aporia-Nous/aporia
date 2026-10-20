# FLOW-GENIUS-04 — Stage 6 Mnemosyne product wire

| Field | Value |
|-------|-------|
| status | **IMPLEMENTED + MEASURED** (await independent PASS) |
| branch | `stage4-an-shell` |
| worktree | `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4` |
| tip / code | `9fa0c2b278` |
| docs tip | `f15c801e92` |
| HEAD | *(pin after this commit)* |
| base | FLOW-GENIUS-03 `51c192330c` / docs `233e9174e0` / HEAD `8e89d7c72d` |
| merge/push/install | **No** |

## Intent

Ali assigned next Stage 6 residual after FLOW-GENIUS-03 INDEPENDENT PASS: **Mnemosyne product wire** (was disconnected map). Preserve Stage 5 UX + CE gate + lean pack + mission fold. Do **not** claim Stage 6 complete / I–J acceptance.

Note: FLOW-GENIUS-PLAN ranked FG-04 as computer control lock / three-state; Stage 5 DONE already covers that. This slice retargets FG-04 to the board residual (Mnemosyne wire).

## Contract

1. Aporetic-owned **MnemosynePort** (search / remember / forget / availability).
2. Mission fold recalls via port → **Cited retrieval** (`source:mnemosyne:<id>`), bounded.
3. Default SessionRunner port = **unavailable** (host `mnemosyne.db` not auto-opened; no install).
4. Map status → **implemented** (product boundary wired; not I 1–7 PASS).
5. Measure fixture tokens — no invented %.

## What shipped

| Piece | Path |
|-------|------|
| MnemosynePort + fixture/unavailable | `packages/core/src/mission/mnemosyne-port.ts` |
| Map status implemented | `packages/core/src/mission/memory.ts` |
| Fold + loader recall wire | `packages/core/src/session/mission-fold.ts` |
| Units + metrics | `packages/core/test/session-mnemosyne-wire.test.ts` |
| Metrics | `business-control/evidence/2026-10-20-flow-genius-04-metrics.json` |

## Writer verification

- `bun test test/session-mnemosyne-wire.test.ts` → **7 pass**
- Mission fold non-regress: `session-mission-fold` → **6 pass**
- Lean pack non-regress: `session-lean-pack` → **6 pass**
- CE gate: `flow-ce01` + `flow-ce02` → **12 pass**
- AnShell tokens → **26 pass**
- Fixture: fullTokens **911** → leanTokens **293** (tokensSaved **618**)

## Not claimed

- Independent PASS
- Stage 6 complete / I tests 1–7 / J fixtures acceptance
- Host mnemosyne.db / substrate auto-open
- Merge / push / install
