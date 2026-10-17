export * as CoordinatorTrigger from "./trigger.js"

import { Cause, Clock, Context, Duration, Effect, Layer, Schedule } from "effect"
import { makeGlobalNode } from "@opencode/util/effect/app-node"
import { Coordinator } from "./coordinator.js"
import { MissionEvents } from "./event.js"

// The trigger is what makes the coordinator a running part of the app instead of a tested node.
// It lives in the server process (core side), so a renderer that closes, reloads or crashes cannot
// stop it, and reopening the window cannot replay anything.
//
//   * At boot it drains once. That is the crash recovery: a fact recorded before a crash and never
//     handled is handled now, and every effect of that replay is keyed, so nobody is woken twice.
//   * Then it polls. A poll is two single-row reads (the cursor and the log's highest seq); only when
//     the log is ahead does it take the coordinator lock and drain. Facts the coordinator emits
//     itself already move the cursor, so the poll is what catches facts written by anything else
//     (another process, a script, a future flow engine run).
//   * A failing drain is logged and remembered in `status`, and the next tick tries again. The loop
//     never dies on an error, because a stopped coordinator is a silent one.

export const POLL_INTERVAL: Duration.Input = "2 seconds"

export interface Status {
  readonly running: boolean
  /** How far the coordinator has replayed. */
  readonly cursor: number
  /** The highest seq in the log. `latest - cursor` is the backlog. */
  readonly latest: number
  /** Ticks that found a backlog and drained it. */
  readonly drains: number
  /** Events the trigger handled in total (outcome rows included, like `drain`). */
  readonly handled: number
  readonly lastDrainAt?: number
  readonly lastError?: string
}

export interface Interface {
  /** Drain now if the log is ahead of the cursor; otherwise do nothing. Returns events handled. */
  readonly tick: Effect.Effect<number>
  readonly status: Effect.Effect<Status>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/MissionCoordinatorTrigger") {}

export const make = (options?: { readonly interval?: Duration.Input }) =>
  Effect.gen(function* () {
    const coordinator = yield* Coordinator.Service
    const events = yield* MissionEvents.Service
    const memory = {
      drains: 0,
      handled: 0,
      lastDrainAt: undefined as number | undefined,
      lastError: undefined as string | undefined,
    }

    const tick = Effect.gen(function* () {
      const cursor = yield* events.cursor
      const latest = yield* events.latestSequence
      if (latest <= cursor) return 0
      const handled = yield* coordinator.drain
      memory.drains++
      memory.handled += handled
      memory.lastDrainAt = yield* Clock.currentTimeMillis
      memory.lastError = undefined
      return handled
    })

    const guarded = tick.pipe(
      Effect.catchCause((cause) =>
        Effect.gen(function* () {
          memory.lastError = Cause.pretty(cause)
          yield* Effect.logError("Mission coordinator drain failed", { cause: memory.lastError })
          return 0
        }),
      ),
    )

    // `repeat` runs the first tick immediately: that is the boot drain.
    yield* guarded.pipe(Effect.repeat(Schedule.spaced(options?.interval ?? POLL_INTERVAL)), Effect.forkScoped)

    const status = Effect.gen(function* () {
      return {
        running: true,
        cursor: yield* events.cursor,
        latest: yield* events.latestSequence,
        drains: memory.drains,
        handled: memory.handled,
        lastDrainAt: memory.lastDrainAt,
        lastError: memory.lastError,
      } satisfies Status
    })

    return Service.of({ tick: guarded, status })
  })

export const layer = Layer.effect(Service, make())

export const node = makeGlobalNode({
  service: Service,
  layer,
  deps: [Coordinator.node, MissionEvents.node],
})
