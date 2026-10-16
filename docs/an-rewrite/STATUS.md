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
| 2 | `7e44cba2c1` | `fix(compaction): protect superseded instructions and completed work in the summary` | 252 pass / 0 fail across `session-compaction`, `session-runner`, `session-compact`, `session-provider-context`, `session-compaction-transport`; `bun run typecheck` exit 0 |

Files touched, and nothing else: `packages/core/src/session/compaction.ts`,
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

Session `ses_ec48eb578ffe74WT5yyzIHQgxT`, compaction recorded 2026-10-16 20:00:46 local, `status=completed`,
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
| dev copy | `~\.local\share\opencode\opencode-aporia-dev.db`, 1,213,816,832 bytes (1.13 GB), 691 sessions, 69,976 messages, `pragma integrity_check` = **ok** |
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

**Not done, and not doable from inside this session:** run the launcher and send one chat. The running DEV instance is
the app hosting this session, so relaunching it ends this conversation — that restart is Ali's call, not a step to
take unilaterally. Until it happens, DEV still writes to the prod DB (measured above), and the "prod untouched" half
of the acceptance check has not been demonstrated live. The wiring, the copy and the launcher are done and verified.

Also outstanding: an import-based write probe (a marked session export re-imported into the copy) fails with
`Internal Server Error` because the export reuses message ids that already exist — a primary-key conflict in the probe,
not a product bug. Neither file received partial rows (checked for both marker ids).


## Blockers

None. Every stage attempted so far is committed and green.
