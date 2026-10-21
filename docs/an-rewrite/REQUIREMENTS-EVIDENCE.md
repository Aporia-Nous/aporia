# Requirements → evidence (brief sections A–K)

One row per brief section. Every row is PASS, FAIL or BLOCKED; **NOT STARTED** means no code exists yet and nothing is
claimed. Self-checks are labelled self-checks — none of the rows below is an independent verification. The independent
verifier pass is a separate, read-only step (`verifier` subagent) and its verdict belongs in the stage commit notes.

Rollback for every row: the work is on `rebrand/nousphere` and on stage branches (`an/stage-1-domain-model`, then
`an/stage-2-event-store` cut from the Stage 1 tip) in `C:\Tools\aporia\.worktrees\opt`, and is not pushed, so
`git revert <commit>` (or resetting to the last stage branch point) returns the tree to the previous checkpoint. Two stages
have touched data, both on the DEV copy only: Stage 1's migration and backfill, with `opencode-aporia-dev.db.bak-stage1` as the
pre-stage copy, and Stage 2's migration, with `opencode-aporia-dev.db.bak-stage2` as its pre-stage copy (both `integrity_check`
ok). The live `opencode-aporia.db` has never been written by this work.

| § | section | status | evidence | limitation |
| - | - | - | - | - |
| A | Worked example A — a real mission from request to proof | PARTIAL — domain + AN Task/Proof cards; not a full request→review→verify live mission this handoff | Stage 1–3 domain/events; Stage 4 cards `CURSOR-AP-STAGE4-06`/`07`; Stage 4 ACCEPT-2 | End-to-end live A with real reviewer/verifier proof trail still not claimed; self-check only |
| B | Worked example B — persistent Bot Team and mission switching | PARTIAL → UI landed (self-check) — roster/mission A→B→A + draft/scroll maps on stage4 | Stage 1 domain; `CURSOR-AP-STAGE4-MISSION-RESTART`; Stage 4 ACCEPT; Stage9 shot `156` roster 13 | Independent PASS pending; Electron hard-kill relaunch residual |
| C | Worked example C — inline digital cards | PARTIAL → cards landed (self-check) | `CURSOR-AP-STAGE4-06`/`07` Task/Approval/Decision/Proof/Computer/Team; STAGE5 quiet-entry | Independent PASS pending; empty-session invented cards still refused (honest) |
| D | Worked example D — three computer states, exactly | PASS (self-check against Ali Option C + STAGE5-08 Review-sidebar UX) — **not** original peer mode-pill sheet | `AP-STAGE5-ACCEPT` tip `6e73823dc7`; Conversation primary + Review hosts Computer View; Takeover in-view | Visual fidelity vs mockups EXCEPTED (Stage 8); independent Stage 9 PASS pending |
| E | Worked example E — event-driven coordination and attention | PARTIAL — engine, trigger, durable cards and attention UI; no real-session wake yet | Stage 2/3 gates + AnShell Attention rail (Stage 4+) | production waker / session-loop fact emit still open; self-check only |
| F | Worked example F — local runtime and efficiency | PARTIAL — compaction + lean pack + Stage 7/8 measured; host Podman **BLOCKED** | Stage 0/6 compaction+efficiency; `AP-STAGE7-ACCEPT` fixture idle/active; `AP-STAGE8-02` stream hotpath | host Podman spawn/live measure BLOCKED; cost beyond fixtures not full product accounting |
| G | Worked example G — functional continuity and failure recovery | PARTIAL — writer-measured isolated DEV 2026-10-21 (G1+G4 PASS; Stop interrupt + live diff BLOCKED) | CDP marker `AP-STAGE9-EXAMPLE-G 1792564586730` EXIT=0; shots 156–159; `2026-10-21-ap-stage9-01-example-g-writer.txt`; stream `.title` crash fix in `conversation-stream.tsx`; J2/J3/J6 source/unit retained | **independent PASS pending**; Stop live-interrupt + live file-edit diff need model/tool turn (not paid this run); Page.reload ≠ Electron kill |
| H | Scoped control, electric gold boundary, visible bot cursor | PASS (self-check Stage 5 ACCEPT) with accepted residuals | `AP-STAGE5-ACCEPT` C1–C14; STAGE5-04..08; native **BLOCKED**; global OS **UNSUPPORTED** | Independent Stage 9 PASS pending; residuals unchanged |
| I | Memory system and unfinished Mnemosyne integration | PASS (self-check Stage 6 ACCEPT) — DEV-local built-in; host opencode DB refused | Ali Stage 6 ACCEPT; FG-04 + IJ + HOST-DB + EFFICIENCY tip stack `c62dbaf22e` | UI memory chrome / Electron relaunch residuals; independent Stage 9 PASS pending |
| J | Diagnose and fix context compaction | PARTIAL — S2–S4 + J2/J3/J6 source/unit PASS (Stage 0 + STAGE6-IJ) | AP-CURSOR-02..09; `CURSOR-AP-STAGE6-IJ.md` tip `301bfa6542` | running-DEV compaction continuity still OPEN; independent Stage 9 PASS pending |
| K | Teammate conversations, cheap context, finite task discussions | PARTIAL — durable substrate + AnShell teammate chats; discussion bounds incomplete | Stage 1/2 rules; Stage 4 roster/sessions; Stage 6 lean pack | No finite discussion UI pack / bot→log triggers complete; self-check only |

## Safety rules of the build list (they are not brief sections, and they are checkable)

| rule | status | evidence | limitation |
| - | - | - | - |
| 1 — DEV gets its own database | PASS (switch-over is Ali's restart) | `docs/an-rewrite/STATUS.md` → Stage 0a, plus `docs/an-rewrite/evidence/2026-10-16-dev-db-isolation.txt`: `VACUUM INTO` copy `opencode-aporia-dev.db` (1.13 GB, `integrity_check` ok, 691 sessions), the git-ignored launcher `run-dev-isolated.cmd` (SHA256 recorded), a three-way `opencode debug paths` proof that `OPENCODE_DB` alone decides the file, and the isolation run — a second DEV instance on that file wrote 14 rows into the copy and none into prod, while prod's 24 rows were all this session's own turn | the second instance ran under a test-root profile, not `com.aporianous.desktop.dev` (a second instance on that profile is refused by the single-instance lock), so what is proven is the **database file**, not the profile name; the app the user sees still runs on prod until Ali quits it and runs `switch-dev-to-isolated.cmd` |
| extra rule found in Stage 0a — never start an instance on a copy of a DB whose in-flight turn already continued elsewhere | PASS as a rule, with the failure that produced it | `docs/an-rewrite/evidence/2026-10-16-dev-db-isolation.txt` and STATUS.md: the second instance resumed the interrupted turn, wrote `{"notice":"restart"} … continue from where you left off`, re-injected a 49,325-character instruction blob, replayed this turn's cancelled `copy-db.ts` shell job, and ran 9 assistant turns plus a compaction with the snapshot's context (its own reasoning: "the repo log now shows commits I didn't make in this visible history"); the instance was killed and audited — worktree `git status` clean, no stray copies | the switch script now checks for it (`work/check-inflight.ts`, warns when the newest unfinished turn is under 15 minutes old); a *fresh* copy taken with the app open can still carry a live turn, which is why the script refuses to run while the app is up |
| 2 — nothing installs or promotes a build | PASS | no `aporia-update`, `package`, `package:win`, `electron-builder` or publish script was run in this stage; the installed app's files and CLI cache are untouched | not independently checked by a verifier yet |
| 3 — a branch per stage, commit before risky changes | PASS (self-checked) | Stage 0: commits `6414ab39d2` (compaction bound) then `7fd1f9d77e` (summary rules + docs) on `rebrand/nousphere`, files per commit in `docs/an-rewrite/evidence/2026-10-16-commit-files.txt`. Stage 1: branch `an/stage-1-domain-model` cut from tag `an/checkpoint-pre-stage1` (`c2b211d313`), commits `e2be3f6b1b` (feature), `4d1de66eb5` (runner counts fix), `8a4724ff36` (docs), `414d159845` (per-task revision fix), `19f4e7cf24` (test extension), plus the docs commit that carries this row; the stage's file scope and the working tree at the time of the runs are stored in `docs/an-rewrite/evidence/2026-10-17-stage1-gates.txt` §9–10. Stage 2: branch `an/stage-2-event-store` cut from the Stage 1 tip (`28859fd16e`); the code commits are `07a85dfafc`, `285d02fa91`, `96ee966d94`, `849840bb55` (two defects the first verifier pass found), `df5054e918` (three tests) and `225781f019` (the restart proof made to depend on the log alone), followed by documentation and evidence commits. The list is read from `git log an/stage-2-event-store` rather than retyped, because a list in prose is what went stale every time it was written (passes 3, 4 and 5 failed on it); `2026-10-17-stage2-branch-log.txt` holds a snapshot of it (stopping at its own HEAD, `71bcc139cb`) together with the push state. No per-commit status is stored, so "clean after each" is not claimed; nothing pushed or merged | Stage 0 did not get its own branch (work continued on `rebrand/nousphere` in the DEV worktree); Stage 1 and Stage 2 did. Stage 2's base is the Stage 1 tip rather than the checkpoint, so it carries Stage 1's commits. No branch has been force-pushed or rewritten |
| 5 — schema changes: back up the dev DB, migrate the dev DB, restart, reopen 3 old sessions, record counts; never migrate the live store | PARTIAL — everything except the app restart, which is Ali's switch-over | Stage 1: `docs/an-rewrite/evidence/2026-10-17-stage1-migration-backfill.txt` — `.bak-stage1` backup (`integrity_check` ok, 691 sessions / 69,990 messages / 50 migrations) taken before anything ran; the migration applied, then replayed on a byte copy of that backup — 25 -> 33 tables, `session_v2` 691 and `session_message` 69,990 identical before and after, migration rows 50 -> 51, 13 bots / 1 team / 1 mission / 2 links, second run inserts nothing; dev copy counted read-only in `2026-10-17-stage1-devcopy-state.txt`. Stage 2: `.bak-stage2` taken first and counted read-only in `2026-10-17-stage2-backup.txt` — 1,221,545,984 bytes, sha256 `fd19bd5c…9bf0ba9`, `integrity_check` ok, 693 `session_v2` / 70,693 `session_message` / 51 `migration` / 33 tables, the Stage 2 migration not recorded; made by `C:\Users\Dilla\Aporia\bots\aporetic-dev\work\backup-stage1.ts`, which is outside this repo, so that evidence file stores the script's sha256 and its full text instead of a path a reader cannot reach. Then the generated migration applied to the dev copy only — `2026-10-17-stage2-gates.txt` §8 reads it back: 36 tables, 10/10 domain tables, `mission_event` (10 columns) and `mission_coordinator_cursor` present, migration 52, 13 bots / 1 team / 1 mission unchanged, `integrity_check` ok, `mission_event` 0 rows. That copy is live (the running DEV app writes its sessions into it), so the two session counts drift between runs and are therefore read from the file's own snapshot rather than quoted here; the domain counts do not drift. The file also lists the copy's 36 tables so 33 (backup) + `mission_event` + `mission_coordinator_cursor` + SQLite's `sqlite_sequence` (from `AUTOINCREMENT`) reconciles. The live `opencode-aporia.db` was only ever opened `{ readonly: true }` (one query to explain a dangling room session id, in `2026-10-17-stage1-gates.txt` §11), and the runner refuses any file named `opencode-aporia.db` by name | the restart-and-reopen-3-sessions step through the app waits on the Stage 0a switch-over. That switch **rebuilds** the dev copy from prod, so the rebuilt file arrives unmigrated: the first app start applies both migrations to it and `script/mission-backfill.ts` must be run again to repopulate the domain rows (the same DDL and the same runner proven in Stage 1, but a second run, not a carried-over result). Stage 2's `mission_event` holds 0 rows on the dev copy because nothing in the running app emits yet |
| 7 — nothing paid, no unbounded long-context experiments | PASS | every J number was read from the live store or produced by deterministic tests; no model call was made for this stage | — |


## What J has actually established

- The ceiling is 100,000 tokens (`compaction.max_context` unset → `AUTO_COMPACT_CONTEXT`), the retained budget is
  15,000 (`keep`), and the reserve is 16,000 (`RESERVE_MIN`). The cap is Ali's deliberate cost choice.
- Trigger moment: the start of a step, before the request is built — not once per turn.
- "~200k in · ~300k out" was the old compaction row label, and it is not the active context: its input is
  input+cache.read+cache.write for the summary request (max 893,212 across 120 stored rows) and its output is
  output+reasoning (max 8,311). No single request ever produced 300k output tokens (max recorded 31,806).
  AP-CURSOR-03 relabels the row to prompt sent / summary written / resulting context (resulting from the next
  assistant prompt when known).
- The real defect, measured before any fix: `keep` was not an upper bound, so the retained window could be 1.29–1.75x
  over budget and each compaction bought only a few minutes of room. Fixed in `6414ab39d2` and covered by a test.
- Second defect, fixed in this commit: the summary instruction never told the summarizer that a later correction
  supersedes an earlier decision, nor that finished work must carry the evidence that proves it, so a completed action
  could be repeated after a summary dropped its result.
- S2 (AP-CURSOR-02): auto compaction that leaves almost no headroom under the fire point cannot immediately auto-fire
  again until the session grows by `min(5_000, 5% of ceiling)` past the post-compaction floor; overflow and manual are
  unchanged; small-window successive auto is preserved.

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

The Stage 2 evidence is regenerated by three scripts, all outside the repo in
`C:\Users\Dilla\Aporia\bots\aporetic-dev\work\`: `stage2-gates.cmd` (tests with their names, typechecks, the dev copy read
read-only, the migration), `stage2-backup-state.cmd` (the pre-migration backup, counted read-only, plus the backup script's
sha256 and text) and `stage2-branch-log.cmd` (each git command with its output and exit code). Each takes the output file as
its only argument:

```
cmd /c "C:\Users\Dilla\Aporia\bots\aporetic-dev\work\stage2-gates.cmd C:\Tools\aporia\.worktrees\opt\docs\an-rewrite\evidence\2026-10-17-stage2-gates.txt"
```

