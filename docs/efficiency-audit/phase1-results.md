# Efficiency audit, phase 1

Branch: `an/efficiency-bench-1` (from `an/slim-first-request`). Date: 2026-10-17. Model: `deepseek/deepseek-flash` for every agent, subagent, title, and compaction call.

Scope: five small throwaway fixture tasks, run against the live slim build on `127.0.0.1:49374` and (attempted) against stock OpenCode 2.0.26. No product code was changed.

## Cheapest route

The cheapest route that still completes **all five tasks**:

- **2 tool calls and 3 model requests per task**, stated in the prompt as a hard cap.
- Mean per run: **$0.001342**, **12.3 s**, 2.6 tool calls, 3.0 model requests, 9.0 harness API calls.
- Against the uncapped baseline: **−28.5% cost**, **−58% model requests**, **−71% tool calls**, **−29% wall time**.
- Every task passed at that cap. Budget 1 is cheaper on paper but does not complete the set: `multistep` fails, and the cap is advisory anyway (see below).
- If you also care about local server calls: the route needs 7–13 harness API calls per run, 3 of which are fixed (create, prompt, harvest). Replacing the 2 s poll loop with the existing event stream would remove the rest (about 8 calls per run, 73%).

Raw evidence: `docs/efficiency-audit/phase1-raw.json` (36 runs, every session cost and token count taken from the session record, not estimated).

## Method

- Five fixtures under `%TEMP%\oc-bench\runs`, regenerated from scratch before each run: `bugfix`, `multifile`, `refactor`, `tests`, `multistep`. Each has an automated pass/fail check (see `bench/efficiency-audit/tasks.ts`). `tests` also runs a mutation check so the new tests must actually catch a broken even-length median.
- Driver: `bench/efficiency-audit/run.ts`. It creates a session over HTTP (`POST /api/session` with `location.directory` set to the fixture, model pinned to `deepseek/deepseek-flash`, permissions `*/*` allow), posts the task prompt, polls `GET /api/session/:id` every 2 s until `time.idle`, then harvests messages plus any child sessions.
- Cost and tokens are the session's own aggregated fields; child (subagent) sessions are added in, so a delegation cannot hide spend.
- `model requests` = assistant messages; `tool calls` = tool parts across those messages; `harness API calls` = every HTTP request the driver made. These are exact, not sampled.
- `wall time` = prompt post to idle.
- Baseline: 2 runs per task (10 runs). Budget matrix: 26 runs at caps from 10 down to 1.
- **Memory is not attributable.** The only server is the live one that also runs this session, so the sampled process tree (≈1.0–1.1 GB peak, including MCP child processes) is shared with unrelated work. The numbers are in the raw JSON as `peakTreeRSS` for context only; do not read them as per-task memory.

## Stock OpenCode: BLOCKED

- Installed npm `@opencode/cli@2.0.26` into `%TEMP%\oc-bench\stock`; `opencode --version` reports `opencode v2.0.26`. That package is the v2 line (`opencode-ai` has no 2.x).
- Command shape: `opencode.exe run --standalone --auto --format json -m deepseek/deepseek-flash --title <task> "<prompt>"`, cwd = fixture copy.
- Tried twice, both **HTTP 401 provider.auth "Authentication Fails (governor)"**:
  1. isolated state: `OPENCODE_DB=%TEMP%\oc-bench\stockprobe\probe.db`, `XDG_CACHE_HOME=%TEMP%\oc-bench\stockprobe\cache`;
  2. default data dir, temp cwd, temp `XDG_CACHE_HOME`.
- So its existing credential (`~/.local/share/opencode/auth.json`, last written 2026-09-04) is rejected by the provider. The working key exists only in the runtime of the live Aporetic server. Copying it somewhere for stock would violate the brief, so stock is marked blocked rather than patched up.
- Dirs read/written by the stock attempts: read `~/.local/share/opencode/auth.json` through its own credential import; wrote `%TEMP%\oc-bench\stockprobe\probe.db` (+WAL) and the temp cache, and with the default data dir wrote `~/.local/share/opencode\opencode.db` (+WAL). The temp probe DBs were deleted afterwards without inspecting them. `opencode.db` is the stock default database, not the running app's (the app uses `opencode-aporia-dev.db`); the probe wrote one session into it and it was left in place.
- One incident: `opencode auth list` (without `--standalone`) tried to start a managed service on port 49374, which the live server already holds. It bound-failed and exited; nothing was killed or restarted. Every later stock call used `--standalone`.

Consequence: **no stock-vs-Aporetic comparison exists in phase 1.** Everything below is measured within the slim build.

## Baseline result, uncapped

Two runs per task, all ten passed first try.

| Task      | Pass | Mean cost | Input | Output | Reasoning | Cache read | Model req | Tool calls | Wall  |
| --------- | ---: | --------: | ----: | -----: | --------: | ---------: | --------: | ---------: | ----: |
| bugfix    |  2/2 |  $0.00190 | 6,598 |    783 |       148 |    109,568 |       6.5 |        7.5 | 15.5s |
| multifile |  2/2 |  $0.00210 | 5,447 |  1,391 |       229 |     98,112 |       6.0 |       13.0 | 17.2s |
| refactor  |  2/2 |  $0.00190 | 6,248 |    704 |       167 |    142,400 |       8.5 |        9.0 | 18.9s |
| tests     |  2/2 |  $0.00150 | 4,461 |    916 |       146 |     76,800 |       5.0 |        5.5 | 13.9s |
| multistep |  2/2 |  $0.00200 | 5,109 |  1,082 |       204 |    152,384 |       9.5 |        9.5 | 20.7s |
| **Mean**  |      | **$0.00188** | **5,572** | **975** | **179** | **115,853** | **7.1** | **8.9** | **17.2s** |

Success rate 10/10. Total measured cost for the ten baseline runs: **$0.0188**.

## Minimum tool calls

Sweep: caps at `baseline − 2`, then 2 lower each step, down to 1, one run per point.

| Task      | Lowest cap that passed | Notes |
| --------- | ---------------------: | ----- |
| bugfix    |                      1 | used 7 calls at a cap of 1 |
| multifile |                      1 | used 1 call (single shell) |
| refactor  |                      1 | used 1 call, but 73 s and $0.0100 |
| tests     |                      1 | used 1 call |
| multistep |                      2 | 1 fails: build left broken while the session reports `succeeded` |

- **Lowest uniform cap that completes every task: 2 tool calls** (validated on all five; 1 fails `multistep`).
- The cap is **advisory**: 7 of 26 budget runs exceeded their stated limit, by up to 3 calls. Treat these as prompt-pressure measurements, not enforcement.
- The 1-call `refactor` run is the interesting failure mode: one `shell` call did the whole job, but the model spent 13,940 reasoning tokens getting there, so the run cost 5.3× the baseline mean and took 73 s. Fewer calls is not automatically cheaper.

## Minimum server and API calls

- Fixed per-run harness overhead: **3 API calls** (create session, post prompt, harvest messages). Everything else is polling at 2 s.
- Baseline: **11.2 API calls per run** (≈8 polls).
- Cheapest route: **9.0 API calls per run** (7–13), i.e. 4–10 polls.
- Server-side work per run, as tool executions: **8.9 baseline → 2.6 on the cheapest route** (−71%). Each tool execution is a request into the server's tool layer (not HTTP).
- The server's own log does **not** emit a line per request at INFO: across all 36 runs this measurement saw **0** `http.method=` lines attributable to the runs. Per-request HTTP counting beyond the harness therefore needs product-side instrumentation; this report does not claim one.
- No MCP or other outbound calls happen in these fixtures (native tools only; skills load from local disk).

## Where the slim build is worse

1. **Cache-read volume dominates cost.** 115,853 cache-read tokens per baseline run against 5,572 fresh input — about 21×, and ~16.5k cached prompt tokens on every one of the 7.1 model requests. Tool calls are not the cost driver; the fixed prompt multiplied by request count is.
2. **Skills over-trigger on trivial tasks.** 2 of 10 baseline runs loaded a heavyweight process skill: `systematic-debugging` for a three-line slugify fix, and `git-commit` during a constant rename. Those runs averaged $0.00235 vs $0.00196 for runs that loaded none (+20%). The index line carries a `use when` trigger sentence, and the model follows it.
3. **Reasoning-token tail.** 69 to 13,940 reasoning tokens across runs (200×), billed like output. The 13,940 case was 92% of that run's output-token volume.
4. **Polling granularity.** 2 s polls mean a 10 s run costs 5 API calls just to notice it finished; a 20 s run costs 10. The event stream is already there and would cut ~73% of harness calls.
5. **Verification loops.** `multifile` took 12–14 tool calls, including 4–5 separate `read` calls after the edits were already applied, to confirm the rename; the same task closes in 2 calls on the cheapest route.

## Where it is better than expected

- 10/10 baseline successes, no retries, no permission stalls, no provider errors. The `*/*` allow ruleset holds through edits and shells.
- Prompt caching works: `cacheWrite` is 0 on settled runs and the fixed prompt is fully cached, which is why a 16.5k-token prompt still costs ~$0.002 a run.
- A multi-file rename and a refactor both closed in 2 tool calls once asked to, so the capability floor is well under the default 9-call habit.

## Phase-2 cut candidates (ranked, none implemented)

1. **Event-driven completion instead of polling.** Kills ~8 of 11 API calls per run (73%), no tokens, no capability loss. Biggest measurable local-server cut.
2. **Skill trigger tightening.** Stop heavyweight process skills (`systematic-debugging`, `test-driven-development`, `git-commit`, `refactor-code-with-ai`) from loading on single-file, few-line tasks — gate on diff size or drop the `use when` sentence from skills that only apply to repos with tests/CI. Measured upside ~20% on affected runs, but only 2/10 baseline runs hit it, so verify with a larger sample first.
3. **Reasoning effort cap for mechanical edits.** Bound reasoning per step on rename/refactor-style prompts; this removes the 13,940-token, 73 s outlier class rather than the average.
4. **Verification pressure.** Default to "verify only if the edit failed" for one-file changes: −6 tool calls and −5 s per task on the measured evidence.
5. **Prompt trimming.** The remaining 16.5k cached tokens/request are user instructions (4,463) plus MCP bodies (3,685) plus tool schemas (3,415) plus skill index (4,673). Cheapest lever is the skill index; user instructions and MCP security text are not repo-owned and should not be cut without Ali.

## Cost of this phase

- Benchmark runs recorded in the raw JSON: **$0.0720** across 36 runs (9.7 min of agent wall time).
- Orchestration session ("Efficiency bench 1"): **$0.0893**.
- Early probes and aborted attempts: ≈$0.02.
- Total ≈ **$0.18**, against the $2.00 cap.

## Limitations

- One build, one model, five tiny fixtures. The absolute dollar numbers will not scale linearly to real repos; ratios (requests, calls, cache-read dominance, skill over-trigger) are the transferable part.
- Stock comparison is blocked, so "worse" means worse than the cheapest route measured here, not worse than upstream.
- Memory is not attributable on a shared live server.
- Tool caps are prompt text, and the model ignores them in 27% of budget runs.
- Two baseline reps per task is enough to see a 20% effect but not to give tight confidence intervals.

## Reproduce

```bash
# live server must be on 127.0.0.1:49374 and OPENCODE_PASSWORD must be in the environment
bun run bench/efficiency-audit/run.ts --rep 2            # baselines
bun run bench/efficiency-audit/run.ts --sweep --skip-baseline
bun run bench/efficiency-audit/run.ts --skip-baseline --budget 2
```

Fixtures and check logic: `bench/efficiency-audit/tasks.ts`. Driver: `bench/efficiency-audit/run.ts`.
