# Efficiency audit harness

Phase-1 measurement harness for the slim build. It runs five throwaway fixture tasks against a
**running** server and records success, cost, tokens, wall time, model requests, tool calls, and
harness API calls per run. It does not change product code and does not start or restart a server.

Results and analysis live in `docs/efficiency-audit/phase1-results.md`; raw runs are appended to
`docs/efficiency-audit/phase1-raw.json`.

## Prerequisites

- A server on `127.0.0.1:49374` with the model provider already authenticated. The harness never
  reads a credential file; it uses `OPENCODE_PASSWORD` from the environment for HTTP basic auth.
- `bun` on PATH, since fixture checks run `bun test` and `bun run build`.

## Run

```bash
# baselines (2 reps per task)
bun run bench/efficiency-audit/run.ts --rep 2

# descending tool-cap sweep, reusing stored baselines
bun run bench/efficiency-audit/run.ts --sweep --skip-baseline

# one fixed cap across tasks
bun run bench/efficiency-audit/run.ts --skip-baseline --budget 2

# subset
bun run bench/efficiency-audit/run.ts --only "bugfix tests" --rep 1
```

Fixtures are regenerated from scratch under `%TEMP%\oc-bench\runs\<agent>-<task>-<mode><budget>-<rep>`
before every run, so each run starts from the same broken state. Old runs are deleted when reused.

## Tasks

| id          | Kind                | Check                                                        |
| ----------- | ------------------- | ------------------------------------------------------------ |
| `bugfix`    | one-file bug fix    | `bun test` passes (3 tests on `slugify`)                     |
| `multifile` | rename across files | `bun test` passes, no stale `DEFAULT_TIMEOUT_MS`, all files renamed |
| `refactor`  | dedupe a function   | `bun test` passes, `src/money.ts` exists, one `toFixed` total, both callers import it |
| `tests`     | write tests         | tests pass **and** fail when `median` is mutated              |
| `multistep` | fix a build         | `bun run build` exits 0 and writes the expected `dist/manifest.json` |

## What each run records

- `success` / `check` — the automated check, not the model's claim.
- `cost`, `tokens` — from the session record, plus any child (subagent) sessions, so delegation cannot hide spend.
- `modelRequests` — assistant messages.
- `toolCalls`, `toolCallsByName`, `toolSequence`, `repeatedToolCalls`, `skillCalls`, `subagentCalls`.
- `apiRequests` — exact count of harness HTTP requests, including the 2 s completion poll.
- `wallMs` — prompt post to idle.
- `peakTreeRSS` — server process tree RSS sampled every 3 s. On a shared live server this is **not**
  attributable to the run; treat it as context only.
- `serverLogHttpCalls` — per-request lines the server logged in the run window. The server currently
  logs none at INFO, so this stays 0 and is kept to make the gap visible.

## Caveats

- The tool-call cap is prompt text (`use at most N tool calls`). The model exceeds it in roughly a
  quarter of budget runs; the sweep measures pressure, not enforcement.
- Fixtures are intentionally small. Ratios transfer better than absolute dollars.
- Stock OpenCode comparison is not part of this harness; see the blocked-run notes in the report.
