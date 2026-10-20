import { beforeEach, describe, expect } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { Effect, Fiber, Layer } from "effect"
import { TestClock } from "effect/testing"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { AppNodeBuilder } from "../src/effect/app-node-builder"
import { Database } from "../src/database/database.js"
import { Mission } from "../src/mission.js"
import { testEffect } from "./lib/effect"

// Stage 3: the coordinator runs on its own (the trigger), its attention items are durable cards, and
// resolving a card is one inert, idempotent fact. Same recording waker as the Stage 2 suite: nothing
// here may wake anybody, and the recording proves it.
const deliveries: string[] = []

const recording = Layer.succeed(Mission.Coordinator.WakerService, {
  wake: (input: Mission.Coordinator.WakeInput) =>
    Effect.sync((): Mission.Coordinator.WakeResult => {
      deliveries.push(input.key)
      return "delivered"
    }),
})

const base = [Database.node, Mission.node, Mission.MissionEvents.node, Mission.Coordinator.node] as const
const withCards = LayerNode.group([...base, Mission.AttentionCards.node])
const withTrigger = LayerNode.group([...base, Mission.AttentionCards.node, Mission.CoordinatorTrigger.node])

const it = testEffect(AppNodeBuilder.build(withTrigger, [Mission.Coordinator.wakerNode.replace(recording)]))
// No trigger: only explicit emit/drain calls touch the cursor, so the order of events is exactly the test's.
const manual = testEffect(AppNodeBuilder.build(withCards, [Mission.Coordinator.wakerNode.replace(recording)]))

// Every boot below is provided with `local: true`. Without it the inner layer is memoised against
// the test's own layer, so a "second boot" silently reuses the first boot's services and the
// in-memory database instead of reopening the file — and a restart test proves nothing.
const fileLayer = (file: string, trigger: boolean) =>
  AppNodeBuilder.build(trigger ? withTrigger : withCards, [
    Database.node.replace(Database.configured({ path: file })),
    Mission.Coordinator.wakerNode.replace(recording),
  ])

const tempDb = Effect.gen(function* () {
  const directory = yield* Effect.promise(() => fs.mkdtemp(path.join(os.tmpdir(), "aporia-attention-")))
  return { directory, file: path.join(directory, "attention.db") }
})

const cleanup = (directory: string) =>
  Effect.promise(() => fs.rm(directory, { recursive: true, force: true, maxRetries: 5 }))

const approval = (approvalId: string, key: string, missionId?: Mission.MissionID) => ({
  type: "approval.required" as const,
  actor: { kind: "bot" as const, id: "builder" },
  idempotencyKey: key,
  missionId,
  payload: { approvalId, title: `Approve ${approvalId}` },
})

const ofType = (events: ReadonlyArray<Mission.MissionEvent>, type: Mission.MissionEventType) =>
  events.filter((event) => event.type === type)

/** Let forked fibers run, advancing the test clock one second at a time, until `done` holds. */
const settle = <E, R>(done: Effect.Effect<boolean, E, R>, seconds = 10) =>
  Effect.gen(function* () {
    for (let step = 0; step <= seconds; step++) {
      // A real macrotask, not only a fiber yield: SQLite work in the forked trigger may be async.
      for (let spin = 0; spin < 5; spin++) yield* Effect.promise(() => new Promise((resolve) => setTimeout(resolve, 5)))
      if (yield* done) return true
      yield* TestClock.adjust("1 second")
    }
    return yield* done
  })

beforeEach(() => {
  deliveries.length = 0
})

describe("coordinator trigger", () => {
  it.effect("a fact nobody handled is drained by the trigger, with no drain call", () =>
    Effect.gen(function* () {
      const events = yield* Mission.MissionEvents.Service
      const cards = yield* Mission.AttentionCards.Service
      const trigger = yield* Mission.CoordinatorTrigger.Service
      // Recorded, not handled: exactly what a write from another process looks like.
      yield* events.append(approval("ap-1", "approval:trigger"))
      expect(yield* cards.list()).toHaveLength(0)

      const handled = yield* settle(Effect.map(cards.list(), (list) => list.length === 1))
      expect(handled).toBe(true)
      const status = yield* trigger.status
      expect(status.running).toBe(true)
      expect(status.cursor).toBe(status.latest)
      expect(status.drains).toBeGreaterThanOrEqual(1)
      expect(status.lastError).toBeUndefined()
      expect(deliveries).toHaveLength(0)
    }),
  )

  it.effect("the boot drain recovers a fact recorded before the crash", () =>
    Effect.gen(function* () {
      const { directory, file } = yield* tempDb
      // First boot has no trigger: the fact is recorded and the process "dies" before handling it.
      yield* Effect.gen(function* () {
        const events = yield* Mission.MissionEvents.Service
        yield* events.append(approval("ap-boot", "approval:boot"))
        expect(yield* events.cursor).toBe(0)
      }).pipe(Effect.provide(fileLayer(file, false), { local: true }))

      // Second boot with the trigger and the clock frozen: only the immediate boot tick can do this.
      yield* Effect.gen(function* () {
        const cards = yield* Mission.AttentionCards.Service
        const events = yield* Mission.MissionEvents.Service
        const ready = yield* settle(Effect.map(cards.list(), (list) => list.length === 1), 0)
        expect(ready).toBe(true)
        expect(yield* events.cursor).toBe(yield* events.latestSequence)
      }).pipe(Effect.provide(fileLayer(file, true), { local: true }))
      yield* cleanup(directory)
    }),
  )

  it.effect("a failing drain is remembered and the next tick still drains", () =>
    Effect.gen(function* () {
      let calls = 0
      // A closed stand-in coordinator: the first drain dies, every later one succeeds.
      const flaky = Layer.succeed(
        Mission.Coordinator.Service,
        Mission.Coordinator.Service.of({
          emit: () => Effect.die(new Error("not used")),
          handle: () => Effect.succeed([]),
          cursor: Effect.succeed(0),
          drain: Effect.suspend(() => {
            calls++
            return calls === 1 ? Effect.die(new Error("disk went away")) : Effect.succeed(1)
          }),
        }),
      )
      const layer = AppNodeBuilder.build(
        LayerNode.group([Database.node, Mission.MissionEvents.node, Mission.CoordinatorTrigger.node]),
        [Mission.Coordinator.node.replace(flaky)],
      )
      yield* Effect.gen(function* () {
        const events = yield* Mission.MissionEvents.Service
        const trigger = yield* Mission.CoordinatorTrigger.Service
        yield* events.append(approval("ap-flaky", "approval:flaky"))
        const failed = yield* settle(Effect.map(trigger.status, (status) => status.lastError !== undefined))
        expect(failed).toBe(true)
        // Clients see the kind of failure only: no message, no stack, no file paths.
        const lastError = (yield* trigger.status).lastError
        expect(lastError).toBe("Drain failed (Error); details are in the server log")
        expect(lastError).not.toContain("disk went away")
        expect(lastError).not.toContain(" at ")
        // The stand-in never moves the cursor, so a later successful drain is what recovery looks like.
        const recovered = yield* settle(
          Effect.map(trigger.status, (status) => status.drains >= 1 && status.lastError === undefined),
        )
        expect(recovered).toBe(true)
        const status = yield* trigger.status
        expect(status.lastError).toBeUndefined()
        expect(calls).toBeGreaterThanOrEqual(2)
      }).pipe(Effect.provide(layer, { local: true }))
    }),
  )
})

describe("coordinator trigger shutdown", () => {
  it.effect("an interrupted drain is not recorded or reported as a failed drain", () =>
    Effect.gen(function* () {
      let started = false
      let interrupted = false
      // A drain that never finishes, so the only way out is interruption (what shutdown does).
      const hanging = Layer.succeed(
        Mission.Coordinator.Service,
        Mission.Coordinator.Service.of({
          emit: () => Effect.die(new Error("not used")),
          handle: () => Effect.succeed([]),
          cursor: Effect.succeed(0),
          drain: Effect.suspend(() => {
            started = true
            return Effect.never.pipe(Effect.onInterrupt(() => Effect.sync(() => void (interrupted = true))))
          }),
        }),
      )
      const layer = AppNodeBuilder.build(
        LayerNode.group([Database.node, Mission.MissionEvents.node, Mission.CoordinatorTrigger.node]),
        [Mission.Coordinator.node.replace(hanging)],
      )
      yield* Effect.gen(function* () {
        const events = yield* Mission.MissionEvents.Service
        const trigger = yield* Mission.CoordinatorTrigger.Service
        yield* events.append(approval("ap-hang", "approval:hang"))
        // The background loop's own tick is now stuck in drain; a manual tick joins it the same way.
        expect(yield* settle(Effect.sync(() => started))).toBe(true)
        const manual = yield* trigger.tick.pipe(Effect.forkChild)
        yield* settle(Effect.succeed(false), 1)
        yield* Fiber.interrupt(manual)
        expect((yield* trigger.status).lastError).toBeUndefined()
      }).pipe(Effect.provide(layer, { local: true }))
      // Closing the layer interrupts the background loop mid-drain, as shutdown does.
      expect(interrupted).toBe(true)
    }),
  )
})

describe("attention cards", () => {
  it.effect("cards survive a restart, open and resolved alike", () =>
    Effect.gen(function* () {
      const { directory, file } = yield* tempDb
      const first = yield* Effect.gen(function* () {
        const mission = yield* Mission.Service
        const coordinator = yield* Mission.Coordinator.Service
        const unit = yield* mission.createMission({ title: "Stage 3" })
        // One approval raised twice under two keys, and a second approval: two cards, not three.
        yield* coordinator.emit(approval("ap-a", "approval:a:1", unit.id))
        yield* coordinator.emit(approval("ap-a", "approval:a:2", unit.id))
        yield* coordinator.emit(approval("ap-b", "approval:b", unit.id))
        const cards = yield* Mission.AttentionCards.Service
        const open = yield* cards.list()
        expect(open).toHaveLength(2)
        expect(open.every((card) => card.state === "open")).toBe(true)
        expect(open.map((card) => card.key).sort()).toEqual(["attention:approval:ap-a", "attention:approval:ap-b"])
        return { missionId: unit.id, ids: open.map((card) => card.id) }
      }).pipe(Effect.provide(fileLayer(file, false), { local: true }))

      // Second boot: both are still open; resolve one, twice.
      const resolvedID = first.ids[0]!
      yield* Effect.gen(function* () {
        const cards = yield* Mission.AttentionCards.Service
        const events = yield* Mission.MissionEvents.Service
        expect(yield* cards.list()).toHaveLength(2)
        const once = yield* cards.resolve({ cardID: resolvedID, by: "ali", resolution: "approved" })
        expect(once.state).toBe("resolved")
        expect(once.resolvedBy).toBe("ali")
        expect(once.resolution).toBe("approved")
        const twice = yield* cards.resolve({ cardID: resolvedID })
        expect(twice.state).toBe("resolved")
        expect(twice.resolvedBy).toBe("ali")
        const log = yield* events.list()
        expect(ofType(log, "attention.resolved")).toHaveLength(1)
        // Inert: resolving raised no new attention and woke nobody.
        expect(ofType(log, "coordination.attention")).toHaveLength(2)
        expect(ofType(log, "coordination.wake")).toHaveLength(0)
        expect(yield* events.cursor).toBe(yield* events.latestSequence)
      }).pipe(Effect.provide(fileLayer(file, false), { local: true }))

      // Third boot: the resolution is part of the log, so it is still resolved.
      yield* Effect.gen(function* () {
        const cards = yield* Mission.AttentionCards.Service
        const open = yield* cards.list()
        expect(open.map((card) => card.id)).toEqual(first.ids.filter((id) => id !== resolvedID))
        const all = yield* cards.list({ state: "all", missionID: first.missionId })
        expect(all).toHaveLength(2)
        expect(all.find((card) => card.id === resolvedID)?.state).toBe("resolved")
        expect(yield* cards.list({ state: "resolved" })).toHaveLength(1)
      }).pipe(Effect.provide(fileLayer(file, false), { local: true }))

      expect(deliveries).toHaveLength(0)
      yield* cleanup(directory)
    }),
  )

  it.effect("an unknown card is an error, not a silent success", () =>
    Effect.gen(function* () {
      const cards = yield* Mission.AttentionCards.Service
      const events = yield* Mission.MissionEvents.Service
      const error = yield* cards.resolve({ cardID: "evt_missing" }).pipe(Effect.flip)
      expect(error._tag).toBe("Mission.AttentionCardNotFound")
      expect(ofType(yield* events.list(), "attention.resolved")).toHaveLength(0)
    }),
  )

  it.effect("attention.resolved is an outcome: the rules decide nothing for it", () =>
    Effect.sync(() => {
      const event: Mission.MissionEvent = {
        seq: 1,
        id: Mission.MissionEventID.create(),
        correlationId: Mission.CorrelationID.create(),
        type: "attention.resolved",
        actor: { kind: "user", id: "ali" },
        payload: { card: "evt_x", owner: "builder" },
        idempotencyKey: "resolve:evt_x",
        createdAt: 0,
      }
      expect(Mission.Coordination.decide({ event, roster: {} })).toEqual([])
      // A resolution folded with no card is ignored rather than inventing one.
      expect(Mission.AttentionCards.fold([event])).toEqual([])
    }),
  )
})

// Verifier finding (Stage 3 pass 1, HIGH): a live emit moved the cursor to its own seq, skipping an
// older fact that was recorded but not yet handled, so that fact never got its card.
describe("coordinator backlog", () => {
  manual.effect("a live emit never skips an older fact nobody handled", () =>
    Effect.gen(function* () {
      const events = yield* Mission.MissionEvents.Service
      const coordinator = yield* Mission.Coordinator.Service
      const cards = yield* Mission.AttentionCards.Service
      // seq 1: recorded by someone else, not handled (cursor stays 0).
      yield* events.append(approval("ap-ext", "approval:ext"))
      // seq 2: a live fact through the coordinator.
      yield* coordinator.emit(approval("ap-live", "approval:live"))
      yield* coordinator.drain
      const keys = (yield* cards.list()).map((card) => card.key).sort()
      expect(keys).toEqual(["attention:approval:ap-ext", "attention:approval:ap-live"])
      expect(yield* events.cursor).toBe(yield* events.latestSequence)
      expect(deliveries).toHaveLength(0)
    }),
  )

  manual.effect("resolving a card while a fact waits in the backlog does not lose that fact", () =>
    Effect.gen(function* () {
      const events = yield* Mission.MissionEvents.Service
      const coordinator = yield* Mission.Coordinator.Service
      const cards = yield* Mission.AttentionCards.Service
      yield* coordinator.emit(approval("ap-a", "approval:a"))
      const [first] = yield* cards.list()
      expect(first?.key).toBe("attention:approval:ap-a")
      // Recorded by someone else while the card is open, not handled yet.
      yield* events.append(approval("ap-ext", "approval:ext-2"))
      yield* cards.resolve({ cardID: first!.id })
      yield* coordinator.drain
      const all = yield* cards.list({ state: "all" })
      expect(all.map((card) => [card.key, card.state]).sort()).toEqual([
        ["attention:approval:ap-a", "resolved"],
        ["attention:approval:ap-ext", "open"],
      ])
      expect(ofType(yield* events.list(), "attention.resolved")).toHaveLength(1)
      expect(yield* events.cursor).toBe(yield* events.latestSequence)
    }),
  )
})
