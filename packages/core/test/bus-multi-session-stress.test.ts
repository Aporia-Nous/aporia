/**
 * AP-ENGINE-E23 — multi-session SQLite WAL stress (measure-only).
 * N sessions publish durable short turns in parallel on one file DB.
 * Asserts no busy/locked failures beyond busy_timeout; records p50/p95 publish ms.
 */
import { describe, expect } from "bun:test"
import { Effect, Exit, Layer, Schema } from "effect"
import { Bus } from "@opencode/core/bus"
import { Event } from "@opencode/schema/event"
import { Database } from "@opencode/core/database/database"
import { AppNodeBuilder } from "@opencode/core/effect/app-node-builder"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { EventSequenceTable } from "@opencode/core/event/sql"
import { Location } from "@opencode/core/location"
import { AbsolutePath } from "@opencode/core/schema"
import { Workspace } from "@opencode/core/workspace"
import { eq } from "drizzle-orm"
import path from "node:path"
import fs from "node:fs"
import { location } from "./fixture/location"
import { tmpdirScoped } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"

const SESSION_COUNT = 8
const TURNS_PER_SESSION = 24

const locationLayer = Layer.succeed(
  Location.Service,
  Location.Service.of(
    location({ directory: AbsolutePath.make("project"), workspaceID: Workspace.ID.make("wrk_e23") }),
  ),
)

const SyncMessage = Bus.durable({
  type: "test.e23.sync",
  durable: {
    version: 1,
    aggregate: "id",
  },
  schema: {
    id: Schema.String,
    text: Schema.String,
  },
})

function percentile(sorted: readonly number[], p: number) {
  if (sorted.length === 0) return 0
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[idx]!
}

const boardEvidence =
  "C:\\Users\\Dilla\\OneDrive\\Documents\\ChatGPT\\Aporia Nous\\business-control\\evidence"

const it = testEffect(Layer.empty)

describe("Bus multi-session SQLite stress (E23)", () => {
  it.live(
    "N sessions parallel durable publishes on WAL file — no busy failures; record p95",
    () =>
      Effect.gen(function* () {
        const tmp = yield* tmpdirScoped("opencode-e23-stress-")
        const dbPath = path.join(tmp.path, "e23-stress.sqlite")
        const layer = AppNodeBuilder.build(LayerNode.group([Database.node, Bus.node, Location.node]), [
          Location.node.replace(locationLayer),
          Database.node.replace(Database.configured({ path: dbPath })),
          Bus.node.replace(Bus.configured({ persist: true })),
        ])

        const metrics = yield* Effect.gen(function* () {
          const bus = yield* Bus.Service
          const { db } = yield* Database.Service

          const journalRows = yield* db.run("PRAGMA journal_mode").pipe(Effect.orDie)
          const first = Array.isArray(journalRows) ? journalRows[0] : journalRows
          const journalMode = String(
            typeof first === "object" && first !== null && "journal_mode" in first
              ? (first as { journal_mode: unknown }).journal_mode
              : first,
          ).toLowerCase()
          expect(journalMode).toBe("wal")

          const sessions = Array.from({ length: SESSION_COUNT }, () => Event.ID.create())
          const latenciesMs: number[] = []
          let busyOrLocked = 0
          let otherFailures = 0

          yield* Effect.forEach(
            sessions,
            (aggregateID) =>
              Effect.gen(function* () {
                // Per-session serialize (run-coordinator shape); cross-session concurrent.
                for (let turn = 0; turn < TURNS_PER_SESSION; turn++) {
                  const started = performance.now()
                  const exit = yield* bus
                    .publish(SyncMessage, { id: aggregateID, text: `s-${aggregateID.slice(0, 8)}-t${turn}` })
                    .pipe(Effect.exit)
                  latenciesMs.push(performance.now() - started)
                  if (Exit.isFailure(exit)) {
                    const msg = String(exit.cause)
                    if (/busy|locked/i.test(msg)) busyOrLocked++
                    else otherFailures++
                    return yield* exit
                  }
                }
              }),
            { concurrency: "unbounded" },
          )

          for (const aggregateID of sessions) {
            const row = yield* db
              .select({ seq: EventSequenceTable.seq })
              .from(EventSequenceTable)
              .where(eq(EventSequenceTable.aggregate_id, aggregateID))
              .get()
              .pipe(Effect.orDie)
            expect(row?.seq).toBe(TURNS_PER_SESSION - 1)
          }

          const sorted = [...latenciesMs].sort((a, b) => a - b)
          const result = {
            finding: "E23",
            sessions: SESSION_COUNT,
            turnsPerSession: TURNS_PER_SESSION,
            publishes: latenciesMs.length,
            journalMode,
            busyOrLocked,
            otherFailures,
            p50Ms: Number(percentile(sorted, 50).toFixed(3)),
            p95Ms: Number(percentile(sorted, 95).toFixed(3)),
            maxMs: Number((sorted[sorted.length - 1] ?? 0).toFixed(3)),
            minMs: Number((sorted[0] ?? 0).toFixed(3)),
            dbPath,
            measuredAt: new Date().toISOString(),
          }

          expect(busyOrLocked).toBe(0)
          expect(otherFailures).toBe(0)
          expect(latenciesMs.length).toBe(SESSION_COUNT * TURNS_PER_SESSION)

          console.log("E23_METRICS", JSON.stringify(result))
          try {
            fs.mkdirSync(boardEvidence, { recursive: true })
            fs.writeFileSync(
              path.join(boardEvidence, "2026-10-19-ap-engine-e23-metrics.json"),
              `${JSON.stringify(result, null, 2)}\n`,
            )
          } catch (err) {
            console.warn("E23 metrics board write failed", err)
          }

          return result
        }).pipe(Effect.provide(Layer.fresh(layer)))

        expect(metrics.p95Ms).toBeGreaterThanOrEqual(0)
        expect(metrics.publishes).toBe(SESSION_COUNT * TURNS_PER_SESSION)
      }),
    60_000,
  )
})
