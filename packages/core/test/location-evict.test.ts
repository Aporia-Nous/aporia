import type { FileSystem } from "@opencode/core/filesystem"
import { describe, expect } from "bun:test"
import { Context, Deferred, Duration, Effect, Fiber, Layer, LayerMap, RcMap, Schema } from "effect"
import { TestClock } from "effect/testing"
import { AppNodeBuilder } from "@opencode/core/effect/app-node-builder"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { makeGlobalNode } from "@opencode/util/effect/app-node"
import { Bus } from "@opencode/core/bus"
import { Database } from "@opencode/core/database/database"
import { Form } from "@opencode/core/form"
import { Location } from "@opencode/core/location"
import { LocationActivity } from "@opencode/core/location-activity"
import { LocationServiceMap, type LocationServices } from "@opencode/core/location-services"
import { Project } from "@opencode/core/project"
import { ProjectTable } from "@opencode/core/project/sql"
import { AbsolutePath } from "@opencode/core/schema"
import { Session } from "@opencode/core/session"
import { SessionExecution } from "@opencode/core/session/execution"
import { SessionEvent } from "@opencode/core/session/event"
import { SessionRunner } from "@opencode/core/session/runner/index"
import { SessionTable } from "@opencode/core/session/sql"
import { SessionStore } from "@opencode/core/session/store"
import { testEffect } from "./lib/effect"

// Aporia runs one long-lived server shared by the window and every teammate bot, and each bot is its
// own Location. This suite pins the eviction contract Aporia depends on: idle Locations release their
// scope, work keeps them alive, bookkeeping does not, and an in-flight turn is interrupted gracefully
// (never torn down mid-flight). The fixture mirrors location-activity.test.ts so ownership, caching,
// forms, and the graceful interrupt all stay real.

const TB = "5 minutes"
const SWEEP = "1 minute"

const locations = Layer.effect(
  LocationServiceMap.Service,
  Effect.gen(function* () {
    const bus = yield* Bus.Service
    const map = yield* LayerMap.make(
      (ref: Location.Ref) =>
        Layer.merge(
          Layer.succeed(
            Location.Service,
            Location.Service.of({
              directory: ref.directory,
              workspaceID: ref.workspaceID,
              project: { id: Project.ID.global, directory: ref.directory, canonical: ref.directory },
            }),
          ),
          Layer.effect(
            SessionRunner.Service,
            Effect.gen(function* () {
              const forms = yield* Form.Service
              return SessionRunner.Service.of({
                drain: ({ sessionID }) =>
                  forms
                    .ask({
                      sessionID,
                      title: "Questions",
                      fields: [{ key: "runtime", type: "string" }],
                    })
                    .pipe(
                      Effect.orDie,
                      Effect.as(SessionRunner.DrainResult.Complete()),
                      Effect.onInterrupt(() => Effect.sleep("5 minutes")),
                    ),
              })
            }),
          ),
        ).pipe(
          Layer.provideMerge(Form.layer),
          Layer.provide(Layer.succeed(Bus.Service, bus)),
          Layer.fresh,
        ) as unknown as Layer.Layer<LocationServices, FileSystem.DirectoryNotFoundError>,
      { idleTimeToLive: Duration.infinity },
    )
    return {
      ...map,
      get: (ref: Location.Ref) => map.get(LocationServiceMap.canonical(ref)),
      contextEffect: (ref: Location.Ref) => map.contextEffect(LocationServiceMap.canonical(ref)),
      contextEffectOption: (ref: Location.Ref) => map.contextEffectOption(LocationServiceMap.canonical(ref)),
      invalidate: (ref: Location.Ref) => map.invalidate(LocationServiceMap.canonical(ref)),
    }
  }),
)

const it = testEffect(
  AppNodeBuilder.build(
    LayerNode.group([
      Database.node,
      Bus.node,
      SessionStore.node,
      LocationServiceMap.node,
      SessionExecution.node,
      LocationActivity.node,
    ]),
    [
      LocationServiceMap.node.replace(
        makeGlobalNode({
          service: LocationServiceMap.Service,
          layer: locations,
          deps: [Bus.node],
        }),
      ),
      LocationActivity.node.replace(
        makeGlobalNode({
          service: LocationActivity.Service,
          layer: LocationActivity.layer({ timeToLive: TB, sweepInterval: SWEEP }),
          deps: [Bus.node, LocationServiceMap.node, SessionExecution.node, SessionStore.node],
        }),
      ),
    ],
  ),
)

// The Aporia app sets a short TTL through the environment; this pins the touch policy it activates.
const withAporiaTtl = <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
  Effect.gen(function* () {
    const previous = process.env.APORIA_LOCATION_IDLE_TTL_MIN
    process.env.APORIA_LOCATION_IDLE_TTL_MIN = "5"
    return yield* effect.pipe(
      Effect.ensuring(
        Effect.sync(() => {
          if (previous === undefined) delete process.env.APORIA_LOCATION_IDLE_TTL_MIN
          else process.env.APORIA_LOCATION_IDLE_TTL_MIN = previous
        }),
      ),
    )
  })

const canonical = (directory: string) => LocationServiceMap.canonical({ directory: AbsolutePath.make(directory) })

const seed = (ref: Location.Ref, sessionIDs: ReadonlyArray<Session.ID>) =>
  Effect.gen(function* () {
    const db = (yield* Database.Service).db
    yield* db
      .insert(ProjectTable)
      .values({ id: Project.ID.global, worktree: ref.directory, sandboxes: [] })
      .onConflictDoNothing()
      .run()
      .pipe(Effect.orDie)
    if (sessionIDs.length === 0) return
    yield* db
      .insert(SessionTable)
      .values(
        sessionIDs.map((sessionID) => ({
          id: sessionID,
          project_id: Project.ID.global,
          slug: "evict",
          directory: ref.directory,
          title: "Eviction fixture",
          version: "test",
        })),
      )
      .run()
      .pipe(Effect.orDie)
  })

describe("Location eviction (Aporia)", () => {
  it.effect("releases an idle location's scope once the TTL passes", () =>
    Effect.gen(function* () {
      const map = yield* LocationServiceMap.Service
      const ref = canonical("/idle")
      yield* map.contextEffect(ref).pipe(Effect.scoped)
      expect(Array.from(yield* RcMap.keys(map.rcMap))).toEqual([ref])

      // The first sweep seeds the entry; it then expires untouched.
      yield* TestClock.adjust(SWEEP)
      yield* TestClock.adjust(TB)
      expect(Array.from(yield* RcMap.keys(map.rcMap))).toEqual([])
    }).pipe(withAporiaTtl),
  )

  it.effect("keeps a location alive while user-visible activity continues", () =>
    Effect.gen(function* () {
      const bus = yield* Bus.Service
      const map = yield* LocationServiceMap.Service
      const ref = canonical("/active")
      const sessionID = Session.ID.make("ses_active")
      yield* seed(ref, [sessionID])
      yield* map.contextEffect(ref).pipe(Effect.scoped)

      yield* TestClock.adjust(SWEEP)
      yield* TestClock.adjust("4 minutes")
      // A real turn is activity: it pushes the deadline out.
      yield* bus.publish(SessionEvent.Execution.Started, { sessionID }, { location: ref })
      yield* TestClock.adjust("3 minutes")
      expect(Array.from(yield* RcMap.keys(map.rcMap))).toEqual([ref])

      // No further activity, so it eventually releases.
      yield* TestClock.adjust("3 minutes")
      expect(Array.from(yield* RcMap.keys(map.rcMap))).toEqual([])
    }).pipe(withAporiaTtl),
  )

  it.effect("does not let a bookkeeping event hold an idle location open", () =>
    Effect.gen(function* () {
      const bus = yield* Bus.Service
      const map = yield* LocationServiceMap.Service
      const ref = canonical("/viewed")
      const sessionID = Session.ID.make("ses_viewed")
      yield* seed(ref, [sessionID])
      yield* map.contextEffect(ref).pipe(Effect.scoped)

      yield* TestClock.adjust(SWEEP)
      yield* TestClock.adjust("4 minutes")
      // `session.viewed` is a read watermark, not work; it must not extend the TTL.
      yield* bus.publish(SessionEvent.Viewed, { sessionID, idle: 0 }, { location: ref })
      yield* TestClock.adjust("3 minutes")
      expect(Array.from(yield* RcMap.keys(map.rcMap))).toEqual([])
    }).pipe(withAporiaTtl),
  )

  it.effect("interrupts an in-flight turn gracefully instead of tearing the scope down", () =>
    Effect.gen(function* () {
      const bus = yield* Bus.Service
      const map = yield* LocationServiceMap.Service
      const execution = yield* SessionExecution.Service
      const store = yield* SessionStore.Service
      const ref = canonical("/in-flight")
      const sessionID = Session.ID.make("ses_in_flight")
      yield* seed(ref, [sessionID])

      const created = yield* Deferred.make<void>()
      const pending: Form.Info[] = []
      const interrupted: SessionEvent.Execution.Interrupted["data"][] = []
      const unsubscribe = yield* bus.listen((event) =>
        Effect.gen(function* () {
          if (event.type === SessionEvent.Execution.Interrupted.type) {
            interrupted.push(Schema.decodeUnknownSync(SessionEvent.Execution.Interrupted.data)(event.data))
          }
          if (event.type !== Form.Event.Created.type) return
          pending.push(Schema.decodeUnknownSync(Form.Event.Created.data)(event.data).form)
          yield* Deferred.succeed(created, undefined)
        }),
      )
      yield* Effect.addFinalizer(() => unsubscribe)
      const running = yield* execution.resume(sessionID).pipe(Effect.exit, Effect.forkScoped)
      yield* Effect.addFinalizer(() =>
        execution.interrupt(sessionID).pipe(Effect.andThen(TestClock.adjust("5 minutes"))),
      )
      yield* Deferred.await(created)
      const context = yield* map.contextEffect(ref).pipe(Effect.scoped)
      const forms = Context.get(context, Form.Service)

      // Cross the TTL with the turn still waiting on a question.
      yield* TestClock.adjust(SWEEP)
      yield* TestClock.adjust(TB)
      // The in-flight turn is interrupted by inactivity and its question is cancelled...
      expect(interrupted).toEqual([])
      expect(yield* forms.list()).toEqual([])
      for (const form of pending) expect(yield* forms.state(form.id)).toEqual({ status: "cancelled" })
      // ...but slow cleanup still owns the graph, so the scope is NOT torn down yet.
      expect(Array.from(yield* execution.active)).toEqual([sessionID])
      expect(Array.from(yield* RcMap.keys(map.rcMap))).toEqual([ref])

      // Cleanup settles: the interruption is reported and the location is released.
      yield* TestClock.adjust("5 minutes")
      const exit = yield* Fiber.join(running)
      expect(exit._tag).toBe("Failure")
      expect(interrupted).toEqual([{ sessionID, reason: "inactivity" }])
      expect(Array.from(yield* execution.active)).toEqual([])
      expect(yield* store.listSuspended()).toEqual([])
      expect(Array.from(yield* RcMap.keys(map.rcMap))).toEqual([])
      yield* TestClock.adjust(SWEEP)
      expect(Array.from(yield* RcMap.keys(map.rcMap))).toEqual([])
    }).pipe(withAporiaTtl),
    30_000,
  )
})
