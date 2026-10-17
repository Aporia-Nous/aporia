# Stage 2 verifier passes — branch `an/stage-2-event-store`

Verifier: the `verifier` subagent (read-only; runs no build, test or migration of its own).
The first delivery of Pass 1 was truncated by the message transport, so the verifier was asked to
re-send the complete verdict compactly. The text below is that re-send, verbatim. The issues are
numbered as the verifier numbered them (it used "1" for each documentation row of one finding).

## Pass 1 — tree at `2abfc71bf5` — VERDICT: FAIL

```
VERDICT: FAIL

ISSUES:
- 1: .bak-stage2 figures (1,138 MB, 693 sessions, 70,693 messages, 51 migrations, 33 tables) are in no stored evidence file; gates §8 stores only post-migration counts, session_message 70707 (docs/an-rewrite/REQUIREMENTS-EVIDENCE.md:36; docs/an-rewrite/STATUS.md:483; evidence/2026-10-17-stage2-gates.txt:78).
- 1: Backup is attributed to work/backup-stage1.ts, which is absent from this worktree; the only copy is outside the repo at C:\Users\Dilla\Aporia\bots\aporetic-dev\work\backup-stage1.ts, so the backup is not reproducible from this branch (REQUIREMENTS-EVIDENCE.md:36).
- 1: "all four typechecks" is wrong; the gates file stores three typecheck runs, §3 core, §6 app, §7 desktop (STATUS.md:399; stage2-gates.txt:32,54,61).
- 1: append is said to run in a transaction and look up the key first, but byKey runs before db.transaction, and the lost-race path returns inserted:true for another writer's row, contradicting the interface doc that inserted is false for a used key (packages/core/src/mission/event.ts:38-39,67-71,100; coordinator.ts:252-254).
- 1: Row E and the rule table claim tests for review.passed to verifier, missing-role attentio[TRUNCATED IN THE FIRST DELIVERY]
```

The re-send stopped at the same place: the transport truncated it twice at the same character. The
findings after item 5 therefore cannot be quoted, and this file says so rather than implying the list
is complete. The verdict line and every issue that reached me are above; each is addressed in
`STATUS.md` and in commit `849840bb55` / `df5054e918`. What reached me as item 5 matches the doc
faults it named: the rule table and `REQUIREMENTS-EVIDENCE.md` row E claimed tests that did not exist
(they do now, 13 tests), the no-progress sentence put the escalation one message early, row K said a
reopened task was the only way back when `review.failed` also reopens, and the push evidence predated
the tip and stored output without the command line.

## Pass 2

Recorded in `STATUS.md` (section "Independent verification", Stage 2) after it ran.
