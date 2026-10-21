/**
 * AP-ENGINE-E26 — CLI entry for engine hot-path wall-clock harness.
 * See ../../perf/engine-hotpath.md
 */
import { Effect, Logger } from "effect"
import { runEngineHotpath, type HotpathOptions } from "./engine-hotpath-lib.ts"

function argInt(name: string, fallback: number) {
  const idx = process.argv.indexOf(name)
  if (idx === -1) return fallback
  const value = Number(process.argv[idx + 1])
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback
}

const options: HotpathOptions = {
  steps: argInt("--steps", 20),
  selectsPerStep: argInt("--selects", 6),
  dueIters: argInt("--due-iters", 40),
  publishes: argInt("--publishes", 32),
  sseEvents: argInt("--sse-events", 48),
}

const metrics = await Effect.runPromise(
  runEngineHotpath(options).pipe(Effect.provide(Logger.layer([]))),
)

console.log("E26_METRICS", JSON.stringify(metrics))
console.log(
  [
    `select p50=${metrics.select.p50Ms}ms p95=${metrics.select.p95Ms}ms snapshotCalls=${metrics.select.snapshotCalls} hits=${metrics.select.hits} misses=${metrics.select.misses}`,
    `due cheapP50=${metrics.due.cheapP50Ms}ms preciseP50=${metrics.due.preciseP50Ms}ms tokens cheap/precise=${metrics.due.lastCheapTokens}/${metrics.due.lastPreciseTokens}`,
    `publish p50=${metrics.publish.p50Ms}ms p95=${metrics.publish.p95Ms}ms`,
    metrics.sse
      ? `sse offers=${metrics.sse.offers} encodeMicros=${metrics.sse.encodeMicros} offerP50=${metrics.sse.offerP50Ms}ms`
      : "sse skipped",
  ].join("\n"),
)
