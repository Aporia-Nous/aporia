export * as MissionEvents from "./event.js"

import { and, asc, eq, gt, sql } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"
import { makeGlobalNode } from "@opencode/util/effect/app-node"
import { Database } from "../database/database.js"
import { MissionSchema } from "./schema.js"
import { CoordinatorCursorTable, MissionEventTable } from "./event.sql.js"

type Row = typeof MissionEventTable.$inferSelect

const CURSOR_ID = "mission"

const toEvent = (row: Row): MissionSchema.MissionEvent => ({
  seq: row.seq,
  id: row.id,
  missionId: row.mission_id ?? undefined,
  taskId: row.task_id ?? undefined,
  correlationId: row.correlation_id,
  type: row.type,
  actor: row.actor,
  payload: row.payload,
  idempotencyKey: row.idempotency_key,
  createdAt: row.time_created,
})

export interface ListInput {
  readonly missionID?: MissionSchema.MissionID
  readonly taskID?: MissionSchema.TaskID
  readonly correlationID?: MissionSchema.CorrelationID
  /** Exclusive: only rows with a higher `seq`. This is how a replay resumes. */
  readonly afterSeq?: number
  readonly limit?: number
}

export interface Interface {
  /**
   * Append one fact. `inserted` is false when the idempotency key was already used, which is how a
   * retried or replayed input becomes a no-op instead of a second task or a second wake.
   */
  readonly append: (
    input: MissionSchema.AppendEventInput,
  ) => Effect.Effect<{ event: MissionSchema.MissionEvent; inserted: boolean }>
  readonly list: (input?: ListInput) => Effect.Effect<ReadonlyArray<MissionSchema.MissionEvent>>
  readonly latestSequence: Effect.Effect<number>
  /** How far the coordinator has replayed. */
  readonly cursor: Effect.Effect<number>
  /** Advance the cursor, never backwards. */
  readonly advanceCursor: (seq: number) => Effect.Effect<number>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/MissionEvents") {}

export const make = Effect.fn("MissionEvents.make")(function* () {
  const database = yield* Database.Service
  const db = database.db

  const append = Effect.fn("MissionEvents.append")(function* (input: MissionSchema.AppendEventInput) {
    // The lookup, the insert and the read-back all happen inside one transaction, so the answer to
    // "did this call create the row?" cannot be invalidated between the check and the write.
    const result = yield* db
      .transaction((tx) =>
        Effect.gen(function* () {
          const existing = yield* tx
            .select()
            .from(MissionEventTable)
            .where(eq(MissionEventTable.idempotency_key, input.idempotencyKey))
            .get()
          if (existing) return { row: existing, inserted: false }
          const inserted = yield* tx
            .insert(MissionEventTable)
            .values({
              id: input.id ?? MissionSchema.MissionEventID.create(),
              mission_id: input.missionId,
              task_id: input.taskId,
              correlation_id: input.correlationId ?? MissionSchema.CorrelationID.create(),
              type: input.type,
              actor: input.actor,
              payload: input.payload ?? {},
              idempotency_key: input.idempotencyKey,
              time_created: Date.now(),
            })
            .onConflictDoNothing()
            .returning()
            .get()
          if (inserted) return { row: inserted, inserted: true }
          // Lost a race on the same key: the other writer's row is the fact, not a second one, and
          // this call did not create it.
          const raced = yield* tx
            .select()
            .from(MissionEventTable)
            .where(eq(MissionEventTable.idempotency_key, input.idempotencyKey))
            .get()
          return raced ? { row: raced, inserted: false } : undefined
        }),
      )
      .pipe(Effect.orDie)
    if (!result) return yield* Effect.die(new Error("MissionEvents.append lost the idempotency race"))
    return { event: toEvent(result.row), inserted: result.inserted }
  })

  const list = Effect.fn("MissionEvents.list")(function* (input?: ListInput) {
    const filters = [
      input?.missionID === undefined ? undefined : eq(MissionEventTable.mission_id, input.missionID),
      input?.taskID === undefined ? undefined : eq(MissionEventTable.task_id, input.taskID),
      input?.correlationID === undefined ? undefined : eq(MissionEventTable.correlation_id, input.correlationID),
      input?.afterSeq === undefined ? undefined : gt(MissionEventTable.seq, input.afterSeq),
    ].filter((filter) => filter !== undefined)
    const ordered = db
      .select()
      .from(MissionEventTable)
      .where(filters.length === 0 ? undefined : and(...filters))
      .orderBy(asc(MissionEventTable.seq))
    const rows = yield* (input?.limit === undefined ? ordered : ordered.limit(input.limit)).pipe(Effect.orDie)
    return rows.map(toEvent)
  })

  const latestSequence = db
    .select({ seq: sql<number | null>`max(${MissionEventTable.seq})` })
    .from(MissionEventTable)
    .get()
    .pipe(
      Effect.orDie,
      Effect.map((row) => row?.seq ?? 0),
    )

  const cursor = db
    .select({ seq: CoordinatorCursorTable.seq })
    .from(CoordinatorCursorTable)
    .where(eq(CoordinatorCursorTable.id, CURSOR_ID))
    .get()
    .pipe(
      Effect.orDie,
      Effect.map((row) => row?.seq ?? 0),
    )

  const advanceCursor = Effect.fn("MissionEvents.advanceCursor")(function* (seq: number) {
    yield* db
      .insert(CoordinatorCursorTable)
      .values({ id: CURSOR_ID, seq })
      .onConflictDoUpdate({
        target: CoordinatorCursorTable.id,
        set: { seq: sql`max(${CoordinatorCursorTable.seq}, ${seq})` },
      })
      .run()
      .pipe(Effect.orDie)
    return yield* cursor
  })

  return { append, list, latestSequence, cursor, advanceCursor }
})

export const layer = Layer.effect(Service, make())

export const node = makeGlobalNode({ service: Service, layer, deps: [Database.node] })
