/**
 * AP-ENGINE-E26 — unit entry for engine hot-path harness (measure, not product PASS).
 */
import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { runEngineHotpath } from "../script/engine-hotpath-lib"
import { testEffect } from "./lib/effect"

const it = testEffect(Layer.empty)

describe("Engine hot-path bench (E26)", () => {
  it.live(
    "select / due / publish / sse metrics — cache hits; write evidence JSON",
    () =>
      Effect.gen(function* () {
        const metrics = yield* runEngineHotpath({
          steps: 8,
          selectsPerStep: 4,
          dueIters: 12,
          publishes: 16,
          sseEvents: 24,
        })

        console.log("E26_METRICS", JSON.stringify(metrics))

        expect(metrics.finding).toBe("E26")
        expect(metrics.select.samples).toBe(8 * 4)
        // One snapshot miss per drain step when fingerprint stable.
        expect(metrics.select.snapshotCalls).toBe(metrics.steps)
        expect(metrics.select.hits).toBe(metrics.steps * (4 - 1))
        expect(metrics.select.misses).toBe(metrics.steps)
        expect(metrics.select.p50Ms).toBeGreaterThanOrEqual(0)
        expect(metrics.due.iters).toBe(12)
        expect(metrics.due.messageCount).toBe(48)
        expect(metrics.due.lastCheapTokens).toBeGreaterThan(0)
        expect(metrics.due.lastPreciseTokens).toBeGreaterThan(0)
        expect(metrics.publish.samples).toBe(16)
        expect(metrics.publish.p95Ms).toBeGreaterThanOrEqual(0)
        // SSE optional — when EventFeed loads, assert offer counts.
        if (metrics.sse) {
          expect(metrics.sse.events).toBe(24)
          expect(metrics.sse.offers).toBeGreaterThanOrEqual(24)
          expect(metrics.sse.overflowDrops).toBe(0)
        }
      }),
    60_000,
  )
})
