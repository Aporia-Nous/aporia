import { describe, expect, test } from "bun:test"
import { Agent } from "@opencode/core/agent"
import { Bus } from "@opencode/core/bus"
import { Credential } from "@opencode/schema/credential"
import { Event } from "@opencode/schema/event"
import { IntegrationID } from "@opencode/schema/integration-id"
import { AbsolutePath } from "@opencode/schema/schema"
import { SessionID } from "@opencode/schema/session-id"
import { Deferred, Effect, Exit, Fiber, Option, Schema, Stream } from "effect"
import { it } from "../../core/test/lib/effect"
import { EventFeed } from "../src/event-feed"

const Internal = Bus.ephemeral({ type: "test.internal", schema: { value: Schema.String } })

const event = (id: string): Event.Payload<typeof Agent.Event.Updated> => ({
  id: Event.ID.make(`evt_${id}`),
  created: Date.now(),
  type: Agent.Event.Updated.type,
  data: {},
})

const sessionEvent = (id: string, sessionID: string, directory?: string): Event.Payload =>
  ({
    id: Event.ID.make(`evt_${id}`),
    created: Date.now(),
    type: Agent.Event.Updated.type,
    data: { sessionID: SessionID.make(sessionID) },
    ...(directory ? { location: { directory: AbsolutePath.make(directory) } } : {}),
  }) as Event.Payload

const internal = (value: string): Event.Payload<typeof Internal> => ({
  id: Event.ID.create(),
  created: Date.now(),
  type: Internal.type,
  data: { value },
})

function makeSource() {
  let subscriber: Bus.Subscriber | undefined
  return {
    observe: (next: Bus.Subscriber) =>
      Effect.sync(() => {
        subscriber = next
        return Effect.sync(() => {
          if (subscriber === next) subscriber = undefined
        })
      }),
    publish: (event: Event.Payload) => Effect.suspend(() => (subscriber ? subscriber(event) : Effect.void)),
  }
}

describe("EventFeed", () => {
  test("preserves the public SSE frame encoding", () => {
    const payload = event("wire")
    expect(EventFeed.frame(payload)).toBe(`data: ${JSON.stringify(payload)}\n\n`)
  })

  test("matchesSubscribeFilter keeps global events and drops mismatched session/directory", () => {
    const global = event("global")
    const matched = sessionEvent("a", "ses_a", "/proj-a")
    const otherSession = sessionEvent("b", "ses_b", "/proj-a")
    const otherDir = sessionEvent("c", "ses_a", "/proj-b")

    expect(EventFeed.matchesSubscribeFilter(global as never, { sessionID: "ses_a" })).toBeTrue()
    expect(EventFeed.matchesSubscribeFilter(matched as never, { sessionID: "ses_a", directory: "/proj-a" })).toBeTrue()
    expect(EventFeed.matchesSubscribeFilter(otherSession as never, { sessionID: "ses_a" })).toBeFalse()
    expect(EventFeed.matchesSubscribeFilter(otherDir as never, { directory: "/proj-a" })).toBeFalse()
    expect(EventFeed.matchesSubscribeFilter(matched as never, undefined)).toBeTrue()
  })

  it.effect("encodes once and delivers the same frame to every subscriber", () =>
    Effect.gen(function* () {
      let encodes = 0
      const source = makeSource()
      const feed = yield* EventFeed.make(source.observe, {
        encode: (event) => {
          encodes += 1
          return event.type
        },
      })
      const first = yield* feed.subscribe()
      const second = yield* feed.subscribe()
      const left = yield* first.pipe(Stream.take(1), Stream.runCollect, Effect.forkScoped)
      const right = yield* second.pipe(Stream.take(1), Stream.runCollect, Effect.forkScoped)

      yield* source.publish(event("example"))

      expect([Array.from(yield* Fiber.join(left)), Array.from(yield* Fiber.join(right))]).toEqual([
        [Agent.Event.Updated.type],
        [Agent.Event.Updated.type],
      ])
      expect(encodes).toBe(1)
    }),
  )

  it.effect("fails only the subscriber that exceeds its lag capacity", () =>
    Effect.gen(function* () {
      const source = makeSource()
      const feed = yield* EventFeed.make(source.observe, {
        capacity: 1,
        encode: (event) => event.id,
      })
      const slow = yield* feed.subscribe()
      const fast = yield* feed.subscribe()
      const first = yield* Deferred.make<void>()
      const second = yield* Deferred.make<void>()
      const received = new Array<string>()
      const fastFiber = yield* fast.pipe(
        Stream.take(3),
        Stream.runForEach((frame) =>
          Effect.sync(() => received.push(frame)).pipe(
            Effect.andThen(
              frame === "evt_one"
                ? Deferred.succeed(first, undefined)
                : frame === "evt_two"
                  ? Deferred.succeed(second, undefined)
                  : Effect.void,
            ),
          ),
        ),
        Effect.forkScoped,
      )

      yield* source.publish(event("one"))
      yield* Deferred.await(first)
      yield* source.publish(event("two"))
      yield* Deferred.await(second)
      yield* source.publish(event("three"))

      yield* Fiber.join(fastFiber)

      const result = yield* slow.pipe(Stream.runCollect, Effect.exit)
      expect(received).toEqual(["evt_one", "evt_two", "evt_three"])
      expect(Exit.isFailure(result)).toBeTrue()
      if (Exit.isSuccess(result)) return
      expect(Option.getOrUndefined(Exit.findErrorOption(result))).toBeInstanceOf(EventFeed.SubscriberOverflowError)
      const metrics = yield* feed.metrics
      expect(metrics.overflowDrops).toBe(1)
    }),
  )

  it.effect("delivers global credential events to public subscribers", () =>
    Effect.gen(function* () {
      const source = makeSource()
      const feed = yield* EventFeed.make(source.observe, { encode: (event) => event.type })
      const stream = yield* feed.subscribe()
      const received = yield* stream.pipe(Stream.take(1), Stream.runCollect, Effect.forkScoped)

      yield* source.publish({
        id: Event.ID.create(),
        created: Date.now(),
        type: Credential.Event.Switched.type,
        data: {
          credentialID: Credential.ID.make("cred_test"),
          integrationID: IntegrationID.make("openai"),
        },
      })

      expect(Array.from(yield* Fiber.join(received))).toEqual([Credential.Event.Switched.type])
    }),
  )

  it.effect("filters internal events before they consume subscriber capacity", () =>
    Effect.gen(function* () {
      const source = makeSource()
      const feed = yield* EventFeed.make(source.observe, { capacity: 1, encode: (event) => event.type })
      const stream = yield* feed.subscribe()

      yield* source.publish(internal("one"))
      yield* source.publish(internal("two"))
      yield* source.publish(event("public"))

      expect(Array.from(yield* stream.pipe(Stream.take(1), Stream.runCollect))).toEqual([Agent.Event.Updated.type])
    }),
  )

  it.effect("skips encoding failures without disconnecting current subscribers", () =>
    Effect.gen(function* () {
      const source = makeSource()
      const feed = yield* EventFeed.make(source.observe, {
        encode: (event) => {
          if (event.id === Event.ID.make("evt_bad")) throw new Error("invalid event")
          return event.id
        },
      })
      const current = yield* feed.subscribe()
      const first = yield* Deferred.make<void>()
      const received = new Array<string>()
      const fiber = yield* current.pipe(
        Stream.take(2),
        Stream.runForEach((frame) =>
          Effect.sync(() => received.push(frame)).pipe(
            Effect.andThen(frame === "evt_good1" ? Deferred.succeed(first, undefined) : Effect.void),
          ),
        ),
        Effect.forkScoped,
      )

      yield* source.publish(event("good1"))
      yield* Deferred.await(first)
      yield* source.publish(event("bad"))
      yield* source.publish(event("good2"))

      yield* Fiber.join(fiber)
      expect(received).toEqual(["evt_good1", "evt_good2"])
      const metrics = yield* feed.metrics
      expect(metrics.encodeFailures).toBe(1)
      expect(metrics.subscribers).toBe(1)
    }),
  )

  it.effect("applies optional session/directory filters per subscriber after encode-once", () =>
    Effect.gen(function* () {
      let encodes = 0
      const source = makeSource()
      const feed = yield* EventFeed.make(source.observe, {
        encode: (event) => {
          encodes += 1
          return event.id
        },
      })
      const scoped = yield* feed.subscribe({ sessionID: "ses_keep", directory: "/keep" })
      const global = yield* feed.subscribe()
      const scopedFiber = yield* scoped.pipe(Stream.take(2), Stream.runCollect, Effect.forkScoped)
      const globalFiber = yield* global.pipe(Stream.take(3), Stream.runCollect, Effect.forkScoped)

      yield* source.publish(sessionEvent("keep", "ses_keep", "/keep"))
      yield* source.publish(sessionEvent("drop", "ses_other", "/other"))
      yield* source.publish(event("crosscut"))

      expect(Array.from(yield* Fiber.join(scopedFiber))).toEqual(["evt_keep", "evt_crosscut"])
      expect(Array.from(yield* Fiber.join(globalFiber))).toEqual(["evt_keep", "evt_drop", "evt_crosscut"])
      expect(encodes).toBe(3)
    }),
  )

  it.effect("delivers credential events to filtered subscribers", () =>
    Effect.gen(function* () {
      const source = makeSource()
      const feed = yield* EventFeed.make(source.observe, { encode: (event) => event.type })
      const stream = yield* feed.subscribe({ sessionID: "ses_any", directory: "/proj" })
      const received = yield* stream.pipe(Stream.take(1), Stream.runCollect, Effect.forkScoped)

      yield* source.publish({
        id: Event.ID.create(),
        created: Date.now(),
        type: Credential.Event.Switched.type,
        data: {
          credentialID: Credential.ID.make("cred_test"),
          integrationID: IntegrationID.make("openai"),
        },
      })

      expect(Array.from(yield* Fiber.join(received))).toEqual([Credential.Event.Switched.type])
    }),
  )
})
