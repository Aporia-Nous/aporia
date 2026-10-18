# Aporetic rewrite — STATUS

Checkout: `C:\Tools\aporia\.worktrees\opt`, on `rebrand/nousphere` up to the checkpoint tag `an/checkpoint-pre-stage1`
(`c2b211d313`), and on stage branches from there on (Stage 1 on `an/stage-1-domain-model`; Stage 2 on
`an/stage-2-event-store`, cut from the Stage 1 tip; Stage 3 on `an/stage-3-coordinator`, cut from the Stage 2 tip; flow stage 1 on `an/flow-stage-1`, cut from the Stage 3 tip). None is merged back. Source of truth for the order of work:
`APORETIC-DEV-BUILD-LIST.md` (a copy of it is not kept here; the brief is `APORETIC-DEV-REWRITE-HANDOFF.md`, sections A–K).

Nothing is pushed. Nothing is merged. The installed app (`%LOCALAPPDATA%\Programs\Aporetic`) is untouched by this
work, and the live database is only ever read (Stage 0a takes a read-only copy of it). No packaging script and no
`aporia-update` was run.

## Stage log

### Stage 0 — compaction (brief J) — prior 2 commits + AP-CURSOR-02 S2 (J stays PARTIAL: S3–S4 and recovery fixtures open)

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

#### S2 — minimum-reclaim guard (AP-CURSOR-02) — PASS at source/unit; running-DEV acceptance OPEN

Branch `compaction-reclaim-guard` @ `fdd716de12` in worktree `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic`
(isolated from `C:\Tools\aporia` and `.worktrees\opt`). Base HEAD observed at launch: `0229ce1f2d`.

| item | value |
| - | - |
| change | `due()` skips auto compaction when the latest completed checkpoint left less than `min(5_000, 5% of ceiling)` tokens of headroom under the fire point and the session has not yet grown by that same amount past the post-compaction floor |
| overflow / manual | unchanged — they do not consult `due()` |
| small-window | preserved — a 4k-context model keeps successive auto compact (runner regression still green) |
| keep / recent instructions | unchanged |

Evidence: `docs/an-rewrite/evidence/2026-10-18-session-suites-s2.txt` (`Ran 253 tests across 5 files`, 253 pass / 0 fail,
exit 0 — prior Stage 0 suite was 252; +1 is the S2 regression) and `docs/an-rewrite/evidence/2026-10-18-typecheck-s2.txt`
(`bun run typecheck` in `packages/core`, exit 0). Code files: `packages/core/src/session/compaction.ts`,
`packages/core/test/session-compaction.test.ts`. Report: `docs/an-rewrite/CURSOR-AP-CURSOR-02.md`.

Running-DEV proof was not manufactured: no app restart, no DB mutation, no live session load of this build.

#### S3 — honest UI counters (AP-CURSOR-03) — implemented at source/unit; independent review OPEN

Branch `compaction-honest-counters` cut from `compaction-reclaim-guard` @ `36167ddfa5`. Report:
`docs/an-rewrite/CURSOR-AP-CURSOR-03.md`.

| surface | change |
| - | - |
| App footer (`packages/app/src/aporia/layout.tsx`) | Labels **Active context** (last assistant prompt) vs **Lifetime total** (cumulative session usage) |
| Details panel (`packages/app/src/aporia/right-panel.tsx`) | Same two quantities as separate rows (was a single ambiguous "Tokens") |
| Compaction row (`packages/session-ui`) | Label is `prompt sent · summary written · resulting context` via `compaction-usage.ts`; resulting context comes from the next assistant prompt when present, otherwise omitted (not invented) |

Tests stored: `docs/an-rewrite/evidence/2026-10-18-compaction-usage-s3.txt`, `…-session-stats-s3.txt`, typecheck evidence under the same date prefix. No merge/push; running-DEV not claimed. Design mode 3 vs 4 stays OPEN.

#### Still open in Stage 0 (S4, and the rest of J)

- S3: source/unit implemented on `compaction-honest-counters` — **independent PASS not claimed**; running-DEV OPEN.
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

### Stage 2 — append-only event log and coordinator — branch `an/stage-2-event-store`

Branch cut from the **Stage 1 tip** (`28859fd16e`), not from `rebrand/nousphere`. Stage 2 builds on Stage 1's `task` table, so
cutting it from the checkpoint would have meant re-creating that table here; the deviation is recorded because it also means
this branch carries Stage 1's commits. The commit list is not retyped here — a list written in prose is exactly what went stale,
so read it from `git log an/stage-2-event-store`, which is authoritative at every tip: the log starts at `07a85dfafc` (the log
and its cursor), `285d02fa91` (the rules and the coordinator), `96ee966d94` (the first tests), `849840bb55` (two defects the first
verifier pass found), `df5054e918` (three more tests), `225781f019` (the restart proof made to depend on the log alone), and
continues through the documentation and evidence commits. The snapshot in the branch log stops at its own HEAD, `71bcc139cb`;
`a77ac8747c` and everything after it post-date that snapshot and are not in it. Nothing pushed, nothing merged, nothing
packaged, nothing installed. The
push state is stored, not inferred, in `docs/an-rewrite/evidence/2026-10-17-stage2-branch-log.txt`, which records each command
line, its output and its exit code at `71bcc139cb`: `git ls-remote --heads origin refs/heads/an/*` empty at exit 0, `git
ls-remote --tags origin refs/tags/an/*` empty at exit 0, `git branch -r --contains HEAD` empty, no upstream on the branch (exit
128), and `rebrand/nousphere` holding none of the Stage 2 commits.

| # | commit | subject | tests |
| - | - | - | - |
| 1 | `07a85dfafc` | `feat(mission): append-only mission event log with a replay cursor` | covered by the Stage 2 tests below; `packages/core` typecheck exit 0 (gates §3) |
| 2 | `285d02fa91` | `feat(mission): derive coordination state and the wake rules from the log` | same file; gates §1–3 |
| 3 | `96ee966d94` | `test(mission): prove the coordination rules and coordinator recovery` | no run of that commit is stored; the stored run is the tip's 13 pass / 0 fail, 126 `expect()` calls (gates §1) |
| 4 | `849840bb55` | `fix(mission): make append's result honest and the wake dedupe log-backed` | gates §1–3 |
| 5 | `df5054e918` | `test(mission): pin the role rules and the approval resume` | 13 pass / 0 fail, 126 `expect()` calls, exit 0 (gates §1) |

Evidence: `docs/an-rewrite/evidence/2026-10-17-stage2-gates.txt` (all test runs, the test names, the three typecheck runs —
core, app, desktop —, the dev copy read read-only, and the generated migration), `…-stage2-backup.txt` (the pre-migration
backup, counted read-only) and `…-stage2-branch-log.txt` (push state), plus `…-stage2-red-run.txt` (a mutation run that
disables the log check and shows the restart test failing, then restores the file byte-for-byte). The gates file opens with
`git log`/`git status --porcelain` for the tree the runs were made on, and says in its own words that the evidence files this
run writes appear in that status as modified or untracked because they are committed after it.

Standing gates at `71bcc139cb`, stored: `packages/core/test/coordination.test.ts` **13 pass / 0 fail** (§1, with the test
names printed underneath so each rule can be matched to a run), `packages/core/test/mission.test.ts` **9 pass / 0 fail** (§2,
so Stage 1 still holds), `bun test src/aporia` in `packages/app` **54 pass / 0 fail** across 10 files (§4), `bun test
src/main/aporia` in `packages/desktop` **62 pass / 0 fail** across 10 files (§5), `packages/core` typecheck exit 0 (§3), and
the two `packages/app` `custom-elements.d.ts:1` TS1128 errors which pre-date this branch (§6–7, same two errors Stage 1
stored).

**What is actually built.**

- **`mission_event`, append-only.** Columns `seq` (integer primary key, autoincrement), `id` (unique), `mission_id`, `task_id`,
  `correlation_id`, `type`, `actor`, `payload`, `idempotency_key` (unique), `time_created`; four indexes (mission, task,
  correlation, idempotency). `MissionEvents.append` does its key lookup, its insert (`onConflictDoNothing`) and, when it loses
  a race, its read-back all inside one transaction, and returns `{event, inserted}` where `inserted` is true only when this
  call created the row. Nothing updates or deletes a row. No foreign keys on purpose: history must survive a bot or mission
  being archived.
- **A single-row cursor**, `mission_coordinator_cursor` (id `"mission"`, `seq`), records how far the coordinator has replayed.
  It only moves forward.
- **`Coordination.fold`** is a pure function from a correlation's events to a view (purpose, open/closed, closure reason, who
  opened it and who it is addressed to, the message count, and the no-progress counter). State is derived, never stored, so it
  cannot drift from the facts and a restart needs no repair.
- **`Coordination.decide`** is pure and total (no Effect, no database): event + task + folded view + roster -> decisions of the
  form `wake | task | transition | close | attention`. The coordinator is the only thing that writes.
- **`Coordinator`** (`Service` = `emit`, `handle`, `drain`, `cursor`) serialises everything behind the repo's
  `KeyedMutex.make<"mission">()`. The waker is injected (`WakerService`), and the production layer delivers through the existing
  session inbox (`SessionInbox.admit`) using a key of `wake:<event id>:<bot>:<purpose>`.
- `Mission.listMissionSessions` was added to the service (interface + implementation + returned object) so a mission's sessions
  can be read without touching the store directly.

**The rules, and what makes each one hold.**

| rule | how it is enforced | test |
| - | - | - |
| `artifact.created` wakes the reviewer | roster resolution: explicit `payload.reviewer`/`verifier`/`owner` (slug or id) wins, else the first expert on the team who is not the owner, else the team's coordinator | `an artifact wakes the reviewer once; a replay wakes nobody` |
| `review.passed` wakes the verifier | the verifier from the same roster resolution; no verifier -> one attention item | `a passed review wakes the verifier, and no other role` |
| a role with nobody in it is never silent | a missing reviewer or verifier produces one `coordination.attention` with a per-event dedupe key instead of dropping the wake | `an event with nobody in that role raises one attention instead of silence` |
| `review.failed` sends the task back with the finding | `transition` to `in_progress` through `setTaskState`, which already bumps `revision` when leaving a terminal state -> revision 2, no new API | `new failing evidence reopens the task as revision 2` |
| `approval.required` is one attention item | the decision's dedupe key is `attention:approval:<approvalId>`, and the append ignores a key it already holds | `one approval produces one attention item, however often it is raised` |
| `approval.granted` resumes once | a cause whose wake is an outcome, keyed `wake:<event id>:<bot>:<purpose>`, so a replayed grant finds the recorded wake and does nothing | `a granted approval resumes the owner exactly once` |
| ack never triggers an ack | `ack` is in the outcome set: `decide` returns no decisions for any outcome, and an ack also counts as "no information" in the fold so a stream of them cannot reset the no-progress counter | `an ack never produces a wake or another ack` (20 acks, 0 extra wakes, 0 attention) |
| a terminal task produces no wakes | `isTerminalTask` short-circuits `decide` except for the reopen set (`task.reopened`, `review.failed`) | `a terminal task produces no wakes` |
| no message cap | `messages` is a count for humans; the only thing that escalates is the same content repeated, `NO_PROGRESS_LIMIT = 3` | `fifty distinct messages are all routed: the count is not a cap` (51 wakes, thread still open) |
| repeat with nothing new -> no progress -> coalesce, then escalate | consecutive identical content fingerprints (FNV-1a over purpose + text + target, **not** the event type) coalesce silently; once the counter reaches 3 — three repeats after the opener, four identical messages in all — one attention item is raised and the thread closes with `no-progress` | `a repeat with nothing new coalesces, then escalates exactly once` |
| exactly-once wake | the coordinator first reads the correlation's events for the recorded `wake:<event id>:<bot>:<purpose>` key and returns if it is there, then calls the waker, then appends the `coordination.wake` row with that key — so the log, not process memory, decides "already woken", and a delivery record can never precede the attempt | `handling the same fact twice delivers one wake` and the three-boot restart test |

**Acceptance for brief section E (the parts that do not need the UI).**

| item | status | evidence |
| - | - | - |
| renderer killed after Builder finishes -> on reopen the Reviewer runs once | PASS at the coordinator level; **the app does not start the coordinator yet** | `a restart drains what it has not seen and never delivers twice`: a fact is recorded and left unhandled (the crash window), then two more independent boots over the same file database — the second drains it and delivers 1 wake, a second drain returns 0, and a third boot re-handles the stored fact after the recording waker's own `delivered` set is **cleared**, so nothing but the log can stop a second delivery: the reviewer is still woken once, the total stays 1 and there is 1 `coordination.wake` row. That the test is the log's doing and not the waker's memory is shown by `2026-10-17-stage2-red-run.txt`: with `if (recorded) return` disabled the same test fails with `Expected length: 1, Received length: 2`, and the file is restored byte-identically (same sha256 before and after). The renderer plays no part by design: the coordinator is core-side |
| replaying the same event twice -> 1 task | PASS | `a replayed task.created makes one task`: the task id is derived from the idempotency key (`"task_" + fingerprint(...)`), so the same occurrence asks for the same id and `createTask` is skipped when it is already there; three emits (two identical, one re-keyed to the same key) leave exactly one task with that title |
| an ack-loop fixture cannot loop | PASS | the ack test above; structurally, `OUTCOMES` are `coordination.wake`, `coordination.attention`, `coordination.closed` and `ack`, and `decide` returns `[]` for all of them |
| a terminal task produces zero wakes | PASS | the terminal test above |
| new failing-test evidence reopens T as revision 2 | PASS | the reopen test above; the same finding replayed does not reopen it again |

**Deviations and decisions worth carrying forward.**

- Branch base is the Stage 1 tip (above).
- The pure `fold` does not brand the target: a payload names a bot by slug, and `BotID` requires a `bot` prefix, so branding a
  slug there would throw. The fold keeps `openerRef`/`targetRef` as strings and the coordinator resolves them against the bots
  it can read; `decide` receives the resolved `BotID`. A target that resolves to nobody records one
  `attention:missing-target:<ref>` instead of dropping the message silently.
- The no-progress fingerprint deliberately leaves the event type out. The first message of a thread that repeats the opening
  question verbatim is the same information, not new information.
- `drain()` returns the number of events it replayed, which includes the coordinator's own outcome rows appended during that
  pass — so the first drain after a record-but-not-handled fact reports 2 (the fact, then the wake it wrote), and the next
  reports 0. The count is "events seen", not "wakes delivered".
- `mission_event` has no foreign keys and the `payload` column is JSON text typed to the event schema; both follow from history
  outliving what it refers to.

**Limitations, stated plainly.**

- The production waker (`SessionInbox.admit`) is compiled and typechecked but **not covered by a test**: every test replaces
  `Coordinator.wakerNode` with a recording waker. What is proven is the coordinator's side of exactly-once; that a real inbox
  row reaches a real bot session is Stage 3's job, together with the trigger.
- Decision and task ids derived from a content fingerprint use 32-bit FNV-1a (`coordination.ts`). Two different events with the
  same visible content would collapse into one id, and a hash collision would do the same silently. The dedupe keys are scoped by
  event kind and correlation, the full id is stored on the row, and nothing depends on the hash being collision-resistant for
  correctness of delivery — but the risk is real and is stated rather than papered over. Moving to a wider hash is a one-line
  change if it ever matters.
- Nothing in the app calls `Coordinator.drain` yet. No timer, no hook from the session event bus, no UI: the coordinator is a
  node that exists and is tested, not a running part of the app. Stage 3 wires the trigger and the cards.
- The dev copy has the two new tables and the migration recorded, with **0 rows in `mission_event`** (gates §8: `session_v2`,
  `session_message`, `project`, `migration`, `bot` 13, `team` 1, `mission` 1, `task` 0, `mission_event` 0,
  `mission_coordinator_cursor` 0) because nothing in the running app emits yet. That is the honest state, not a failure.
- The dev copy is **live**: the running DEV app writes its own sessions into `opencode-aporia-dev.db` (its newest rows are this
  morning's own bot and verifier sessions), so its session counts move between runs. Two figures appear here anyway, both because
  the file that stores them is stored too and reads them back: the pre-migration backup recorded 693 sessions / 70,693 messages
  (backup evidence file), and the gates §8 snapshot recorded its own pair in its own run. No session count is asserted for the
  live copy from memory. The domain counts are what the claims rest on and they are stable (13 bots / 1 team / 1 mission,
  `task` 0, `mission_event` 0, migration 52, `integrity_check` ok).
- `switch-dev-to-isolated.cmd` rebuilds the dev copy from prod, so a later switch replaces this copy with an unmigrated one; the
  first app start then applies both migrations and `script/mission-backfill.ts` has to run again, exactly as Stage 1 says.

Rollback: a local checkpoint tag `an/checkpoint-pre-stage3` sits at `032825e677`, the commit this section was closed on, so
`git switch -c <name> an/checkpoint-pre-stage3` returns to a known-good Stage 2 tree without touching the branch. The tag is
local, like `an/checkpoint-pre-stage1`: `git ls-remote --tags origin "refs/tags/an/*"` is empty at exit 0, so nothing about it
left this machine. The commit that records it sits one commit later, by construction. To undo the code instead,
`git revert df5054e918 849840bb55 96ee966d94 285d02fa91 07a85dfafc` (newest first). The migration file and both
generated registries (`migration.gen.ts`, `schema.gen.ts`, `schema.json`) go with `07a85dfafc`. For data,
`opencode-aporia-dev.db.bak-stage2` is the pre-stage copy, counted read-only in `2026-10-17-stage2-backup.txt`:
**1,221,545,984 bytes** (1.14 GiB), sha256 `fd19bd5c…9bf0ba9`, `integrity_check` `ok`, journal mode `delete`, 693 `session_v2`,
70,693 `session_message`, 38 `project`, 51 `migration`, **33 tables** in that copy. The count reconciles with the dev copy's 36:
the migration adds `mission_event` and `mission_coordinator_cursor`, and `mission_event`'s `AUTOINCREMENT` adds SQLite's own
`sqlite_sequence` (33 + 3 = 36, and both lists are stored — the backup file lists the 33, gates §8 lists the 36). All 8 of the
Stage 1 domain tables are in the backup; `mission_event` and `mission_coordinator_cursor` do not exist yet and the Stage 2
migration is not recorded. That file also records the command that made the backup and stores the sha256 and the full text of
the script, which lives outside the repo at `C:\Users\Dilla\Aporia\bots\aporetic-dev\work\backup-stage1.ts`; the text is in the
evidence because the script is not committed here. The file is the only stand-alone copy — `dir /b` with a wildcard beside it
shows no `-wal` or `-shm`.

### Stage 3 — coordinator trigger, durable attention cards, attention UI — branch `an/stage-3-coordinator` — CLOSED on an independent PASS

**Stage 3 is closed.**
- The first independent verifier pass FAILED at `7d8c33e3ef`, with one HIGH and four LOW findings.
- The fixes are committed below.
- The second independent pass PASSED at `bb6e1228c4` on all of S3-1 to S3-8.
- `an/checkpoint-stage3-done` is cut locally at `bb6e1228c4` and is not pushed.

Branch cut from the Stage 2 tip `e922ab3972`. The plan and acceptance criteria S3-1 to S3-8 were committed first
(`docs/an-rewrite/STAGE3-PLAN.md`). The commit list is read from `git log e922ab3972..an/stage-3-coordinator`. The code
commits are `3510b5d9d3` (restart tests open fresh layers), `7ce7696fb5` (trigger and cards), `ed8b7f3c8c` (server routes and
the regenerated client), `f99160a93e` (attention UI) and `45bfcbc516` (a null drain time and a poll guard found in the Dev
check). After the first independent pass come `a1927ea9c4` (the Dev sidecar binds 127.0.0.1, not 0.0.0.0, approved by Ali),
`0e50f1afc3` (the HIGH backlog fix, plus the trigger's short error and its interrupt guard) and `f7299f4a15` (the bounded
resolution note and the stale-poll fix). The documentation and evidence commits follow them. Nothing pushed, nothing merged,
nothing packaged, nothing installed.

Local tags:
- `an/checkpoint-stage3-pre-dev` at `f99160a93e`, taken before the Dev check.
- `an/checkpoint-stage3-selfcheck` at `7d8c33e3ef`, the tree the self-check passed. It was first cut as
  `an/checkpoint-stage3-done`; that name was deleted locally because only an independent pass may use it. Neither tag was
  ever pushed.
- `an/checkpoint-stage3-pre-fix` at `a1927ea9c4`, the rollback point for the fixes.
- `an/checkpoint-stage3-done` at `bb6e1228c4`, cut after the independent PASS.

**What it does.**

- `CoordinatorTrigger` (core, `mission/trigger.ts`) runs inside the server process. It drains once at boot, which is
  the crash recovery. After that it checks every 2 s and drains only when the log's highest seq is ahead of the
  cursor. A failing drain is logged and kept in `status.lastError`, and the next tick retries it. The loop never dies.
- `AttentionCards` (core, `mission/cards.ts`). A card is a `coordination.attention` event, and resolving it appends
  one `attention.resolved` event (actor `user`, key `resolve:<card id>`). Card state is a pure fold over the log, so
  there is no new table and no migration. `attention.resolved` is an outcome, so resolving a card wakes nobody.
  Resolving an unknown card is an error (HTTP 404). Resolving an already-resolved card returns it unchanged.
- Three global routes sit behind the server's normal authorization: `GET /api/mission/attention`,
  `POST /api/mission/attention/:cardID/resolve` and `POST /api/mission/coordinator/drain`. They are in the protocol,
  `openapi.json` and the generated clients.
- In the app, the top bar has a flag button with an amber count badge. Its panel ("Needs your attention") shows each
  card's title, age, body and mission, a Resolve button, and one line of coordinator status. The panel polls every
  5 s, one request at a time.

**Evidence.** `docs/an-rewrite/evidence/2026-10-17-stage3-gates.txt` stores every run at `45bfcbc516`:

| check | result |
| - | - |
| `coordination.test.ts` | 13 pass, 126 expects |
| `mission.test.ts` | 9 pass, 62 expects |
| new `attention.test.ts` | 6 pass, 37 expects |
| server `mission.test.ts` | 1 pass, 8 expects |
| server full suite | 78 pass, 0 fail |
| app `src/aporia` | 57 pass (54 earlier + 3 new) |
| desktop `src/main/aporia` | 62 pass |
| core and server typecheck | exit 0 |
| app and desktop typecheck | only the 2 pre-existing `custom-elements.d.ts` TS1128 errors |
| client `check:generated` | clean |

The protocol `check:generated` exits 1. That is line endings only: §14 of the gates file shows that the regenerated
`openapi.json` has no content difference under `git diff`. The Dev check (§16, screenshots 01–11 on the box under
`/workspace/aporetic/stage3/`) used `opencode-aporia-dev.db` only, with `.bak-stage3` taken first:
- a fact written by another process became a card 1.7 s later;
- an open card survived a restart, was resolved with a click, and stayed resolved after another restart;
- a fact written while the app was closed became a card from the boot drain.

**A test-harness finding.** Inside `it.effect`, an inner `Effect.provide(layer)` is memoised against the test's own
layer. So a "second boot" reused the first boot's services and the in-memory database. Every restart boot now uses
`Effect.provide(layer, { local: true })`, including the three in each of the Stage 1 and Stage 2 restart tests, which
still pass. The earlier restart tests were not wrong in their asserts, but they did not reopen the file as intended.

**Limitations, stated plainly.**

- The production waker is still untested against a real session. The Dev check used `approval.required`, which only
  raises a card.
- Nothing in the app's session loop emits facts yet, so cards only appear for facts written by something.
- Two Dev cards (seq 3 and 6 in the gates file) were resolved through the API as `user` by something other than this
  run. It was most likely a person at the Dev app. That is UNKNOWN. The resolve route does not take a name, so every
  resolution over HTTP is recorded as `user`.
- Dev card seq 11 was later resolved through the API as `user` (06:54:48 CT) by someone other than this run. After the
  fixes, Dev card #6 (seq 16) is left open on purpose.
- The Electron sidecar on 3084 used to bind `0.0.0.0`, which was pre-existing. It binds `127.0.0.1` since `a1927ea9c4`.
- An orphan CLI background service (pid 41844, `packages/cli … serve --service`, recorded in
  `~/.local/state/opencode/service-local.json`) has run older worktree code on 127.0.0.1:49375 since Oct 16 5:59 PM CT.
  It is left running.
- `switch-dev-to-isolated.cmd` was not run, because it rebuilds the dev copy from prod.

Rollback: `git switch -c <name> an/checkpoint-pre-stage3` (or `e922ab3972`). There is no migration. The extra rows in
the dev copy are inert to Stage 2 code, and `.bak-stage3` is the pre-check copy.

### Flow engine stage 1 (F1) — branch `an/flow-stage-1` — CLOSED on an independent PASS at re-verify (done tag `an/checkpoint-flow1-done` = `2a9c5b47ca`, cut by the orchestrator)

**Re-fix (latest).** The independent verifier failed `54cdbd55e6`: H1 (two runners on one DB repeat an in-flight step and
raise false cards), M1 (Host header override), M2 (userinfo in the url), M3 (lock held across HTTP), plus LOWs.
Pre-fix tag `an/checkpoint-flow1-pre-fix` = `54cdbd55e6`. Fix commit `8007ecff2c`, which covers all four findings and
the cheap LOWs; the table is in `FLOW1-PLAN.md`. **Changed decision:** the runner lease needed one additive table
(`flow_runner_lease`, migration `20261017144410_flow1_runner_lease`), so "no migration" no longer holds for F1. Run
data is still only in `mission_event`. Gates at `8007ecff2c` are recorded in the evidence file (section "Re-fix"):
- coordination / mission / attention: 13 / 9 / 9 pass
- flow-unit: 22 pass. flow: 29 pass, including 11 new tests; 10 of those fail on the old engine, which reproduces the
  findings.
- core and server typecheck: exit 0. Core migration check: exit 0.
- server route tests: 2 pass. Server full suite: 79 pass, 0 fail on the re-run. The first run had 3 OAuth port-1455
  TIME_WAIT failures.
- protocol and client `check:generated`: exit 0. The first protocol run failed on CRLF in the working copy only, with
  no content change.
- app tests: 63 pass. Desktop tests: 62 pass. App and desktop typecheck: only the 2 pre-existing TS1128 errors.
- core full suite: 5363 pass / 159 fail out of 6743. No new failing test. The failures come from 13 of the 15 known
  environment-bound files.
The Dev check was not re-run.

Branch cut from the Stage 3 tip `3666b13b38` (rollback tag `an/checkpoint-pre-flow1`). The plan, criteria F1-1 to F1-12 and
the provisional decisions are in `docs/an-rewrite/FLOW1-PLAN.md` (committed first, `92bc33d7f2`). Code commits:
`4f3775f2ff` (core engine and tests), `7c597c5839` (server.flow routes, regenerated openapi and clients, additive only),
`722d11eb08` (app Flows section and slash commands), `c8ec97edb7` (app fix found in the Dev check: the generated client
unwraps `{ data }`), `72f71d551a` (extra tests: HTTP size cap, timeout, refused connection, repeated step id). No done tag
is cut; only an independent pass may cut one. Nothing pushed (`git ls-remote` for `an/*` is empty), nothing merged, nothing
packaged, nothing installed.

**Provisional decisions (Ali can overturn any):** flows live in `mission_event` as `flow.*` types (definitions are
`flow.saved` events, one per version), so there is no migration; no visual editor, only an "Add flow from JSON" box; no
n8n workflow ported; the runner is its own loop on the trigger's pattern (boot pass + 1 s poll) because waits and retries
need time-based wake-ups; HTTP hosts must be declared exactly (pulled forward from F2), no redirects, no credential
headers.

**What it does.**
- Core `src/flow/`: definition validation and canonical versions; a path-and-condition expression language with no
  JavaScript; pure steps `set`, `transform`, `if`, `switch`, `merge`; `wait`, `http`, `run-flow` (depth limit 5) carried
  out by the runner; a run is folded from its own `flow.*` events and planned one action at a time.
- Crash window: a pure or idempotent step that was started without a result is run again as attempt n+1; an unsafe step
  (POST/PUT/PATCH/DELETE not declared idempotent) raises one `coordination.attention` card, and only the resolution
  `run-again` repeats it; any other resolution fails the run.
- `flow.*` are coordinator outcomes: a flow never wakes a bot. Every step records `tokens: 0`.
- Server: `GET/POST /api/flow`, `GET /api/flow/:flowID`, `POST /api/flow/:flowID/run` (idempotent per `requestId`),
  `GET /api/flow-runs`, `GET /api/flow-runs/:runID`; 400 for an invalid definition or request id, 404 for an unknown
  flow or run, 401 without the password.
- App: native Flows section at the top of the Flows tab (list, Run, recent runs, step timeline, add from JSON); the n8n
  section below is unchanged. `/<flow id> [input]` in the composer runs the flow client-side with no model call; input is
  a JSON object or `{ text }`.

**Evidence.** `docs/an-rewrite/evidence/2026-10-17-flow1-gates.txt`, gates at `c8ec97edb7`:

| check | result |
| - | - |
| coordination / mission / attention | 13 / 9 / 9 pass |
| new `flow-unit.test.ts` / `flow.test.ts` | 17 / 17 pass (35 total after `72f71d551a`: 17 / 18) |
| core and server typecheck | exit 0 |
| server `mission.test.ts` + new `flow.test.ts` | 2 pass |
| protocol and client `check:generated` | exit 0 |
| app `src/aporia` | 63 pass (59 + 4 new) |
| desktop `src/main/aporia` | 62 pass |
| app and desktop typecheck | only the 2 pre-existing TS1128 errors |
| server full suite | 79 pass, 0 fail |
| core full suite | 5345 pass, 161 fail; the same 15 files fail the same way at the baseline `3666b13b38` (160 fail there, 159 at HEAD), all environment-bound (real bash, home/XDG, npm, daemons) and none touches `src/flow` |

Dev check (screenshots `/workspace/aporetic/flow1/00`–`09` on the box; `opencode-aporia-dev.db` only; a loopback test
server on 127.0.0.1:48123): a flow added through the JSON box; Run gives a 5-step timeline (set → http → if → transform →
merge) with 0 tokens; `/five {"who":"ali"}` in the composer started one run with a toast and sent no message; a flow
waiting on a 25 s `wait` survived a full Dev restart and finished on the new process, every step started once.

**Limitations, stated plainly.**
- The unsafe-step card is proven in core tests (a real POST cut off mid-request, server hit counts), not in the Dev app.
- A flow whose id equals an existing slash command is shadowed by whichever command is listed first.
- The runner polls every 1 s in the server; a waiting run resumes up to ~1 s after it is due.
- No schedules, webhooks, credentials vault, AI steps, flow-as-tool, n8n importer or editor (F2–F4).

Rollback: `git switch -c <name> an/checkpoint-flow1-pre-fix` (`54cdbd55e6`, before the re-fix) or `an/checkpoint-pre-flow1`
(`3666b13b38`). Since `8007ecff2c` there is one additive migration (`flow_runner_lease`). Earlier code only applies the
migrations it knows, so an extra table and the `flow.*` rows are inert to it. This comes from reading
`DatabaseMigration.applyOnly`; it has not been tested.

## Independent verification

### Stage 3 — branch `an/stage-3-coordinator`

**Independent pass 2: VERDICT PASS, tree at `bb6e1228c4`.** The independent verifier passed all of S3-1 to S3-8 on the
fixed tree. The local tag `an/checkpoint-stage3-done` was cut at that commit afterwards. This docs commit sits on top of it.

**Independent pass 1: VERDICT FAIL, tree at `7d8c33e3ef`** (tag `an/checkpoint-stage3-selfcheck`). Findings and fixes:

- **HIGH: `Coordinator.emit` skipped older unhandled facts.** It moved the cursor to its own seq, so a fact recorded but
  not handled by another process, the boot-drain race, or a card resolve during a backlog never got its card.
  - Repro, now a test: append `ap-ext` unhandled, emit `ap-live`, drain. Before the fix only `ap-live` had a card.
  - Fixed in `0e50f1afc3`. Inside the lock, emit drains the backlog first. After handling, it advances the cursor only
    when nothing unhandled sits between the cursor and its own row. Otherwise the next drain replays the gap, which is
    safe because every effect is keyed.
  - Two regression tests were written first and seen failing: the verifier's case, and resolve-during-backlog
    (`2026-10-17-stage3-gates-after-pass1.txt`, RED RUN).
- **LOW: `lastError` returned `Cause.pretty`**, the full stack with paths, to clients.
  - It now returns `Drain failed (<kind>); details are in the server log`. The full cause is logged on the server only.
  - The test asserts there is no message and no stack.
- **LOW: the resolution note was unbounded.**
  - The protocol now caps it at 2000 characters. `openapi.json` gains `maxLength`; the generated client code is unchanged.
  - The server test asserts that 2000 characters reach the handler (404 for an unknown card) and 2001 get a 400.
- **LOW: a poll in flight during a resolve could bring the resolved card back.**
  - `makeRefresher` (app) drops any answer from a request that left before an `invalidate()` and runs one fresh request
    after it. The resolve invalidates both before and after its call.
  - Two unit tests cover it.
- **Shutdown check:** the trigger's `catchCause` now passes interruption through explicitly (`Cause.hasInterrupts`).
  - A test interrupts a drain that hangs forever and asserts it is not recorded as a failed drain.
  - Honest note: that test also passes against the old code. Effect 4.0.1 does not hand an external interruption to
    `catchCause`, so the guard is belt-and-braces, not a red-then-green fix.

Gates after the fixes, at `f7299f4a15` (`2026-10-17-stage3-gates-after-pass1.txt`):

| check | result |
| - | - |
| coordination | 13 pass, 126 expects |
| mission | 9 pass |
| attention | 9 pass, 49 expects |
| server route | 1 pass, 10 expects |
| server full suite | 78 pass, 0 fail when run alone. A run that overlapped a Dev restart had 3 OAuth callback-port timing failures. |
| app `src/aporia` | 59 pass |
| desktop `src/main/aporia` | 62 pass |
| core and server typecheck | 0 |
| app and desktop typecheck | only the 2 pre-existing TS1128 errors |
| protocol and client `check:generated` | exit 0 |

Dev check after the fixes (screenshots 13 and 14): two facts written by another process became two cards within 0.2 s.
One was resolved by a click. After a restart the other is still open and the resolved one stays resolved.

**Self-check (not independent): VERDICT PASS, tree at `7d8c33e3ef`.** It missed the HIGH finding above. This pass was a fresh read of
`git diff e922ab3972..HEAD`, checked against S3-1 to S3-8 and the stored gates. It was run by the same executor that
wrote the code, not by a separate verifier agent, so it is labelled that way.

| criterion | result |
| - | - |
| S3-1 trigger | PASS. Boot tick from `Effect.repeat`. Gate on `latest > cursor`. `catchCause` keeps the loop alive. Three core tests plus the Dev 1.7 s and boot-drain rows. |
| S3-2 durable cards | PASS. A fold over the log, no table, no migration. A three-boot file-DB test. The Dev restarts. |
| S3-3 idempotent and inert | PASS. A second resolve leaves one `attention.resolved`, with 0 wakes and 0 new attention. Unknown card gives a tagged error in core and 404 over HTTP. |
| S3-4 one approval, one card | PASS. The same approval under two keys gives one card. |
| S3-5 HTTP surface | PASS. Three routes, the handler, the client regenerated and `check:generated` clean. The protocol check's exit 1 is line endings only (gates §14). |
| S3-6 UI | PASS. Screenshots 02, 03, 08, 09, 10, 11. |
| S3-7 no regressions | PASS. Gates §1–§13. |
| S3-8 hygiene | PASS at commit time. The secret/PII scan was run on each staged diff. `git ls-remote` for `an/*` heads and tags is empty. |

Notes that did not fail a criterion:
- `resolve` reads and then emits. Two concurrent resolves are safe only because the key is the same.
- The UI component types the SDK as `any`.


### Stage 2 — branch `an/stage-2-event-store`

**Pass 1 — VERDICT FAIL, tree at `2abfc71bf5`** (the three feature commits with the first docs commit at the tip). Its report
is stored in `docs/an-rewrite/evidence/2026-10-17-stage2-verifier-passes.md`. What it found, and what was done:

- **Two real code defects.** `MissionEvents.append` looked the idempotency key up *outside* the transaction and its lost-race
  path returned `inserted: true` for another writer's row, contradicting its own interface doc; and the coordinator's
  "never delivers twice" rested on the test waker's in-process set rather than on anything durable. Fixed in `849840bb55`:
  the lookup, the insert and the read-back are one transaction and `inserted` is true only for the row that call created; the
  coordinator now reads the correlation's recorded `wake:<event id>:<bot>:<purpose>` key from the log and returns before it
  wakes anyone, so a replay in a fresh process is a no-op with no memory of the earlier one.
- **Three tests the rule table claimed and did not have**: `review.passed` wakes the verifier and nobody else; an event with
  nobody in that role raises one attention instead of silence; a granted approval resumes the owner exactly once. Added in
  `df5054e918` (13 tests, 126 `expect()` calls).
- **Documentation.** `.bak-stage2` figures that no stored file contained (now counted read-only in
  `2026-10-17-stage2-backup.txt`, which also stores the backup script's sha256 and text because the script is outside the
  repo); "all four typechecks" where the gates file stores three runs (core, app, desktop); a no-progress sentence that put
  the escalation one message early (it is three repeats after the opener); and the push evidence, which now records each
  command line with its output and exit code at `df5054e918`.

**Pass 2 — VERDICT FAIL, tree at `86e11bca69`.** Recorded in the same passes file. Six findings, all fixed:

- a test-count claim for `96ee966d94` that no stored run contains (the row now says no run of that commit is stored and points
  at the tip's run);
- the third-boot claim was not observable: the recording waker's `delivered` set is process-wide, so it refused the replay
  whether or not the coordinator's log check ran. The test now **clears that set before the third boot** and reads the wake
  rows after the handle, and `2026-10-17-stage2-red-run.txt` shows the test failing (`Received length: 2`) with the log check
  disabled and the file restored byte-identically;
- "8 of the 10 Stage 1 domain tables" mislabelled the counter (Stage 1 defined 8, all present; the `8/10` counts the two Stage 2
  tables as absent) — rewritten;
- the table counts did not reconcile (33 + 2 ≠ 36): the missing third table is SQLite's `sqlite_sequence`, created by
  `mission_event`'s `AUTOINCREMENT`. Both lists are now stored (the backup's 33, gates §8's 36) and the arithmetic is written
  out;
- the gates file was generated on a dirty docs tree and its `git log` cut off `07a85dfafc` — the script now logs 20 commits and
  states in its own output that the evidence files it writes appear as modified because they are committed after it;
- the backup evidence gave no invocation, labelled its `dir` timestamp as if it were UTC, and headed a section "read-only" when
  the script that *made* the backup opened the source read-write to checkpoint the WAL. All three corrected, and the file now
  proves the copy stands alone (33 tables, no `-wal`/`-shm` beside it).

**Pass 3 — VERDICT FAIL, tree at `a77ac8747c`.** Four stale citations, no code fault: a session count quoted from the wrong
run (the dev copy is live, so it moves between runs — the docs now quote it from the file instead of repeating it), the branch
log and the gates run cited at `86e11bca69` when both record `71bcc139cb`, and a commit list missing `225781f019` and
`71bcc139cb`. It confirmed from the files that the red run is consistent with the test as written (with `delivered` cleared and
`deliveries` kept, only the log check can stop the second delivery, and the recorded failure is the line it names with
`Received length: 2`), that the table arithmetic holds against both lists, that the backup's invocation, timezone label and
stand-alone listing are present, and that nothing is pushed.

**Pass 4 — VERDICT FAIL, tree at `3901d73d03`.** Four citation faults, no code or test fault: the row-3 commit list stopped at
`df5054e918`; the STATUS commit sentence had dropped `2abfc71bf5` and `86e11bca69` while claiming only the final docs commit
could be missing from the log; the sentence that said session counts are read rather than quoted quoted `693 / 70,693` in the
same breath (those are the backup's own stored numbers, and the text now says so); and a "Pass 4 — recorded here after it ran"
placeholder was itself an unevidenced claim. It confirmed the eleven rule rows and five acceptance rows all map to printed
tests, the red run fails with `Received length: 2` and restores byte-identically, the backup's size and sha256 match, and
nothing is pushed. It also reported one thing it could not check: "code unchanged between `a77ac8747c` and `3901d73d03`" rested
on a commit subject, with no file-level diff readable to it. That gap is answered by
`2026-10-17-stage2-code-diff.txt`, which prints the git **tree hash of `packages/`** at `a77ac8747c` and at the tip, plus
`git diff --name-only` over that range. Equal tree hashes settle the question at any later tip, including one newer than the
file, because the comparison is one line a reader can re-run; that is why the tree hash is there and a prose list is not.

**Pass 5 — VERDICT FAIL, tree at `3c7d13e7ed`.** No code or test objection. It found a problem this section had created for
itself: passes 3, 4 and 5 each failed on a prose commit list that went stale every time it was written, so the list is now
`git log`, not prose; the branch-log snapshot's own HEAD (`71bcc139cb`) is stated so nobody reads it as current; the passes file
stopped promising a future record and gained a "how these records are kept" paragraph; and the code-diff evidence was replaced
with the `packages/` tree hash, which a reader can re-run at any later tip. It also noted the two records did not agree —
STATUS ended at Pass 4 while the passes file already had Pass 5 — which the note below now covers.

**A note on how this section is written.** A pass's record is written by the commit that fixes what it found, so no record can
describe the commit that contains it, and the newest record in this section names the same pass and the same tree as the newest
block in `2026-10-17-stage2-verifier-passes.md`. Where they ever disagree, the stored verifier text is the one to trust. The
record added after the final pass is a docs-only commit and is not itself re-verified, as on Stage 1.

**Pass 8 — VERDICT PASS, tree at `bceeb3b841`.** It checked the two wording fixes against the stored reports, then went over the
stage as a stage: `event.ts`, `coordination.ts`, `coordinator.ts`, `service.ts`, the migration, the 13-test file, the acceptance
table and the standing gates. Its non-blocking observations, all now addressed or disclosed: the gates script said the evidence
files appear "modified or untracked" when two show as deleted (script wording fixed and the run regenerated); "went stale four
times" counted list artifacts where the record counts three passes (reworded); the backup timestamp is labelled with a zone name
rather than an offset, the convention Stage 0 already discloses; the fingerprint ids are 32-bit FNV-1a and a collision would
merge ids silently (now in the limitations above); the code-diff file stops at its own tip (it prints the rev-parse line to
re-run); and the production waker plus the missing trigger are both still disclosed. **Stage 2 is closed on a PASS.**

### Stage 1 — branch `an/stage-1-domain-model`

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

## Flow stage 2 backlog (LOWs from the F1 re-verify PASS; none blocks F1)

| # | finding | proposed handling |
| - | - | - |
| B1 | **Stale "may or may not have run" card after a lease stall.** If a runner stalls past its lease while an unsafe step is in flight, the next lease holder raises the card. When the stalled runner's call then returns, its late `flow.step.succeeded`/`failed` is recorded, but the card stays open. | When a result arrives for an attempt that has an open uncertain card, resolve the card automatically (a resolution like `auto: late result recorded`) and let the run continue from the recorded result. Test: lease expiry mid-POST, card raised, late success arrives, card closes, run completes, 1 hit. |
| B2 | **Rare same-process lease-check race.** `held()` is a local check and the database re-check happens only at step start. Two fibers in one process can interleave between a lease loss and the next check. | Fence each step start on the lease row in the same transaction as the `flow.step.started` insert, or carry a lease epoch on the start and refuse it when the epoch has moved. |
| B3 | **Lease timing on a crash or a clock jump.** The lease uses wall-clock `Date.now()`, so a crash leaves the lease to run out over 30 s, and a wall-clock jump can lengthen or shorten a lease. | Use a monotonic clock for the local `held()` margin. Keep wall time only for the cross-process expiry, and document the bound: worst-case takeover delay is one TTL after a crash. Consider a shorter TTL with renewal tied to the runner loop. |

## Blockers

None. Every stage attempted so far is committed and green.
