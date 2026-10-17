# Stage 1 — the independent verifier passes, as returned

`verifier` subagent, read-only, three passes over branch `an/stage-1-domain-model` on 2026-10-17. It was not permitted to
build, package, install, migrate or backfill; it read files, and where its runtime allowed it, ran `git` read-only commands.
Each pass is quoted here in its own words, abridged only where it repeated a checklist. Pass 2 in this file is the second
pass; the third is below it.

## Pass 1 — VERDICT FAIL, tree at `8a4724ff36`

> ISSUES:
> - 3 — `archiveBot` does not bump each moved task's revision. It writes one value for the whole set:
>   `revision: (open[0]?.revision ?? 1) + 1` (`packages/core/src/mission/service.ts:340`), i.e. the oldest open task's
>   revision + 1 applied to every moved task. A task already at revision 3 would be lowered to 2. It only looks right because
>   the test moves a single task at revision 1 (`packages/core/test/mission.test.ts:75-77`). Compare `reassignTask`, which
>   bumps per row (`service.ts:742`).
> - 10 — `STATUS.md:254` claims "9 new tests … (9 pass / 0 fail); `packages/core` typecheck exit 0". No such run exists in
>   `docs/an-rewrite/evidence/`.
> - 10 — `STATUS.md:257-258` claims 54 pass (app) and 62 pass (desktop). Grep across the tree finds those numbers only in
>   STATUS.md itself.
> - 10 — `STATUS.md:255` says "the run that found it is in the evidence file", which the evidence file does not show.
> - 10 — `STATUS.md:289` says "28 methods"; the interface exposes 29 … 33 is the count of `Effect.fn(` definitions, four of
>   which are private loaders.
> - 10 — the commit table does not match the branch (a docs commit between the fix commits is unlisted).
> - 10 — the rollback command `git revert e2be3f6b1b 4d1de66eb5` omits later commits that rewrite the same hunk.
> - 10 — several recorded facts have no stored run artifact: the `no such table: bot` failure, the "two known pre-existing"
>   TS1128 errors, and "missing from the live store too".
> - 10 — the acceptance row says the refusal leaves "both tasks where they were", but the test re-checks only the first.
> - 11 — scope (`git diff --stat c2b211d313..HEAD`) unverified: no shell execution in its runtime.

The code objection was real and was fixed in `414d159845`; the test was extended in `19f4e7cf24`; the evidence gaps were
closed with `2026-10-17-stage1-gates.txt`, `2026-10-17-stage1-devcopy-state.txt` and the §11 live-store check.

## Pass 2 — VERDICT FAIL, working tree at `19f4e7cf24` plus uncommitted docs

> Checks: claim 3 now PASS — `archiveBot` loops over the open tasks and writes `revision: task.revision + 1` per row inside
> the transaction, with no `open[0]` derivation (`service.ts:337-352`); the red run fails at exactly that assertion
> (`Expected: 3 / Received: 2`, `gates:16-29, 52`); the 57-vs-59 `expect()` count between red and green is internally
> consistent. Claims 1, 2, 4-9 no regression. No secrets found; no sends, deploys, DNS or spend steps.
>
> ISSUES (all documentation):
> - "33 service functions" is wrong: the interface exposes 29.
> - "the first independent verification pass caught this (below)" pointed at a section that verified Stage 0, not `archiveBot`.
> - The commit table omitted `8a4724ff36`.
> - The rollback command omitted `414d159845`.
> - "pre-existing" TS1128 errors and the live-store check had no stored artifact.
> - `REQUIREMENTS-EVIDENCE.md` row 3 omitted `414d159845` and claimed "tree clean after each" without a stored check.
> - The acceptance row's "both tasks where they were" was not asserted for the second task.

All of those were fixed before Pass 3.
