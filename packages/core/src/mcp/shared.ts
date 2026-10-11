export * as McpShared from "./shared.js"

import { Context, Effect, Exit, Layer, Option, Scope } from "effect"
import { makeGlobalNode } from "@opencode/util/effect/app-node"
import { KeyedMutex } from "../effect/keyed-mutex.js"

/**
 * A process-wide connection pool for MCP servers.
 *
 * Every bot location builds its own `Mcp` service, which used to mean every location spawned its own
 * copy of every configured MCP server. This pool lets those services share one underlying connection:
 * a location acquires a handle keyed by the server's identity and releases it when it goes away. The
 * last release closes the connection. A global node owns the handles, so they outlive any single
 * location; wiring Mcp.node to it means the whole app shares one connection set.
 *
 * The value behind a handle is mutable on purpose. `reconnect` rebuilds an entry in place so every
 * holder observes the fresh connection — a session expiry belongs to the server, not to one location —
 * and callers keep using the same handle object they acquired.
 */

export interface Handle<A> {
  /** Reads the entry's current value; changes in place when the pool rebuilds the entry. */
  readonly get: () => A
  readonly release: Effect.Effect<void>
}

export interface Interface {
  readonly acquire: <A, E, R>(input: {
    readonly key: string
    readonly build: (scope: Scope.Scope) => Effect.Effect<A, E, R>
  }) => Effect.Effect<Handle<A>, E, R>
  /** Rebuild an existing entry, replacing its value for every holder. None when no entry holds the key. */
  readonly reconnect: <A, E, R>(input: {
    readonly key: string
    readonly build: (scope: Scope.Scope) => Effect.Effect<A, E, R>
    /** Skip the rebuild when the entry no longer holds this value (another reconnect already replaced it). */
    readonly matches?: (value: A) => boolean
  }) => Effect.Effect<Option.Option<Handle<A>>, E, R>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/MCP/Shared") {}

type Entry = {
  refs: number
  scope: Scope.Closeable
  readonly cell: { value: unknown }
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

    const handle = <A>(key: string, entry: Entry): Handle<A> => ({
      get: () => entry.cell.value as A,
      release: release(key, entry),
    })

    const rebuild = <A, E, R>(key: string, build: (scope: Scope.Scope) => Effect.Effect<A, E, R>) =>
      Effect.gen(function* () {
        const scope = yield* Scope.fork(root)
        const value = yield* build(scope).pipe(Effect.onError(() => Scope.close(scope, Exit.void)))
        return { scope, value }
      })

    const acquire = <A, E, R>(input: {
      readonly key: string
      readonly build: (scope: Scope.Scope) => Effect.Effect<A, E, R>
    }): Effect.Effect<Handle<A>, E, R> =>
      locks.withLock(input.key)(
        Effect.gen(function* () {
          const existing = entries.get(input.key)
          if (existing && !existing.closed) {
            existing.refs += 1
            return handle<A>(input.key, existing)
          }
          const { scope, value } = yield* rebuild(input.key, input.build)
          const entry: Entry = { refs: 1, scope, cell: { value }, closed: false }
          entries.set(input.key, entry)
          return handle<A>(input.key, entry)
        }),
      )

    const reconnect = <A, E, R>(input: {
      readonly key: string
      readonly build: (scope: Scope.Scope) => Effect.Effect<A, E, R>
      readonly matches?: (value: A) => boolean
    }): Effect.Effect<Option.Option<Handle<A>>, E, R> =>
      locks.withLock(input.key)(
        Effect.gen(function* () {
          const existing = entries.get(input.key)
          if (!existing || existing.closed) return Option.none()
          // Another reconnect (possibly from a different location) may have already replaced the
          // connection while this caller waited for the lock; rebuilding again would be a second spawn.
          if (input.matches && !input.matches(existing.cell.value as A)) return Option.none()
          // Build the replacement first, then publish it to every holder, then drop the old scope.
          // Publishing before closing keeps the old connection's close callbacks from being mistaken
          // for a live failure: callers compare against the entry's current value, which is already new.
          const { scope, value } = yield* rebuild(input.key, input.build)
          const previous = existing.scope
          existing.scope = scope
          existing.cell.value = value
          yield* Scope.close(previous, Exit.void)
          return Option.some(handle<A>(input.key, existing))
        }),
      )

    return Service.of({ acquire, reconnect })
  }),
)

export const node = makeGlobalNode({ service: Service, layer, deps: [] })
