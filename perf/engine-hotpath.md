# Engine hot-path wall-clock harness (AP-ENGINE-E26)

## Goal

Measure **engine runtime** hot paths (select / due-estimate / tool snapshot / durable publish / optional SSE fanout), not the `packages/opencode` test suite.

`perf/test-suite.md` remains the suite-speed backlog. **Do not** cite `test_suite_seconds` as product runtime proof for E01/E02/E04 or later efficiency claims.

## Benchmark command

From `packages/core`:

```sh
bun run benchmark:engine-hotpath
```

Options:

```sh
bun run script/benchmark-engine-hotpath.ts --steps 40 --selects 8 --publishes 48 --sse-events 64
```

CI / unit entry (same measurements + asserts + evidence JSON):

```sh
bun test test/engine-hotpath-bench.test.ts
```

## Primary metrics

Printed as `E26_METRICS` JSON and written to board evidence when the path exists:

| Key | Meaning |
|---|---|
| `select.p50Ms` / `select.p95Ms` | Drain-scoped `SessionContext.select` wall-clock (ms) |
| `select.snapshotCalls` / `select.hits` / `select.misses` | Tool snapshot + cache counters for the drain |
| `due.cheapP50Ms` / `due.preciseP50Ms` | `estimateContextCheap` vs `estimateContext` over synthetic Loaded |
| `publish.p50Ms` / `publish.p95Ms` | Durable bus publish latency (single aggregate, sequential) |
| `sse.encodeMicros` / `sse.offerP50Ms` | Optional EventFeed encode-once + offer lag (server package) |

## Honesty rules

1. Numbers from this harness are **baseline / compare** evidence — not an automatic product PASS.
2. Mock LLM / mocked tools / file-backed SQLite: useful for relative before/after, not provider RTT.
3. E23 multi-session WAL stress remains a separate measure (`bus-multi-session-stress.test.ts`).
4. Live CDP after harness changes is EnginePort/send non-regress only — not a wall-clock claim.

## Hypothesis loop (fill when comparing)

| Change | Before | After | Decision | Notes |
|---|---|---|---|---|
| _(empty — harness lands first)_ | | | | |

## Files in scope

- `packages/core/script/benchmark-engine-hotpath.ts`
- `packages/core/script/engine-hotpath-lib.ts`
- `packages/core/test/engine-hotpath-bench.test.ts`
- Optional SSE path pulls `@opencode/server` EventFeed (devDependency / workspace)
- This doc
