# AP-CURSOR-03 — Stage 0 S3 honest UI counters

Work date: October 18, 2026 (America/Chicago). Board task `AP-CURSOR-03`.

## Worktree / branch / HEAD

| item | value |
| --- | --- |
| cwd | `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic` |
| branch | `compaction-honest-counters` (cut from `compaction-reclaim-guard` @ `36167ddfa5`) |
| commit | `25d351ed1f` — `fix(ui): label active context vs lifetime and compaction counters` |
| ownership | this worktree only — not `C:\Tools\aporia` and not `C:\Tools\aporia\.worktrees\opt` |
| push | none |
| merge | none |
| Stage 4 / design mode | not started; 3 vs 4 stays OPEN |

## Why this slice

After AP-CURSOR-02 S2 **INDEPENDENT PASS (source/unit)**, board README and `CURSOR-AP-CURSOR-02.md` name S3 honest UI counters as the next safe Stage 0 slice (preferred over J fixture 3). STATUS Stage 0 still listed S3 open: active context vs cumulative totals in footer, Details, and compaction row.

## Owned files changed

| file | why |
| --- | --- |
| `packages/session-ui/src/message/compaction-usage.ts` | Pure prompt/summary/resulting helpers + honest label formatter |
| `packages/session-ui/src/message/compaction-usage.test.ts` | Deterministic S3 unit tests |
| `packages/session-ui/src/message/message-content.tsx` | Compaction row uses named counters; optional resulting context |
| `packages/session-ui/src/timeline/session-timeline-row.tsx` | Look-ahead resulting context from next assistant prompt |
| `packages/app/src/aporia/session-stats.ts` | Comment clarifying active vs lifetime |
| `packages/app/src/aporia/session-stats.test.ts` | Pins active ≠ lifetime |
| `packages/app/src/aporia/layout.tsx` | Footer labels Active context / Lifetime total |
| `packages/app/src/aporia/right-panel.tsx` | Details shows both quantities (was single "Tokens") |
| `packages/ui/src/i18n/en.ts` | English compaction usage copy aligned with named counters |
| `docs/an-rewrite/STATUS.md` | S3 source/unit recorded; independent PASS not claimed |
| `docs/an-rewrite/REQUIREMENTS-EVIDENCE.md` | J row + label note |
| `docs/an-rewrite/evidence/2026-10-18-*-s3*.txt` | Stored test/typecheck output |
| `docs/an-rewrite/CURSOR-AP-CURSOR-03.md` | this report |

## Acceptance mapping

| criterion | result |
| --- | --- |
| Footer: Active context vs Lifetime total | Done — `layout.tsx` |
| Details: both quantities separately | Done — `right-panel.tsx` |
| Compaction row: prompt sent / summary written / resulting context | Done — resulting from next assistant prompt tokens when available; omitted until then (not invented) |
| Unit tests | 4 session-ui + 2 app pass |
| Typecheck | `packages/session-ui` exit 0; `packages/app` exit 1 with only pre-existing `custom-elements.d.ts` TS1128 (same as prior stages) |

## What was deliberately not done

- No persist of resulting context / retry on the compaction row schema (still backlog).
- No running-DEV load, no DB mutation, no merge/push, no Stage 4 visual, no 3-vs-4 mode pick.
- No claim of independent PASS.

## Tests and stored outputs

```
cd packages/session-ui && bun test src/message/compaction-usage.test.ts
# 4 pass / 0 fail
cd packages/app && bun test src/aporia/session-stats.test.ts
# 2 pass / 0 fail
cd packages/session-ui && bun run typecheck  # exit 0
cd packages/app && bun run typecheck        # exit 1; only custom-elements.d.ts TS1128
```

Stored under `docs/an-rewrite/evidence/2026-10-18-compaction-usage-s3.txt`, `…-session-stats-s3.txt`, `…-typecheck-s3-session-ui.txt`, `…-typecheck-s3-app.txt`.

## Next

Independent review of this branch. Then S4 or J fixture 3 as a new owned task. Optional running-DEV only with Ali authorization.
