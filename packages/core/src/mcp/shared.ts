export * as McpShared from "./shared.js"

import { Context, Effect, Exit, Layer, Scope } from "effect"
import { makeGlobalNode } from "@opencode/util/effect/app-node"
import { KeyedMutex } from "../effect/keyed-mutex.js"

/**
 * A process-wide connection pool for MCP servers.
 *
 * Every bot location builds its own `Mcp` service, which used to mean every location spawned its own
 * copy of every configured MCP server. This pool lets those services share one underlying connection:
 * a location acquires a lease keyed by the server's identity and releases it when it goes away. The
 * last release closes the connection. A global node owns the leases, so they outlive any single
 * location; wiring Mcp.node to it means the whole app shares one connection set.
 */

export interface Lease<A> {
  readonly value: A
  readonly release: Effect.Effect<void>
}

export interface Interface {
  readonly acquire: <A, E, R>(input: {
    readonly key: string
    readonly build: (scope: Scope.Scope) => Effect.Effect<A, E, R>
  }) => Effect.Effect<Lease<A>, E, R>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/MCP/Shared") {}

type Entry = {
  refs: number
  readonly scope: Scope.Closeable
  readonly value: unknown
  closed: boolean
}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    // The pool's own scope outlives individual locations; each connection is forked from it and
    // closed only once the last location releases it (or the app shuts down).
    const root = yield* Effect.scope
    const entries = new Map<string, Entry>()
    const locks = KeyedMutex.makeUnsafe<string>()

    const close = (key: string, entry: Entry) =>
      Effect.suspend(() => {
        if (entry.closed) return Effect.void
        entry.closed = true
        entries.delete(key)
        return Scope.close(entry.scope, Exit.void)
      })

    const release = (key: string, entry: Entry) => {
      let released = false
      return Effect.suspend(() => {
        if (released) return Effect.void
        released = true
        entry.refs -= 1
        if (entry.refs > 0) return Effect.void
        return close(key, entry)
      })
    }

    const acquire = <A, E, R>(input: {
      readonly key: string
      readonly build: (scope: Scope.Scope) => Effect.Effect<A, E, R>
    }): Effect.Effect<Lease<A>, E, R> =>
      locks.withLock(input.key)(
        Effect.gen(function* () {
          const existing = entries.get(input.key)
          if (existing && !existing.closed) {
            existing.refs += 1
            return { value: existing.value as A, release: release(input.key, existing) }
          }
          const scope = yield* Scope.fork(root)
          const value = yield* input.build(scope).pipe(Effect.onError(() => Scope.close(scope, Exit.void)))
          const entry: Entry = { refs: 1, scope, value, closed: false }
          entries.set(input.key, entry)
          return { value, release: release(input.key, entry) }
        }),
      )

    return Service.of({ acquire })
  }),
)

export const node = makeGlobalNode({ service: Service, layer, deps: [] })
