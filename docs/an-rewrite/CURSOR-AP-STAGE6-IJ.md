# AP-STAGE6-IJ — Stage 6 I tests 1–7 + J fixtures 2/3/6

| Field | Value |
|-------|-------|
| status | **IMPLEMENTED + MEASURED** (await independent PASS) |
| branch | `stage4-an-shell` |
| worktree | `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4` |
| tip / code | `301bfa6542` |
| HEAD | `301bfa6542` |
| base | FLOW-GENIUS-04 `9fa0c2b278` / docs head `db4460e983` |
| merge/push/install | **No** |

## Intent

After FLOW-GENIUS-04 INDEPENDENT PASS: run Stage 6 acceptance gates from `APORETIC-DEV-BUILD-LIST` / brief I–J — I tests 1–7 and J fixtures 2, 3, 6 on fixtures. Preserve Stage 5 UX + CE + lean pack + mission fold + MnemosynePort. (Follow-on: Ali authorized DEV-local built-in shared memory — see `CURSOR-AP-STAGE6-HOST-DB.md`; host opencode `mnemosyne.db` remains refused.)

## What shipped

| Piece | Path |
|-------|------|
| Port foundations (trusted, eligibility, instruction reject) | `packages/core/src/mission/mnemosyne-port.ts` |
| Map notes | `packages/core/src/mission/memory.ts` |
| I tests 1–7 + checklist/metrics | `packages/core/test/session-stage6-i.test.ts` |
| J fixtures 2 + 6 (ported from Stage 0) | `packages/core/test/session-runner.test.ts` |
| Metrics / checklist | `business-control/evidence/2026-10-20-ap-stage6-ij-metrics.json`, `…-i-checklist.json` |

## Writer verification

- `bun test test/session-stage6-i.test.ts` → **8 pass**
- `bun test test/session-runner.test.ts -t "J fixture"` → **J2 + J3 + J6 pass**
- `bun test test/session-compaction.test.ts -t "J fixture 3"` → **1 pass**
- CE gate: `flow-ce01` + `flow-ce02` → **12 pass**
- AnShell tokens → **26 pass**
- FG non-regress: mnemosyne-wire **7** + mission-fold **6** + lean-pack **6**
- I-7 measure: fullTokens **751** → leanTokens **177** (tokensSaved **574**)

## Host / shared memory note

Historical IJ bar kept default unavailable. **Superseded for product default** by AP-STAGE6-HOST-DB (`e603321625`): DEV-local built-in available; host `~/.config/opencode/mnemosyne/mnemosyne.db` refused.

## Not claimed (IJ slice)

- Host opencode mnemosyne.db open
- Electron DEV relaunch (I-1 = synthetic seed reopen)
- Merge / push / install
- See HOST-DB report for built-in default independent PASS
