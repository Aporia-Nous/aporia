# Aporetic rewrite — STATUS

Checkout: `C:\Tools\aporia\.worktrees\opt`, on `rebrand/nousphere` up to the checkpoint tag `an/checkpoint-pre-stage1`
(`c2b211d313`), and on stage branches cut from it from there on (currently `an/stage-1-domain-model`, which is not merged
back). Source of truth for the order of work:
`APORETIC-DEV-BUILD-LIST.md` (a copy of it is not kept here; the brief is `APORETIC-DEV-REWRITE-HANDOFF.md`, sections A–K).

Nothing is pushed. Nothing is merged. The installed app (`%LOCALAPPDATA%\Programs\Aporetic`) is untouched by this
work, and the live database is only ever read (Stage 0a takes a read-only copy of it). No packaging script and no
`aporia-update` was run.

## Stage log

### Stage 0 — compaction (brief J) — 2 commits, committed (J stays PARTIAL: S2–S4 open)

| # | commit | subject | tests |
| - | - | - | - |
| 1 | `6414ab39d2` | `fix(compaction): keep the retained recent text within the configured budget` | session suites 249 pass / 0 fail before this stage's fixtures |
| 2 | `7fd1f9d77e` | `fix(compaction): protect superseded instructions and completed work in the summary` (this commit was amended once, to fold in a hash correction inside this file, so its hash is `7fd1f9d77e` and the intermediate `7e44cba2c1` no longer exists) | 252 pass / 0 fail across `session-compaction`, `session-runner`, `session-compact`, `session-provider-context`, `session-compaction-transport`; `bun run typecheck` exit 0 — re-run output stored in `docs/an-rewrite/evidence/2026-10-16-session-suites.txt` (`Ran 252 tests across 5 files`, exit 0) and `docs/an-rewrite/evidence/2026-10-16-typecheck.txt` (exit 0) |

Files touched by each commit, from `git show --stat` (also stored in `docs/an-rewrite/evidence/2026-10-16-commit-files.txt`):

```
6414ab39d2 fix(compaction): keep the retained recent text within the configured budget
 packages/core/src/session/compaction.ts       | 25 +++++++----
 packages/core/test/session-compaction.test.ts | 60 +++++++++++++++++++++++++++

7fd1f9d77e fix(compaction): protect superseded instructions and completed work in the summary
 docs/an-rewrite/REQUIREMENTS-EVIDENCE.md      |  48 ++++++
 docs/an-rewrite/STATUS.md                     |  93 +++++++++
 packages/core/src/session/compaction.ts       |   2 +
 packages/core/test/session-compaction.test.ts | 220 ++++++++++++++++++++++++++
```

Files touched in code, and nothing else: `packages/core/src/session/compaction.ts`,
`packages/core/test/session-compaction.test.ts`.

The commit message differs from the one suggested in the build list (`bounded summary + accurate active-context`)
because the label/counter half of that sentence is a `packages/session-ui` change (S3 below), which Stage 0's scope
explicitly excludes. The engine change was committed under an accurate message instead of a message claiming work
that is not in the commit.

#### Before/after active context, from the fixtures (deterministic, no paid calls)

| fixture | before | after | note |
| - | - | - | - |
| J1 long session crossing the threshold | 101,071 | 289 | mock summary is 29 chars, so `after` proves the retention boundary, not the end size a real summary leaves |
| J4 accounting (tool schemas + big tool output + attachment) | 102,829 | 306 | session lifetime counter on the same row: 10 vs active context 306 — two different quantities |
| J5 two successive compactions | 120,337 → 278, then 101,000 → 283 | | one checkpoint after the second pass, no growth, no re-sent raw history |

The pre-fix defect these fixtures cover was measured on real data first: `keep` was not enforced, 20 of 31 compactions
that day ran over the 15,000-token budget, the worst at 2.49x (37,389 tokens).

#### One correlated turn (measured read-only from the live store)

Session `ses_ec48eb578ffe74WT5yyzIHQgxT`, compaction recorded 2026-10-16 20:00:46 local (`America/Chicago`, UTC−05:00 —
every wall-clock time in this file is that zone, and the store itself keeps UTC milliseconds), `status=completed`,
`reason=auto`. All of the numbers below belong to that one turn.

| quantity | value |
| - | - |
| configured threshold | `compaction.max_context` = 100,000 tokens (config unset → `AUTO_COMPACT_CONTEXT`); `keep` = 15,000; `RESERVE_MIN` = 16,000 |
| ceiling actually used | `min(calculateCeiling(1,000,000 window, buffer), max(100,000, keep + RESERVE_MIN))` = **100,000** |
| units | tokens. Provider-reported for the anchor message (input + cache.read + cache.write); everything after that anchor is estimated at 4 chars per token (`packages/core/src/util/token.ts`) |
| trigger moment | start of a step, before the request is built (`packages/core/src/session/runner/llm.ts` calls `compact({reason:"auto"})`) — not once per turn; overflow is a separate trigger that bypasses `due()` |
| active context at the preceding request (20:00:36) | 99,667 |
| provider usage on the summary request | input 37,156 + cache.read 30,592 = **67,748 prompt tokens**; output 6,033; reasoning 759 |
| what the UI label printed for that row | `67,748 in · 6,792 out` (label = input+read+write, output+reasoning) |
| summary written | 20,681 chars ≈ 5,170 tokens |
| retained recent text | 77,502 chars ≈ 19,376 tokens — **1.29x over the 15,000 keep budget** (the S1 defect) |
| stored compaction row | 101,928 bytes |
| active context at the next request (20:01:13) | 59,640 → **~40,000 tokens reclaimed** |
| usable part of that reclaim | ~25,000, because the irreducible floor (system + MCP tool schemas + instructions) is ~35,000 tokens |
| retries | not recorded anywhere — see the gap below |
| cumulative counters | `session_v2.tokens_input` is a session **lifetime** sum (millions), never the active context; the app's footer adds input+output+reasoning+cache.read+cache.write across loaded messages, which is also cumulative |

For contrast, the previous compaction in the same session (19:56:54) went 98,766 → 68,097 with a 59,936-token summary
request and 104,743 chars of retained recent (26,186 tokens = 1.75x `keep`).

#### What "200k input / 300k out" turned out to be

The only surface that prints "X in · Y out" for a compaction is the compaction row label
(`packages/session-ui/src/message/message-content.tsx`). Across the 120 stored compaction rows: the largest label
input is **893,212** (a real pre-cap summary request, from before commit `9fa94be874` introduced the 100k cap) and the
largest label output is **8,311**. So "~300k out" is not reproducible from stored data: the output side is model output
plus reasoning, which never exceeded 31,806 tokens in a single request. "~200k in" is the input+read+write label of a
summary request, not the active context. Some rows carry no usage at all, so the label can read `0 in · 0 out`.

#### Still open in Stage 0 (S2–S4, and the rest of J)

- S2: a minimum-reclaim guard so a compaction that frees almost nothing cannot immediately fire again.
- S3: honest and clearly separated counters — active context vs cumulative totals — in the app footer, the Details
  panel and the compaction row label (three unambiguous numbers: prompt sent, summary written, resulting context).
- S4: bound the summary's own output across successive compactions.
- J fixtures 2, 3 and 6 (mid-turn compaction, cancel/error recovery, restart recovery) and the runner-level
  continuation test.
- Known bound gap, recorded not hidden: a single message whose own text exceeds `keep` is still kept whole
  (`messageToText` truncates tool output at 1,250 chars but not assistant or user text).
- Gap: the retry count of a compaction request is not persisted anywhere, so it can only be observed live, not
  reconstructed from the store. Requirement J asks for it per turn; until it is recorded it stays UNVERIFIED.

### Stage 0a — DEV isolation — done; the switch-over itself is Ali's restart, and the run found one hazard

Measured first, at 18:02 local on 2026-10-16: the only running Electron app is the **DEV** instance (app-path
`...\.worktrees\opt\packages\desktop\out\main\index.js`, userData `com.aporianous.desktop.dev`, `packaged:false`), and
it is writing `opencode-aporia.db` — session `ses_ec15498a0ffefgkKGi3yhJ6Yaa` (this session) had 1032 messages, the
newest at 18:02:18 local. `packages/desktop/src/main/index.ts:29` defaults `OPENCODE_DB` to `opencode-aporia.db`, so
DEV shares the installed app's store unless the environment says otherwise. That is the defect this stage fixes.

The copy is `VACUUM INTO` rather than a file copy, because the DB is being written to throughout: `VACUUM INTO` reads
one consistent snapshot on a read-only connection, which is what a `.backup` gives.

| item | value |
| - | - |
| prod DB | `~\.local\share\opencode\opencode-aporia.db`, 10,206,101,504 bytes (9.51 GB), 691 sessions, `session_message` max(rowid) 70,126 |
| dev copy | `~\.local\share\opencode\opencode-aporia-dev.db`, 1,213,820,928 bytes (1.13 GB — one 4 KB page more than when it was written; explained by the write proof below), 691 sessions, 69,976 messages, `pragma integrity_check` = **ok** |
| snapshot moment | 17:57:35 local — the newest message in the copy; the live file was already at 18:02:18 (1009 vs 1032 messages in the same session) |
| free space | 30.7 GB before → 29.8 GB after (gate for later stages passes) |
| source connection | read-only; no write connection was ever opened on the live DB |

The 9.51 GB → 1.13 GB difference is unreferenced free pages (~8.4 GB), not a fix and not this stage's work; recorded
because it is surprising and it makes later `.bak` copies cheap.

Wiring proof, free and repeatable. `packages/cli/src/database-path.ts:12` is `path.resolve(data, filename)`, so a
relative name resolves against the data dir and an absolute path is used as-is:

| `OPENCODE_DB` | `opencode debug paths` → `db` |
| - | - |
| `opencode-aporia-dev.db` (what the launcher sets) | `~\.local\share\opencode\opencode-aporia-dev.db` |
| `opencode-aporia.db` (what runs today) | `~\.local\share\opencode\opencode-aporia.db` |
| unset | `~\.local\share\opencode\opencode-local.db` — the CLI's channel default, a different file again |

With an absolute throwaway path the CLI created `probe.db`, `probe.db-shm` and `probe.db-wal` at exactly that path and
left the data dir untouched: the environment variable, not the data dir, decides which file the app opens.

The launcher `run-dev-isolated.cmd` (582 bytes, SHA256 `BFE2F9A86F04A0FBF72F292D60FC734CE74EE5DA14D06584F94DDD6B0AE29429`)
is **git-ignored** — `.gitignore:46` is `run-dev*.cmd` — so it is recorded here instead of committed:

```
@echo off
set "PATH=C:\Tools\node22;%USERPROFILE%\.bun\bin;%PATH%"
set "OPENCODE_DISABLE_CHANNEL_DB=1"
set "OPENCODE_DB=opencode-aporia-dev.db"
cd /d C:\Tools\aporia\.worktrees\opt\packages\desktop
bun dev > C:\Tools\aporia\dev-isolated.log 2>&1
```

The log lives outside the worktree so it never appears as an untracked file. `dev.ts` overrides
`OPENCODE_DISABLE_CHANNEL_DB` to `0` and sets `OPENCODE_CHANNEL=local` at runtime, so `OPENCODE_DB` is the value that
decides the file.

**The 5-minute DEV run, done without ending this session.** The DEV app hosting this conversation cannot restart itself, so
the isolation test ran as a **second, independent DEV instance**: the already-built `out/` (no rebuild — nothing listens on
5173, main serves the built renderer when `ELECTRON_RENDERER_URL` is unset), its own profile under `%TEMP%\aporia-dev-iso`
so it takes its own single-instance lock, its own spawned server (`OPENCODE_DESKTOP_ISOLATED_SERVER=1`,
`OPENCODE_DESKTOP_SERVER_CHANNEL=local`, service file in that profile) and `OPENCODE_DB` pointing at the dev copy. It was
launched detached with `([wmiclass]'Win32_Process').Create($cmd)` because a `Start-Process` child is killed when the app
restarts. Baseline `2026-10-16T23:55:43.982Z` (= 18:55:43 America/Chicago, UTC−05:00); read 70 s later — read-only, from
both files:

| | prod `opencode-aporia.db` | dev copy `opencode-aporia-dev.db` |
| - | - | - |
| file size | 10,206,101,504 bytes (unchanged — WAL mode) | 1,213,820,928 → **1,220,341,760** bytes |
| messages / max(rowid) | 70,130 / 70,269 | 69,990 / 70,129 |
| rows written after the baseline | **24**, every one of them this session and this turn (21 `assistant`, 2 `compaction`, 1 `system`) | **14**, every one of them this session and none of them mine (9 `assistant`, 2 `synthetic`, 2 `system`, 1 `compaction`) |
| new project rows | none (38 before and after) | one, seen at 23:56:17.290Z in the earlier attribution run (`project 929146ea…`); the file holds 40 project rows against prod's 38 |
| the instance's own process command line | children of PID 34148, `--user-data-dir=…\com.aporianous.desktop.dev` | children of the second instance, `--user-data-dir=…\aporia-dev-iso\desktop` |

So the isolated instance wrote **only** into the file `OPENCODE_DB` named, and the prod file moved only from this session's
own turn. Two honest caveats, stated rather than hidden: (1) the second instance ran under a **test-root profile**, not
`com.aporianous.desktop.dev`, because a second instance sharing that profile would have been refused by the single-instance
lock — what this proves is which **database file** a DEV instance writes, not the profile name; (2) the run accidentally
produced a live duplicate agent (below), which is why the instance was killed.

**Hazard found, and it is worth knowing before the switch.** The 14 rows the dev copy received start with an app-generated
notice rather than anything I sent:

```
#70116 2026-10-16T23:56:16.572Z synthetic
{"metadata":{"notice":"restart"},"text":"The server restarted while you were working. Continue from where you left off
without repeating completed work.","description":"Continuing after restart"}
```

then a fresh 49,325-character instruction blob (`#70117`, `#70120`, `metadata.notice = "instructions"`), then a synthetic row
carrying **my own interrupted shell job** marked cancelled —

```
#70118 synthetic {"metadata":{"source":"shell","shellID":"sh_146efbb5f001s1n8sr59270WNV","state":"cancelled"}, …
"Command cancelled because the server restarted"}
```

— and that is the `copy-db.ts` command from this turn. Read together: on startup the app **resumed the interrupted turn**,
re-injected the instruction blob and told the agent to continue, and the agent continued **with the copy's context**, which
stops at 22:57 — an hour behind the tree it was writing to. Its own reasoning in `#70121` says so: *"the repo log now shows
commits I didn't make in this visible history."* Same session id, same worktree, same task, stale context, real API spend,
and a second writer.

Standing rule that follows (also in `REQUIREMENTS-EVIDENCE.md`): **never point an app instance at a copy of a database whose
in-flight turn has already continued or finished in the original file** — the instance will resume it. Starting a *fresh*
DEV could hit this too, so the switch script warns instead of staying silent.

The duplicate was killed and its side effects audited: no worktree `electron.exe` survived, nothing held `--port 3084`, no
stray partial copies under the temp roots, `git status --porcelain` in the worktree clean, and its only artifacts are
`work/db-probe.ts` and `work/out-copydb.txt` in the bot folder. Its rows were left in the dev copy on purpose: the copy is
the artifact that carries the finding, and the switch script rebuilds it.

**Switch-over, one action.** (1) Quit the DEV app from the tray. (2) Run
`C:\Users\Dilla\Aporia\bots\aporetic-dev\work\switch-dev-to-isolated.cmd` — it refuses while an app instance is up, rebuilds
the dev copy from prod with `VACUUM INTO`, checks `integrity_check`, swaps it in, warns if the newest unfinished turn in the
copy is recent, and launches `run-dev-isolated.cmd`. (3) Say "switched" and DEV is on its own DB from then on. The copy is
rebuilt at switch time rather than now so it cannot carry an in-flight turn; the dev copy left on disk is deliberately the
run's artifact.

The write proof — the missing half of the acceptance check, obtained without restarting the app. Running the app's **own** CLI
in standalone mode with `OPENCODE_DB=opencode-aporia-dev.db` from the CLI package wrote to the copy and to nothing else:

| what | copy (`opencode-aporia-dev.db`) | prod (`opencode-aporia.db`) |
| - | - | - |
| `session export ses_eb9a719b… --standalone --sanitize` | read 212,590 bytes of JSON out of it | untouched |
| `session import` (the marked export) | wrote `project` row `c5189011fce500798501d55e0d4d892df7cae532` (`C:/Tools/aporia`, `vcs:git`) at 23:03:17.486Z **plus 2 `worktree` rows** (`C:/Tools/aporia`, `C:/Tools/aporia/.worktrees/opt`) at 23:03:17.5 | **absent** — 38 project rows, and its only aporia worktree row is the old `a1b358fd…` from 2026-10-11 |
| `kv` row `job.background/msg_146efbb71001ci3889tfu2xgHN` at 22:57:58.642Z | present | not checked past the snapshot |

The import itself failed (`Internal Server Error`, because the export reuses message ids that already exist — a primary-key
conflict in the probe, not a product bug) and it wrote no partial session rows: both marker ids are absent from both files
(`work/db-marker.ts`). The one 4 KB page the copy gained is exactly those project/worktree rows. So the code path that
writes, writes to the file `OPENCODE_DB` names — verified both ways: present in the copy, absent in prod.

Open question, not a claim: the same directory `C:/Tools/aporia` now carries **two** project ids — `a1b358fd…` (2026-10-11,
`strategy` null in its worktree row) and `c5189011…` (23:03:17 today, `vcs: git`, worktrees recorded). Either the id is
derived from something that changed (a remote or a resolved repo root) or the app can mint a duplicate project id for one
directory. Worth checking when the bot/team model lands, because sessions hang off project ids.

Evidence files, all committed under `docs/an-rewrite/evidence/`:

| file | what it holds |
| - | - |
| `2026-10-16-session-suites.txt` | the five session suites re-run on `7fd1f9d77e`: `Ran 252 tests across 5 files`, 252 pass / 0 fail, exit 0 |
| `2026-10-16-typecheck.txt` | `bun run typecheck` in `packages/core`, exit 0 |
| `2026-10-16-commit-files.txt` | `git show --stat` for both Stage 0 commits — the scope claim |
| `2026-10-16-db-wiring.txt` | the four `debug paths` runs and the files the CLI created at the absolute probe path |
| `2026-10-16-db-prod.txt`, `2026-10-16-db-copy.txt` | the same session in both files — 1065 messages at 23:09Z in prod against 1009 frozen at 22:57:35Z in the copy |
| `2026-10-16-dev-db-isolation.txt` | the isolation run: both files' size/row counts/rows-since-baseline grouped by session, the unfinished-turn tails, and all 14 rows the resumed turn wrote into the dev copy |

Re-run any of them: `bun work/run-and-log.ts <outfile> <cwd> <command…>` and `bun work/db-wiring-proof.ts <outfile>`
(the scripts live in `C:\Users\Dilla\Aporia\bots\aporetic-dev\work`, outside the repo, and only ever open a database
read-only).


### Stage 1 — durable domain model: bots, teams, missions, tasks — branch `an/stage-1-domain-model`

Branch `an/stage-1-domain-model` from tag `an/checkpoint-pre-stage1` (`c2b211d313`). Nothing pushed, nothing merged,
nothing packaged, nothing installed. Push state is stored, not inferred: `docs/an-rewrite/evidence/2026-10-17-stage1-branch-log.txt`
records `git ls-remote --heads origin refs/heads/an/*` returning nothing (exit 0), `git branch -r --contains HEAD` returning
nothing, `git ls-remote --tags origin refs/tags/an/*` returning nothing, no upstream on the branch, `origin` as the only
remote, and `rebrand/nousphere` holding none of the Stage 1 commits. Commits since
the checkpoint, per that log: `e2be3f6b1b`, `4d1de66eb5`, `8a4724ff36`, `414d159845`, `19f4e7cf24`, `6167b94db4`,
`28b6f22a4d`, plus the docs commit that carries this sentence, which by construction cannot appear in a log written before it.
No commit count is stated here for that reason; `git log --oneline c2b211d313..HEAD` is the authority.

**Independent verification: VERDICT PASS on the fifth pass.** The first four failed — one on a real code defect (`archiveBot`'s
shared revision), three on documentation claims that had no stored output or were wrong. Every pass is quoted in
`docs/an-rewrite/evidence/2026-10-17-stage1-verifier-passes.md` and summarised under **Independent verification** below.

| # | commit | subject | tests |
| - | - | - | - |
| 1 | `e2be3f6b1b` | `feat(mission): durable bot, team, mission and task domain` | 9 tests in `packages/core/test/mission.test.ts`; `packages/core` typecheck exit 0 (gates §1, §3) |
| 2 | `4d1de66eb5` | `fix(mission): let the backfill runner read counts before the domain tables exist` | the first run against the dev copy died in its own pre-migration count query (`no such table: bot`) before it migrated anything — observed then, not stored; what is stored is the pre-migration read of a pre-stage file reporting `bot: -1` (replay §1) and the post-fix runner exiting 0 (replay §2) |
| 3 | `8a4724ff36` | `docs(an-rewrite): record Stage 1 and its replay evidence` | docs only, not re-verified |
| 4 | `414d159845` | `fix(mission): bump each reassigned task's own revision on archive` | the first independent verification pass caught this (see **Independent verification** below); red/green in gates §1–2 |
| 5 | `19f4e7cf24` | `test(mission): pin both tasks across a refused and a completed archive` | same test file, 9 pass / 62 `expect()` calls, exit 0 (gates §1) |
| 6 | `6167b94db4` | `docs(an-rewrite): back Stage 1's numbers with stored runs, fix the claims the verifier failed` | docs only, not re-verified. The two docs commits after it (`28b6f22a4d` and the one carrying this table) correct hashes and wording in this section; they are not listed as rows because a row cannot name the commit it is written in. Nothing in them changes code, tests or data |

Evidence for every number below: `docs/an-rewrite/evidence/2026-10-17-stage1-gates.txt` (the test runs, both typechecks, the
scope diff and the live-store check), `docs/an-rewrite/evidence/2026-10-17-stage1-devcopy-state.txt` (the dev copy's own counts,
read-only) and `docs/an-rewrite/evidence/2026-10-17-stage1-migration-backfill.txt` (the migration and backfill replay). The
gates file opens with `git log` for the branch and its working tree, so a reader can see which commits existed when the runs
were made; §1 is the tree at `19f4e7cf24` and §2 re-runs the same test against `service.ts` as of `8a4724ff36` to show the
fail it was written for.

Standing gates at `19f4e7cf24`, stored in the gates file: `bun test src/aporia` in `packages/app` = **54 pass / 0 fail** across
10 files, exit 0 (§4); `bun test src/main/aporia` in `packages/desktop` = **62 pass / 0 fail** across 10 files, exit 0 (§5);
`bun run typecheck` exit 0 in `packages/core` (§3); `bun run typecheck` in `packages/app` and `packages/desktop` exits 1 with
**only** the two `custom-elements.d.ts:1` TS1128 errors (§6–7), and §8 shows that file is byte-identical to `c2b211d313`, so
the two errors pre-date this branch rather than being introduced by it.

**What is actually built.** Eight tables — `bot`, `team`, `team_member`, `mission`, `mission_session`, `task`,
`task_dependency`, `mission_ui_state` — created by generated migration
`packages/core/src/database/migration/20261017073336_stage1_bot_team_mission.ts`, which the generator also folded into
`src/database/migration.gen.ts` and the fresh-install bootstrap `src/database/schema.gen.ts` (a new database bootstraps the
same DDL and then marks the migration complete; without both files a fresh install and an existing store would diverge).

Four decisions worth stating because they are the ones later stages lean on:

- **`id` and `slug` are separate.** `id` (`bot_…`, time-ordered, never reused) is what work points at; `slug` is the
  immutable natural key carried from the file store. A rename therefore changes only `name`, and no task, mission or session
  reference has to be rewritten. Backfilled ids derive from the slug (`bot_<slug>`, `team_<slug>`, `mis_room_<slug>`), which
  is what makes a repeated backfill an upsert rather than a duplicate.
- **Archiving a bot with open work is refused, not silently allowed.** `archiveBot` returns `Mission.BotHasOpenTasks` with
  the task ids and the bot still live; with `reassignTo` it moves the tasks, bumps each task's `revision`, and archives the
  bot in one transaction. A bot whose work is all terminal archives without a successor.
- **Dependencies are rows, not JSON.** `task_dependency` makes "what blocks X" and a cycle check queryable; self-links,
  cross-mission links and cycles are rejected with `Mission.Link`.
- **UI state is its own table keyed by mission** (`mission_ui_state`: draft, scroll, selected bot/artifact). A draft is a
  view of the work, not the work, so it never lands in `mission` and never affects a mission's state machine. `mission.origin`
  (`manual|room|import`) keeps a backfilled container from being mistaken for user-created work.

The service (`packages/core/src/mission/service.ts`) exposes 29 methods over branded ids (`BotID`/`TeamID`/`MissionID`/
`TaskID`), and `Mission.node` depends only on `Database.node`, matching how `project`, `kv` and `saved` are wired.

**Backfill adapter.** `src/mission/backfill.ts` is a pure planner (files + what the database already holds -> rows to insert,
plus warnings); `script/mission-backfill.ts` is the runner that owns I/O. It requires an explicit `--db` path, **refuses any
file named `opencode-aporia.db`**, supports `--dry-run`, maps `bots/<slug>/bot.json` -> `bot`, `rooms/<slug>/room.json` ->
`team` + `team_member`, and each room's per-member `sessions` map -> one mission titled `Room: <name>` with `origin: room`
and one `mission_session` row per member (the participant slug is kept, so attribution survives). It never writes `session`
or `session_message`: a session is linked by id, and the two counts printed around every run are the check that this holds.

**Evidence — `docs/an-rewrite/evidence/2026-10-17-stage1-migration-backfill.txt`.** The dev copy took the migration and the
backfill first; the replay then ran both on a **byte copy of `opencode-aporia-dev.db.bak-stage1`** (the pre-stage backup), so
the "before" state is reproducible rather than remembered. The dev copy itself is counted, read-only, in
`2026-10-17-stage1-devcopy-state.txt` (33 tables, 8/8 domain tables, `session_v2` 691, `session_message` 69,990, 13 bots,
1 team, 1 mission, 0 tasks, migration 51, `integrity_check` ok, and the three sessions below read in a fresh process).
Numbers from the replay file:

| step | tables | `session_v2` | `session_message` | `project` | `migration` | domain rows |
| - | - | - | - | - | - | - |
| before (byte copy of `.bak-stage1`, `integrity_check` ok, 1,214,136,320 B) | 25 (0/8 domain) | 691 | 69,990 | 40 | 50 | none |
| after first run (`exit=0`) | 33 (8/8 domain) | 691 | 69,990 | 40 | 51 | 13 bots, 1 team, 1 mission, 2 links |
| after second run (`exit=0`) | 33 | 691 | 69,990 | 40 | 51 | nothing inserted; `skipped 13/1/1` |

The three most recent old sessions open and read in a **fresh process** after the migration: `ses_eb9a719b…` ("Compaction
architecture inventory", 42 messages, last row `idle` at 20:15:26Z), `ses_ebb9e9bc…` ("Map CLI build and dispatch", 32
messages), `ses_ebbb15fe…` ("Extract Votel state facts", 11 messages). The room mission's links resolve
`ses_ed4519175f…` -> `copy-humanizer` (title "Room: Setup test") and `ses_ed4517237f…` -> no session row.

**Acceptance for brief section B (the parts that do not need the UI yet).**

| item | status | evidence |
| - | - | - |
| rename a bot, its old tasks still resolve | PASS | test `renaming a bot keeps its tasks resolving by id`: after a rename the task's `ownerId`/`missionId` are unchanged, `revision` stays 1, and `getBotBySlug` still resolves |
| archive a bot with a pending task -> explicit reassign or blocked | PASS | test `archiving a bot with open work is refused until the work is reassigned`: the bot has two open tasks, one already reopened to revision 2; the refusal names `botID` + both `taskIDs`, leaves the bot live and both tasks where they were; with `reassignTo` each task moves on its own revision (`2 -> 3` for the reopened one, `1 -> 2` for the other) and the bot drops out of `listBots()` while staying in `listBots({archived:true})` |
| restart -> all rows restored | PASS at the store level, **app restart still Ali's** | test `restarting over the same file …`: a second, independent layer over the same file restores bots, team membership, coordinator, mission, both tasks, the dependency edge, the session link and the saved UI state; plus the replay file above read in fresh processes |
| old sessions still open | PASS by read, app-open still Ali's | the three sessions above read with their message counts in a fresh process; `session_v2`/`session_message` counts unchanged by both the migration and the backfill |

**Deviations, recorded so the next stage does not rediscover them.**

- The domain lives in `packages/core/src/mission/` (`schema.ts` = Effect Schema, `sql.ts` = drizzle tables, `service.ts`,
  `backfill.ts`) plus a top-level `packages/core/src/mission.ts` that re-exports it as `Mission.*`. The package exports map is
  `./*` -> `./src/*.ts`, so a bare directory is not importable, and this repo keeps Effect Schema and drizzle declarations in
  separate files (`project/` does the same). The build list says "tables + Effect services"; the shape is the same, the file
  names are not.
- `packages/core/script/migration.ts` needed a Windows fix to run at all: `Bun.Glob` yields backslash paths, and
  `.split("/")[0]` then returned the whole path, so generation died with `ENOENT …\migration.sql\migration.sql`. It now does
  `.replaceAll("\\", "/")` first. Without this the migration could not be generated on this machine.
- The generated DDL creates `mission_session` before `mission` (alphabetical table order). Migrations run with foreign keys
  off and SQLite resolves them at run time, so inserts are unaffected; it is noted because it looks wrong at a glance.
- Per-bot chat sessions are **not** promoted to missions. They stay reachable as sessions; only rooms become missions. A
  second backfill pass can add them once Stage 2 defines what a single-bot mission means.

**Limitations, stated plainly.**

- The one reference that does not resolve — `ses_ed4517237ffeUzNXSk9w5o8geS` for `projects-manager` in `room.json` — is
  missing from the **live** store too, so the backfill copied a dangling reference faithfully rather than creating one (gates
  file §11 is the read-only query against `opencode-aporia.db`: the id returns `MISSING in live`, while
  `ses_ed4519175ffe…` returns "Room: Setup test"). There is deliberately no foreign key from `mission_session` to the session
  tables; the resolver shows "no session row" instead of failing.
- Stage 1 has no UI. The domain is reachable from code and tests, not yet from the app; the Bot Team roster and mission
  switching are Stage 4.
- The migration has not yet been applied by an app *start* under Ali's window: the switch-over to the dev copy (Stage 0a)
  still waits on his one action, and this stage deliberately did not touch the running DEV app, the installed app, port 4096,
  or any CLI cache. Note what the switch does to this stage's data: `switch-dev-to-isolated.cmd` **rebuilds**
  `opencode-aporia-dev.db` from prod and swaps it in, so the copy that exists today (already migrated and backfilled) is
  replaced by a fresh, unmigrated one. The first app start after the switch applies this migration to that rebuilt copy, and
  `script/mission-backfill.ts` has to be run again there to repopulate the 13 bots / 1 team / 1 mission / 2 links. That is the
  same DDL and the same runner proven above, but it is a second run, not a carried-over result.

Rollback: `git revert 19f4e7cf24 414d159845 8a4724ff36 4d1de66eb5 e2be3f6b1b` (newest first; `414d159845` and
`19f4e7cf24` touch the same `service.ts` hunk and the same test that `e2be3f6b1b` creates, so reverting the feature commit
alone conflicts rather than returning the tree). The migration file and both generated registries go with `e2be3f6b1b`. For
data, `opencode-aporia-dev.db.bak-stage1` is the pre-stage copy (`integrity_check` ok, 691 sessions, 69,990 messages) and the
replay above proves restoring it and rerunning reproduces the same result.

## Independent verification

Every pass was the `verifier` subagent, read-only, and each was reported as it came. The text of each pass it returned is
stored in `docs/an-rewrite/evidence/2026-10-17-stage1-verifier-passes.md`; the sentences below are the summary, and where they
differ in detail the stored report is the one to read.

**Pass 1 — VERDICT FAIL, Stage 1 tree at `8a4724ff36`.** The defect it found was real: `archiveBot` wrote one revision for the
whole set, derived from the oldest open task (`open[0].revision + 1`), so a task already at revision 3 would have been lowered
to 2 on reassignment, and two tasks at different revisions collapsed onto one number. The test could not see it because it
moved a single task at revision 1. Fixed in `414d159845` (each row moves on its own `revision + 1`, inside the same
transaction, matching `reassignTask`), and the test now carries two open tasks at revisions 1 and 2 and asserts 2 and 3
(`19f4e7cf24`); gates file §2 re-runs that test against the pre-fix `service.ts` and shows it failing with `Expected: 3 /
Received: 2`, so the assertion is not vacuous. The same pass also caught doc claims without stored runs (the test counts, the
two typechecks, the 54/62 suite numbers) — those now live in `docs/an-rewrite/evidence/2026-10-17-stage1-gates.txt` — a wrong
method count (33 was the `Effect.fn` definitions including four private loaders; the interface exposes 29), an incomplete
commit table, and a rollback command that would have conflicted.

**Pass 2 — VERDICT FAIL, same tree plus the first doc fixes.** It confirmed the code fix itself (per-row revision with no
`open[0]` derivation, the red run failing at exactly the new assertion with `Expected: 3 / Received: 2`, and red/green
`expect()` counts consistent), and confirmed claims 1, 2 and 4–9 unchanged. Everything it failed on was documentation: "33
service functions" (29 is right), a pointer to a Stage 0 section as if it had caught the Stage 1 defect, a commit table missing
`8a4724ff36`, a rollback command missing `414d159845`, two "pre-existing"/"checked read-only" claims with no stored artifact,
`REQUIREMENTS-EVIDENCE.md` row 3 omitting two commits, and an acceptance row asserting for one task what it said for both.
All were fixed before Pass 3.

**Pass 3 — VERDICT FAIL, tree at `28b6f22a4d`.** No code or test objection and no risk to Ali's app or data; six documentation
and claim faults: a commit count that a later commit had already invalidated, "the full text of each pass is stored" while only
two of three were, a sentence saying the verifier has no shell when it had in fact quoted `git` output, a checkout line naming
`rebrand/nousphere` while the work sat on the stage branch, `REQUIREMENTS-EVIDENCE.md` row 5 citing the replay file for facts
that are in the dev-copy file, and a claim that the backfill runner could be re-run "against `.bak-stage1`", which would have
migrated the restore point itself. All six are corrected in the docs commit that carries this paragraph.

**Pass 4 — VERDICT FAIL, same tree plus the branch-log evidence.** One objection, and it was correct: "nothing is pushed"
rested on "no upstream configured", and a branch pushed with `git push origin HEAD` (no `-u`) has no upstream either. The
branch-log generator now asks the remote directly and the regenerated file stores `git ls-remote --heads origin
refs/heads/an/*` and `git ls-remote --tags origin refs/tags/an/*` both empty at exit 0, plus `git branch -r --contains HEAD`
empty.

**Pass 5 — VERDICT PASS.** It verified, from the stored files: the push state including the no-`-u` case; the seven commits;
the dev-copy counters; the replay numbers; the 9 / 54 / 62 test runs and the two `custom-elements.d.ts:1` errors; and that
`service.ts:340-343` still bumps each reassigned task's own revision with the archive test pinning 1→2 and 2→3 across both the
refused and the moved state. What it lists as still unverified or disclosed, quoted in full in the passes file: the push check
covers one remote and only the `refs/heads/an/*` and `refs/tags/an/*` namespaces; the replay database is deleted, so its counts
stand on stored text; the dev copy is counted read-only and no pass re-ran the migration against it; the file scope is per
stage, not per commit; the app restart and the switch-over are Ali's; and the evidence holds no credential.

**What no pass could check from the repo, disclosed rather than claimed.** The verifier reads files and quotes `git` output,
but runs no build, test, migration or app command, so anything a command produces is checked against the stored evidence
files rather than reproduced. The replay database was a temporary copy and is deleted, so the replay's table and row counts
stand on the stored text; the dev copy's own state is counted separately, read-only, in
`2026-10-17-stage1-devcopy-state.txt`. The stage's whole file scope is gates §9 (`git diff --name-only`/`--stat` from the
checkpoint, which is per stage rather than per commit). The same runner can be re-run against a **fresh copy of** `.bak-stage1` — never against
the backup itself: the runner refuses only `opencode-aporia.db` by name, so pointing it at `opencode-aporia-dev.db.bak-stage1`
would migrate the restore point in place. Push state is stored rather than inferred: no upstream, `git ls-remote --heads origin
refs/heads/an/*` and `--tags origin refs/tags/an/*` both empty, `git branch -r --contains HEAD` empty, and
`rebrand/nousphere` holding none of the stage commits (`2026-10-17-stage1-branch-log.txt`). The gates file is produced by
`C:\Users\Dilla\Aporia\bots\aporetic-dev\work\stage1-gates.cmd`, §11 by `work\check-room-sessions.ts` and the branch log by
`work\stage1-branch-log.cmd`, all outside the repo; the live store is opened `{ readonly: true }` and written by none of them.

Pass 1 of the earlier stage, for completeness, was `verifier` at tree `32cbce8f72` (Stage 0) — it never looked at `archiveBot`,
so the Stage 1 defect is Pass 1 above, not that one.

### Stage 0 — verifier at `32cbce8f72` (PASS)

- **VERDICT PASS.** Every item it failed on its first pass is now confirmed from files: the amended hash is right and no
  live claim cites `7e44cba2c1`; the `252 pass / 0 fail` and typecheck `exit 0` evidence files match the claims word for
  word; the per-commit file lists are readable text; the correlated-turn times carry a zone (`America/Chicago, UTC−05:00`).
- Code claims it re-checked itself: the `userBoundary === 0` fall-through in `packages/core/src/session/compaction.ts`
  is byte-identical to the pre-fix file while the `userBoundary > 0` path is bounded by `keep` (`:756-765`); the two new
  `SUMMARY_RULES` bullets exist only after the fix (`:154-155`); fixtures 1, 4, 5 assert retention and accounting and
  never the summary's wording (`packages/core/test/session-compaction.test.ts:736, 791, 853`).
- Disclosed and not resolved: the exact fixture `after` figures (289, 306, 278, 283) are prose, not a stored run
  artifact — the tests assert bounds, which the fixture table already says; the two docs commits' own `--stat` lines were
  missing from the evidence file (appended by the commit that carries this paragraph); the literal token "CT" is not used,
  `America/Chicago, UTC−05:00` is.

The verdict applies to `32cbce8f72`. The commit carrying this paragraph is docs-only and was not re-verified.

## Blockers

None. Every stage attempted so far is committed and green.
