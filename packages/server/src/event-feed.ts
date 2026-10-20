export * as EventFeed from "./event-feed"

import { Bus } from "@opencode/core/bus"
import { Event } from "@opencode/schema/event"
import { isOpenCodeEvent, type OpenCodeEvent } from "@opencode/protocol/groups/event"
import { Cause, Context, Effect, Layer, Queue, Schema, Scope, Stream } from "effect"

export const SubscriberCapacity = 4_096

export class SubscriberOverflowError extends Schema.TaggedError<SubscriberOverflowError>()(
  "EventFeed.SubscriberOverflow",
  { capacity: Schema.Int },
) {}

export class EncodingError extends Schema.TaggedError<EncodingError>()("EventFeed.EncodingError", {
  eventID: Event.ID,
  eventType: Schema.String,
  cause: Schema.Defect(),
}) {}

/** Stream-terminating errors. Encoding failures are logged and skipped (E20) — they do not fail subscribers. */
export type Error = SubscriberOverflowError

export type SubscribeFilter = {
  readonly sessionID?: string
  readonly directory?: string
}

export type Metrics = {
  readonly subscribers: number
  readonly offers: number
  readonly overflowDrops: number
  readonly encodeFailures: number
  /** Cumulative encode time in microseconds (wall-clock later). */
  readonly encodeMicros: number
}

type Entry = {
  readonly queue: Queue.Queue<string, Error>
  readonly filter: SubscribeFilter | undefined
}

export interface Interface {
  readonly subscribe: (filter?: SubscribeFilter) => Effect.Effect<Stream.Stream<string, Error>, never, Scope.Scope>
  readonly metrics: Effect.Effect<Metrics>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/server/EventFeed") {}

export function frame(event: OpenCodeEvent) {
  return `data: ${JSON.stringify(event)}\n\n`
}

function sessionIDOf(event: OpenCodeEvent): string | undefined {
  const data = event.data
  if (data === null || typeof data !== "object") return undefined
  if (!("sessionID" in data)) return undefined
  const value = (data as { sessionID: unknown }).sessionID
  return typeof value === "string" ? value : undefined
}

/** Per-subscriber filter after encode-once. Global events (no location / no sessionID) always pass. */
export function matchesSubscribeFilter(event: OpenCodeEvent, filter: SubscribeFilter | undefined): boolean {
  if (!filter) return true
  const wantsSession = filter.sessionID !== undefined && filter.sessionID.length > 0
  const wantsDirectory = filter.directory !== undefined && filter.directory.length > 0
  if (!wantsSession && !wantsDirectory) return true

  const eventDirectory = event.location?.directory
  const eventSessionID = sessionIDOf(event)

  if (wantsDirectory && eventDirectory !== undefined && eventDirectory !== filter.directory) return false
  if (wantsSession && eventSessionID !== undefined && eventSessionID !== filter.sessionID) return false
  return true
}

export const make = Effect.fn("EventFeed.make")(function* (
  observe: (subscriber: Bus.Subscriber) => Effect.Effect<Bus.Unsubscribe>,
  options?: { readonly capacity?: number; readonly encode?: (event: OpenCodeEvent) => string },
) {
  const capacity = options?.capacity ?? SubscriberCapacity
  const render = options?.encode ?? frame
  const subscribers = new Set<Entry>()
  let offers = 0
  let overflowDrops = 0
  let encodeFailures = 0
  let encodeMicros = 0

  const snapshot = (): Metrics => ({
    subscribers: subscribers.size,
    offers,
    overflowDrops,
    encodeFailures,
    encodeMicros,
  })

  const publish = Effect.fnUntraced(function* (event: Event.Payload) {
    if (!isOpenCodeEvent(event)) return
    if (subscribers.size === 0) return

    const started = performance.now()
    const encoded = yield* Effect.try({
      try: () => render(event),
      catch: (cause) => new EncodingError({ eventID: event.id, eventType: event.type, cause }),
    }).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          encodeMicros += Math.max(0, (performance.now() - started) * 1000)
        }),
      ),
      Effect.catch((error) =>
        Effect.sync(() => {
          encodeMicros += Math.max(0, (performance.now() - started) * 1000)
          encodeFailures += 1
        }).pipe(
          Effect.andThen(
            Effect.logError("Failed to encode public event; skipping frame (subscribers kept)", {
              eventID: error.eventID,
              eventType: error.eventType,
              cause: error.cause,
            }),
          ),
          Effect.as(undefined),
        ),
      ),
    )
    if (encoded === undefined) return

    offers += 1
    for (const entry of subscribers) {
      if (!matchesSubscribeFilter(event, entry.filter)) continue
      if (Queue.offerUnsafe(entry.queue, encoded)) continue
      subscribers.delete(entry)
      overflowDrops += 1
      Queue.failCauseUnsafe(entry.queue, Cause.fail(new SubscriberOverflowError({ capacity })))
    }
  })

  const unsubscribe = yield* observe(publish)
  yield* Effect.addFinalizer(() => unsubscribe)

  return Service.of({
    subscribe: (filter) =>
      Effect.acquireRelease(
        Queue.dropping<string, Error>(capacity).pipe(
          Effect.tap((queue) =>
            Effect.sync(() => {
              subscribers.add({ queue, filter })
            }),
          ),
        ),
        (queue) =>
          Effect.sync(() => {
            for (const entry of subscribers) {
              if (entry.queue === queue) {
                subscribers.delete(entry)
                break
              }
            }
          }).pipe(Effect.andThen(Queue.shutdown(queue)), Effect.asVoid),
      ).pipe(Effect.map(Stream.fromQueue)),
    metrics: Effect.sync(snapshot),
  })
})

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const bus = yield* Bus.Service
    return yield* make(bus.listen)
  }),
)
