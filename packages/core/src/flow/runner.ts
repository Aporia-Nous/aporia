export * as FlowRunner from "./runner.js"

import { Cause, Clock, Context, Duration, Effect, Layer, Schedule } from "effect"
import { makeGlobalNode } from "@opencode/util/effect/app-node"
import { summary } from "../mission/trigger.js"
import { Flows } from "./service.js"

// Every server process (desktop, CLI, a second copy) starts this loop over its own database. When two
// share one database, the runner lease in lease.ts decides which of them advances runs; the other
// polls and does nothing until the lease is released or runs out.
//
// Runs flows inside the server process with the coordinator trigger's pattern: one pass at boot,
// which resumes every run a crash or a shutdown left open, then a cheap poll. It is its own loop
// rather than part of the trigger because a `wait` step or a retry backoff must wake up on time,
// and the trigger only fires when the log grows.

export const POLL_INTERVAL: Duration.Input = "1 second"

export interface Status {
  readonly running: boolean
  readonly ticks: number
  readonly actions: number
  readonly lastActionAt?: number
  readonly lastError?: string
}

export interface Interface {
  readonly status: Effect.Effect<Status>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/FlowRunner") {}

export const make = (options?: { readonly interval?: Duration.Input }) =>
  Effect.gen(function* () {
    const flows = yield* Flows.Service
    const memory = { ticks: 0, actions: 0, lastActionAt: undefined as number | undefined, lastError: undefined as string | undefined }

    const tick = Effect.gen(function* () {
      const actions = yield* flows.tick
      memory.ticks++
      memory.actions += actions
      if (actions > 0) memory.lastActionAt = yield* Clock.currentTimeMillis
      memory.lastError = undefined
    }).pipe(
      Effect.catchCause((cause) =>
        Effect.gen(function* () {
          if (Cause.hasInterrupts(cause)) return yield* Effect.failCause(cause)
          memory.lastError = summary(cause)
          yield* Effect.logError("Flow runner tick failed", { cause: Cause.pretty(cause) })
        }),
      ),
    )

    // Each poll starts its own tick and does not wait for it: a tick that is carrying a slow step (an
    // HTTP call can take up to a minute) must not hold back the next poll. Ticks skip a run another tick
    // is already advancing, and only the process holding the runner lease advances anything.
    yield* tick.pipe(Effect.forkChild, Effect.repeat(Schedule.spaced(options?.interval ?? POLL_INTERVAL)), Effect.forkScoped)

    const status = Effect.sync(
      (): Status => ({
        running: true,
        ticks: memory.ticks,
        actions: memory.actions,
        ...(memory.lastActionAt === undefined ? {} : { lastActionAt: memory.lastActionAt }),
        ...(memory.lastError === undefined ? {} : { lastError: memory.lastError }),
      }),
    )
    return Service.of({ status })
  })

export const layer = Layer.effect(Service, make())

export const node = makeGlobalNode({ service: Service, layer, deps: [Flows.node] })
