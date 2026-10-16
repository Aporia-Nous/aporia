# Requirements → evidence (brief sections A–K)

One row per brief section. Every row is PASS, FAIL or BLOCKED; **NOT STARTED** means no code exists yet and nothing is
claimed. Self-checks are labelled self-checks — none of the rows below is an independent verification. The independent
verifier pass is a separate, read-only step (`verifier` subagent) and its verdict belongs in the stage commit notes.

Rollback for every row: the work is on `rebrand/nousphere` in `C:\Tools\aporia\.worktrees\opt` and is not pushed, so
`git revert <commit>` (or resetting to the last stage branch point) returns the tree to the previous checkpoint. No
database is migrated yet, so there is nothing to undo in data.

| § | section | status | evidence | limitation |
| - | - | - | - | - |
| A | Worked example A — a real mission from request to proof | NOT STARTED | none | needs Stages 1–3 |
| B | Worked example B — persistent Bot Team and mission switching | NOT STARTED | none | needs Stages 1–3 |
| C | Worked example C — inline digital cards | NOT STARTED | none | needs Stage 4 UI work |
| D | Worked example D — three computer states, exactly | NOT STARTED | none | needs the desktop/scoping stage; the recovered three-state sheet is the design authority |
| E | Worked example E — event-driven coordination and attention | NOT STARTED | none | needs Stage 2 |
| F | Worked example F — local runtime and efficiency | PARTIAL | `docs/an-rewrite/STATUS.md` → one correlated compaction turn with provider input/output, summary size, retained size, resulting context, and the reclaim actually achieved (`ses_ec48eb578ffe74WT5yyzIHQgxT`, 20:00:46) | cost/runtime accounting beyond compaction is not measured yet |
| G | Worked example G — functional continuity and failure recovery | NOT STARTED | none | J's cancel/error/restart fixtures (2, 3, 6) are still open |
| H | Scoped control, electric gold boundary, visible bot cursor | NOT STARTED | none | none |
| I | Memory system and unfinished Mnemosyne integration | NOT STARTED | none | none |
| J | Diagnose and fix context compaction | PARTIAL — self-checked | commits `6414ab39d2` + `7e44cba2c1`; 252 session tests pass, `bun run typecheck` exit 0; J fixtures 1, 4, 5 added as deterministic tests; threshold/units/trigger/correlated-turn record in `docs/an-rewrite/STATUS.md`; pre-existing failures verified on a stashed tree | S2–S4 open (minimum-reclaim guard, honest counters, bounded summary output); fixtures 2, 3, 6 and the runner continuation test open; the retry count is not persisted anywhere, so it stays unverified; the fixture `after` numbers use the mock's 29-char summary, so they prove the boundary rather than the real end size |
| K | Teammate conversations, cheap context, finite task discussions | NOT STARTED | none | needs Stage 2 (coordinator) and the bot UX stages |

## Safety rules of the build list (they are not brief sections, and they are checkable)

| rule | status | evidence | limitation |
| - | - | - | - |
| 1 — DEV gets its own database | PARTIAL | `docs/an-rewrite/STATUS.md` → Stage 0a: `VACUUM INTO` copy `opencode-aporia-dev.db` (1.13 GB, `integrity_check` ok, 691 sessions), the git-ignored launcher `run-dev-isolated.cmd` (SHA256 recorded), and a three-way `opencode debug paths` proof that `OPENCODE_DB` alone decides the file. The running DEV instance was measured writing the prod DB at 18:02 local | the GUI half is not done: running the launcher and sending one chat means restarting the app that hosts this session, so it is Ali's call. DEV still writes the prod DB until then |
| 2 — nothing installs or promotes a build | PASS | no `aporia-update`, `package`, `package:win`, `electron-builder` or publish script was run in this stage; the installed app's files and CLI cache are untouched | not independently checked by a verifier yet |
| 3 — a branch per stage, commit before risky changes | PASS (self-checked) | commit `6414ab39d2` (compaction bound) then `7e44cba2c1` (summary rules + docs) on `rebrand/nousphere`; each stage's work is one committed checkpoint before the next begins | the stage branch `an/stage-0-*` was not created because the work continues on `rebrand/nousphere` itself in the DEV worktree; both commits are local and revertable |
| 7 — nothing paid, no unbounded long-context experiments | PASS | every J number was read from the live store or produced by deterministic tests; no model call was made for this stage | — |


## What J has actually established

- The ceiling is 100,000 tokens (`compaction.max_context` unset → `AUTO_COMPACT_CONTEXT`), the retained budget is
  15,000 (`keep`), and the reserve is 16,000 (`RESERVE_MIN`). The cap is Ali's deliberate cost choice.
- Trigger moment: the start of a step, before the request is built — not once per turn.
- "~200k in · ~300k out" is the compaction row label, and it is not the active context: its input is
  input+cache.read+cache.write for the summary request (max 893,212 across 120 stored rows) and its output is
  output+reasoning (max 8,311). No single request ever produced 300k output tokens (max recorded 31,806).
- The real defect, measured before any fix: `keep` was not an upper bound, so the retained window could be 1.29–1.75x
  over budget and each compaction bought only a few minutes of room. Fixed in `6414ab39d2` and covered by a test.
- Second defect, fixed in this commit: the summary instruction never told the summarizer that a later correction
  supersedes an earlier decision, nor that finished work must carry the evidence that proves it, so a completed action
  could be repeated after a summary dropped its result.

## How to re-run the evidence

```
cd C:\Tools\aporia\.worktrees\opt\packages\core
bun test test/session-compaction.test.ts test/session-runner.test.ts test/session-compact.test.ts test/session-provider-context.test.ts test/session-compaction-transport.test.ts
bun run typecheck
```

The DEV-database wiring proof (rule 1, free, no app restart):

```
cd C:\Tools\aporia\.worktrees\opt\packages\cli
$env:OPENCODE_DB = "opencode-aporia-dev.db"; bun src/index.ts debug paths   # db = ...\opencode-aporia-dev.db
$env:OPENCODE_DB = "opencode-aporia.db";      bun src/index.ts debug paths   # db = ...\opencode-aporia.db
Remove-Item Env:\OPENCODE_DB;                 bun src/index.ts debug paths   # db = ...\opencode-local.db
```

Read-only DB diagnostics used for the live numbers live in `C:\Users\Dilla\Aporia\bots\aporetic-dev\work\db-*.ts`
(`db-j1turn.ts` prints one correlated turn). They open the session store read-only and write nothing.
