# FLOW-GENIUS-03 — Stage 6 live mission fold auto-wire

| Field | Value |
|-------|-------|
| status | **IMPLEMENTED + MEASURED** (await independent PASS) |
| branch | `stage4-an-shell` |
| worktree | `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4` |
| tip / code | `51c192330c` |
| docs tip | `233e9174e0` |
| base | FLOW-GENIUS-02 `0e74f69738` / docs `a432622eef` |
| merge/push/install | **No** |

## Intent

Ali assigned next Stage 6 residual after FLOW-GENIUS-02 INDEPENDENT PASS: **live mission/task fold auto-wire** into SessionRunner. Preserve Stage 5 UX + CE gate + lean pack. No Mnemosyne product wire. Do not claim Stage 6 complete.

Note: FLOW-GENIUS-PLAN ranked FG-03 as mechanical-first routing; CE-01/02 already cover that gate wire. This slice takes the FG-02 residual (mission fold) as the owned next Stage 6 surface. Mechanical-first ranking proof may follow later.

## Contract

1. When a session is **mission-linked**, assemble Stage 6 lean pack from mission + tasks + attention cards (+ last N messages).
2. Pass pack via `baseTranscript({ leanPack })` on SessionRunner drain and SessionGenerate (once-only merge).
3. Unlinked sessions → omit leanPack (no empty header).
4. Mnemosyne remains **disconnected**.
5. Measure fixture tokens — no invented %.

## What shipped

| Piece | Path |
|-------|------|
| Pure fold + DB loader | `packages/core/src/session/mission-fold.ts` |
| SessionRunner drain wire | `packages/core/src/session/runner/llm.ts` |
| SessionGenerate wire | `packages/core/src/session/generate.ts` |
| Units + metrics | `packages/core/test/session-mission-fold.test.ts` |
| Metrics | `business-control/evidence/2026-10-20-flow-genius-03-metrics.json` |

## Writer verification

- `bun test test/session-mission-fold.test.ts` → **6 pass**
- Lean pack non-regress: `session-lean-pack` → **6 pass**
- CE gate: `flow-ce01` + `flow-ce02` → **12 pass**
- AnShell tokens → **26 pass**
- Fixture: fullTokens **476** → leanTokens **335** (tokensSaved **141**)

## Not claimed

- Independent PASS
- Stage 6 complete / I tests 1–7 / J fixtures acceptance
- Mnemosyne product wire
- Merge / push / install
