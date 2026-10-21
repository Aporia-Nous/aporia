// The single-runner lease. Any number of processes may open the same database (the server, the CLI,
// a test), and each one builds a Flows service, but only the runner holding this lease advances runs.
// A step start records the holder's owner id and boot id, so a later runner can tell "still running
// somewhere" from "cut off by a crash": a step is treated as cut off only when its owner no longer
// holds the lease.
//
// Times here are wall-clock milliseconds (Date.now), not the Effect clock: a lease is compared across
// processes, and a test clock in one of them must not make another runner's lease look expired.
import { randomUUID } from "node:crypto"
import { and, eq, lt, or } from "drizzle-orm"
import { Effect } from "effect"
import { Database } from "../database/database.js"
import { FlowRunnerLeaseTable } from "./lease.sql.js"

/** This process. A restarted process gets a new one, so its old step starts read as cut off. */
export const BOOT = randomUUID()
export const DEFAULT_TTL_MS = 30_000
const ROW = "runner"

export interface Holder {
  readonly owner: string
  readonly boot: string
  readonly expiresAt: number
}

export interface Lease {
  readonly owner: string
  readonly boot: string
  readonly ttlMs: number
  /** Take the lease if it is free or has run out, or extend it if this runner holds it. True when held. */
  readonly acquire: Effect.Effect<boolean>
  /** Whether the last acquire still has a safe margin left (no database read). */
  readonly held: () => boolean
  /** Who holds the lease now, if anyone. */
  readonly holder: Effect.Effect<Holder | undefined>
  /** Give the lease up so another runner can take it at once (a clean shutdown). */
  readonly release: Effect.Effect<void>
}

export const make = Effect.fn("FlowLease.make")(function* (options: {
  readonly owner: string
  readonly boot?: string
  readonly ttlMs?: number
}) {
  const { db } = yield* Database.Service
  const owner = options.owner
  const boot = options.boot ?? BOOT
  const ttlMs = Math.max(50, options.ttlMs ?? DEFAULT_TTL_MS)
  // A third of the lease is kept back: past that point this runner stops starting steps until it has
  // renewed, so it never starts one in the last moments of a lease another runner may be about to take.
  const margin = Math.floor(ttlMs / 3)
  let heldUntil = 0

  const acquire = Effect.gen(function* () {
    const now = Date.now()
    const expires = now + ttlMs
    // One statement decides, so two runners cannot both see the lease as free: the update only happens
    // when this runner already holds it or it has run out. (No RETURNING: a write statement left open
    // after its first row would keep the write lock and stall every other connection on the file.)
    yield* db
      .insert(FlowRunnerLeaseTable)
      .values({ id: ROW, owner, boot, expires_at: expires, time_updated: now })
      .onConflictDoUpdate({
        target: FlowRunnerLeaseTable.id,
        set: { owner, boot, expires_at: expires, time_updated: now },
        setWhere: or(
          and(eq(FlowRunnerLeaseTable.owner, owner), eq(FlowRunnerLeaseTable.boot, boot)),
          lt(FlowRunnerLeaseTable.expires_at, now),
        ),
      })
      .run()
      .pipe(Effect.orDie)
    const row = yield* db
      .select()
      .from(FlowRunnerLeaseTable)
      .where(eq(FlowRunnerLeaseTable.id, ROW))
      .get()
      .pipe(Effect.orDie)
    const mine = row !== undefined && row.owner === owner && row.boot === boot && row.expires_at === expires
    heldUntil = mine ? expires - margin : 0
    return mine
  })

  const holder = Effect.gen(function* () {
    const row = yield* db
      .select()
      .from(FlowRunnerLeaseTable)
      .where(eq(FlowRunnerLeaseTable.id, ROW))
      .get()
      .pipe(Effect.orDie)
    if (!row || row.expires_at <= Date.now()) return undefined
    return { owner: row.owner, boot: row.boot, expiresAt: row.expires_at }
  })

  const release = Effect.gen(function* () {
    heldUntil = 0
    yield* db
      .update(FlowRunnerLeaseTable)
      .set({ expires_at: 0, time_updated: Date.now() })
      .where(
        and(
          eq(FlowRunnerLeaseTable.id, ROW),
          eq(FlowRunnerLeaseTable.owner, owner),
          eq(FlowRunnerLeaseTable.boot, boot),
        ),
      )
      .run()
      .pipe(Effect.orDie)
  })

  return { owner, boot, ttlMs, acquire, held: () => Date.now() < heldUntil, holder, release } satisfies Lease
})