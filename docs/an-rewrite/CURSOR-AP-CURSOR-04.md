# AP-CURSOR-04 — Stage 0 S4 bound summary output

Work date: October 18, 2026 (America/Chicago). Board task `AP-CURSOR-04`.

## Worktree / branch / HEAD

| item | value |
| --- | --- |
| cwd | `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic` |
| branch | `compaction-bound-summary` (cut from `compaction-honest-counters` @ `93b5acb2df`) |
| base verified | tip `93b5acb2df` / code `25d351ed1f` |
| ownership | this worktree only — not `C:\Tools\aporia` and not `C:\Tools\aporia\.worktrees\opt` |
| push | none |
| merge | none |
| Stage 4 / design mode | not started; 3 vs 4 stays OPEN |

## Why this slice

STATUS Stage 0 listed S4 open: bound the summary's own output across successive comps. Brief J / K ask for a firm summary budget so successive updates cannot grow the checkpoint unboundedly. Ali asked for S4 and J fixture 3 (both); S4 first.

## Owned files changed

| file | why |
| --- | --- |
| `packages/core/src/session/compaction.ts` | `SUMMARY_BUDGET`, `boundSummaryOutput`; applied on hook results and `Compaction.Ended` text |
| `packages/core/src/session/model-request.ts` | `SUMMARY_OUTPUT_MAX` 32_000 → 16_000 (aligned with budget) |
| `packages/core/test/session-compaction.test.ts` | S4 unit + successive fixture; maxTokens expect 16k |
| `packages/core/test/session-runner.test.ts` | Summary maxTokens expect 16k on overshoot path |
| `docs/an-rewrite/STATUS.md` | S4 source/unit recorded; independent PASS not claimed |
| `docs/an-rewrite/REQUIREMENTS-EVIDENCE.md` | J row updated |
| `docs/an-rewrite/evidence/2026-10-18-*-s4*.txt` | Stored test/typecheck output |
| `docs/an-rewrite/CURSOR-AP-CURSOR-04.md` | this report |

## Acceptance mapping

| criterion | result |
| --- | --- |
| Firm summary budget | Done — `SUMMARY_BUDGET` = 16_000 (= `RESERVE_MIN`) |
| Request does not ask for more than budget | Done — `SUMMARY_OUTPUT_MAX` = 16_000 |
| Successive comps stay within budget | Done — S4 fixture with oversized hook summaries |
| Unit / suite / typecheck | 255 session suites pass; typecheck exit 0 |

## What was deliberately not done

- No running-DEV load, no DB mutation, no merge/push, no Stage 4 visual.
- No claim of independent PASS.
- J fixtures 2/3/6 not in this commit (AP-CURSOR-05 follows).

## Tests and stored outputs

```
cd packages/core
bun test test/session-compaction.test.ts
# 18 pass / 0 fail (includes S4 unit + successive)
bun test test/session-compaction.test.ts test/session-runner.test.ts test/session-compact.test.ts test/session-provider-context.test.ts test/session-compaction-transport.test.ts
# Ran 255 tests across 5 files. 255 pass / 0 fail
bun run typecheck
# exit 0
```

Stored under `docs/an-rewrite/evidence/2026-10-18-session-suites-s4.txt`, `…-session-compaction-s4.txt`, `…-session-runner-s4-output-limit.txt`, `…-typecheck-s4.txt`.

## Next

Independent review of this branch. Then AP-CURSOR-05 (J fixture 3 cancel/error recovery). Optional running-DEV only with Ali authorization.
