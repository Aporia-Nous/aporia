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

## Pass 2 — tree at `86e11bca69` — VERDICT: FAIL

Received as a compact list. The transport again truncated the tail; the text that reached me is quoted exactly, and the
findings it names are the ones addressed above and in the docs:

```
VERDICT: FAIL

ISSUES:
- 1: `10 pass / 0 fail, 115 expect() calls` for `96ee966d94` appears in no stored run — the regenerated gates file only has the 13/126 tip run (docs/an-rewrite/STATUS.md:399; evidence/2026-10-17-stage2-gates.txt:18-21).
- 8: The third-boot claim is not observable in the test it cites: the recording waker's `delivered` Set is process-wide, so it returns `duplicate` whether or not the log check runs, and the assertion is made on the list read before `handle` (packages/core/test/coordination.test.ts:14-25,457-463 vs STATUS.md:456). The code does implement the log check (coordinator.ts:146-152) — the doc's "reads the recorded wake key from the log" is not what the test shows.
- 1: `8 of the 10 Stage 1 domain tables` is mislabelled — Stage 1 defined 8 domain tables, all present; the `8/10` in the evidence also counts the two Stage 2 tables (docs/an-rewrite/STATUS.md:493; evidence/2026-10-17-stage2-backup.txt:27; STATUS.md:286).
- 1: Table counts do not reconcile: backup 33 tables + a migration that creates 2 (gates §9) should be 35, but gates §8 reports 36, unexplained (evidence/2026-10-17-stage2-backup.txt:26; …-stage2-gates.txt:92,110-128).
[TRUNCATED BY THE TRANSPORT HERE — the remaining items were the dirty-tree/`git log` cut-off of the gates file and the
backup block's missing invocation, unlabelled timezone and "read-only" heading. Both are fixed and described in STATUS.md.]
```

## Pass 3 — tree at `a77ac8747c` — VERDICT: FAIL

```
VERDICT: FAIL

ISSUES:
- 1: Says gates §8 stores `695 / 70,919`; the stored run says `"session_message":70937` (STATUS.md:491; REQUIREMENTS-EVIDENCE.md:36; evidence/2026-10-17-stage2-gates.txt:116).
- 1: Branch-log is cited as recorded "at `86e11bca69`", but its own HEAD line is `71bcc139cbe…` (STATUS.md:391; evidence/2026-10-17-stage2-branch-log.txt:26).
- 1: Standing gates are cited "at `86e11bca69`", but the stored gates file's log top is `71bcc139cb` (STATUS.md:410; evidence/2026-10-17-stage2-gates.txt:5).
- 8: Stage 2 commit list omits `225781f019` and `71bcc139cb`, calling the docs commits only `2abfc71bf5`, `86e11bca69` and this one (STATUS.md:388; evidence/2026-10-17-stage2-branch-log.txt:30-31).

Confirmed from files: red-run is consistent with the test as written — third boot clears `delivered` but keeps `deliveries`, so only the log check at coordinator.ts:149-152 prevents the second delivery, and the recorded failure is exactly line 465 with `Received length: 2` (test:455-465). Backup arithmetic is right: 33 listed tables + `mission_event` + `mission_coordinator_cursor` + `sqlite_sequence` = 36 (backup:45-77; gates:120-156). Backup invocation, local-time label and stand-alone listing are present (backup:7,15,21,81), and size/sha match the docs (backup:22,26; STATUS.md:499). Gates script logs 20 commits (stage2-gates.cmd:16) and the log includes `07a85dfafc` (gates:13). Stage 2 rule/acceptance tests all exist in the printed test list (gates:43-55), the 13/126 count matches §1 (gates:37-40), and no unevidenced 10/115 count survives. "Nothing pushed" still holds at `71bcc139cb` (branch-log:16-26, 49-53). No secret found in the docs.
```

## Pass 4

Recorded in `STATUS.md` after it ran.
