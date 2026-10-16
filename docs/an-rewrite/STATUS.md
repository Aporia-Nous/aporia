# Aporetic rewrite — STATUS

Checkout: `C:\Tools\aporia\.worktrees\opt`, branch `rebrand/nousphere`. Source of truth for the order of work:
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

### Stage 0a — DEV isolation — database split done, GUI relaunch pending

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

**Not done, and not doable from inside this session:** the 5-minute DEV run — launch it, send one chat, watch the dev DB
move while the installed app is idle. The running DEV instance *is* the app hosting this session, so relaunching it ends
this conversation; that restart is Ali's call, not a step to take unilaterally. Until it happens DEV still writes to the
prod DB, measured above. The wiring, the copy, the launcher and the write path are done and verified without it.

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

Re-run any of them: `bun work/run-and-log.ts <outfile> <cwd> <command…>` and `bun work/db-wiring-proof.ts <outfile>`
(the scripts live in `C:\Users\Dilla\Aporia\bots\aporetic-dev\work`, outside the repo, and only ever open a database
read-only).


## Independent verification

`verifier` subagent, read-only, against the tree at `32cbce8f72`. It read the files and quoted them; it was not permitted
to run the test command, so it compared the stored evidence files against the claims. A self-check and a verification are
not the same thing, and this is the only independent one recorded here so far.

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
