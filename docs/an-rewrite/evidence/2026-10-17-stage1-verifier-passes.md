# Stage 1 — the independent verifier passes, as returned

`verifier` subagent, read-only, every pass over branch `an/stage-1-domain-model` on 2026-10-17. It was not permitted to
build, package, install, migrate or backfill; it read files and quoted `git` output, but it ran no build, test, migration or
app command. Each pass is quoted here in its own words, abridged only where it repeated a checklist.

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

## Pass 3 — VERDICT FAIL, tree at `28b6f22a4d`

> ISSUES:
> - 1 — `STATUS.md:247` says "6 commits", but the branch has 7: the six table rows plus the unlisted docs commit described at
>   `STATUS.md:259`; the supplied log includes `28b6f22a4d`. The only stored git log, `gates:2-6`, shows 5 at its run, so no
>   stored output supports 6. Say "7 commits (6 listed plus the docs commit that follows)" or list the seventh and store
>   `git log c2b211d313..HEAD`.
> - 8 — `STATUS.md:372-373` says the full text of all three verifier passes is stored, but
>   `evidence/2026-10-17-stage1-verifier-passes.md` contains only Pass 1 and Pass 2 … Append this Pass 3 report or narrow the
>   claim.
> - 1 — `STATUS.md:394` says the verifier has no shell, while the same file's line 4 says it "ran `git` read-only commands".
>   Both cannot be true.
> - 1 — `STATUS.md:3` says the checkout is on `rebrand/nousphere`, but the Stage 1 checkout is `an/stage-1-domain-model`.
> - 1 — `REQUIREMENTS-EVIDENCE.md:35` (row 5) says "the migration applied to the dev copy" and that three old sessions were
>   read, but cites only the replay file, which ran on `%TEMP%\stage1-replay.db`, not the dev copy. The dev-copy proof is
>   `evidence/2026-10-17-stage1-devcopy-state.txt`, which the row does not cite.
> - 4 — `STATUS.md:398` says the backfill runner "can be re-run against it or against `.bak-stage1`"; the runner refuses only
>   `opencode-aporia.db` by name (`packages/core/script/mission-backfill.ts:37`), so running it on `.bak-stage1` would migrate
>   the pre-stage backup in place and destroy the restore point.

No code, test or app/data objection in this pass. All six were corrected before Pass 4.

## Pass 4 — VERDICT FAIL, same tree plus the branch-log evidence

> ISSUES:
> - 1 — "Nothing is pushed" and "Push state is stored rather than inferred" are not supported by the stored artifact. The
>   branch-log file records only `fatal: no upstream configured` and `git remote -v`. A branch pushed with `git push origin
>   HEAD` (no `-u`) also has no upstream, so no stored line rules out a remote copy of `an/stage-1-domain-model`; no
>   `git ls-remote`, `git branch -r --contains`, or `git log origin/...` appears anywhere in the evidence, and the generator
>   script contains no remote-ref query, so re-running it could not produce that proof.
>
> Everything else in the fix list checks out from files: the seven hashes and the no-count phrasing match the stored log;
> Passes 1–3 are stored; the shell sentence now matches; the checkout line names both branches; row 5 cites the dev-copy file
> whose counters match; the runner text now says a fresh copy of `.bak-stage1`; and the `archiveBot` per-task revision fix and
> the two-task assertions still hold.

That was a real gap: a branch with no upstream can still have been pushed. `work\stage1-branch-log.cmd` now asks the remote
directly, and the regenerated file stores the answers.

## Pass 5 — VERDICT PASS

> Verified from files: the regenerated `2026-10-17-stage1-branch-log.txt` now stores direct remote queries —
> `git ls-remote --heads origin refs/heads/an/*` and `git ls-remote --tags origin refs/tags/an/*`, both empty with `exit=0`,
> plus `git branch -r --contains HEAD` empty and `remote.origin.fetch` — which rules out a pushed-but-untracked copy of the
> stage branch or the checkpoint tag (including a `git push origin HEAD` made without `-u`), and the seven commits, the
> dev-copy counters (33 tables, 8/8, 691/69,990, 13/1/1/0, migration 51, integrity ok), the replay numbers, the 9/54/62 test
> runs and the two `custom-elements.d.ts:1` TS1128 errors all still match their stored evidence;
> `packages/core/src/mission/service.ts:340-343` still bumps each reassigned task's own revision inside the transaction, and
> the archive test pins 1→2 for the untouched task and 2→3 for the reopened one across both the refused and moved states
> (`test/mission.test.ts:62-91`).
>
> Unverified or disclosed, quotable as written:
> - The push check is negative evidence from one remote (`origin`) for `refs/heads/an/*` and `refs/tags/an/*` only; no refs
>   outside that namespace (including the base branch's own remote state) were queried.
> - The replay database was a temporary copy and is deleted, so its table and row counts stand on the stored text in
>   `2026-10-17-stage1-migration-backfill.txt`, not on a re-runnable artifact.
> - The migrated dev copy is counted read-only in `2026-10-17-stage1-devcopy-state.txt`; no pass re-ran the migration or the
>   backfill against it.
> - The whole-stage file list is gates §9–§10 as of `19f4e7cf24`; no per-commit file list is stored, so the later commits'
>   "docs only" rests on their stored subjects and on the unchanged code and test files read at the tip, not on a stored
>   per-commit diff.
> - The app restart, the switch-over that rebuilds the dev copy from prod, and opening the three old sessions in the app
>   remain Ali's actions; after that switch the rebuilt copy needs this migration and a second backfill run.
> - `2026-10-17-stage1-verifier-passes.md` stores Passes 1–4; this Pass 5 text must be appended to it, since no pass can be
>   stored before it is returned.
> - The evidence contains no key, token or password; the only remote URL recorded is credential-free.

The one thing that could not be true until after the verdict was returned — storing Pass 5 — is done in the same docs commit
that carries this paragraph, which is docs-only and not itself re-verified. Nothing under `packages/` changes after
`19f4e7cf24`; the docs commits after it only correct hashes and wording.
