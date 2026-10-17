import { beforeEach, describe, expect } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { Effect, Layer } from "effect"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { AppNodeBuilder } from "../src/effect/app-node-builder"
import { Database } from "../src/database/database.js"
import { Mission } from "../src/mission.js"
import { testEffect } from "./lib/effect"

// A recording waker stands in for the session inbox. The Set is the durable inbox: a key is
// delivered once, and a replay of the same key is a duplicate, exactly like the real inbox row.
const deliveries: string[] = []
const delivered = new Set<string>()

const recording = Layer.succeed(Mission.Coordinator.WakerService, {
  wake: (input: Mission.Coordinator.WakeInput) =>
    Effect.sync((): Mission.Coordinator.WakeResult => {
      if (delivered.has(input.key)) return "duplicate"
      delivered.add(input.key)
      deliveries.push(input.key)
      return "delivered"
    }),
})

const group = LayerNode.group([
  Database.node,
  Mission.node,
  Mission.MissionEvents.node,
  Mission.Coordinator.node,
])

const it = testEffect(AppNodeBuilder.build(group, [Mission.Coordinator.wakerNode.replace(recording)]))

const fileLayer = (file: string) =>
  AppNodeBuilder.build(group, [
    Database.node.replace(Database.configured({ path: file })),
    Mission.Coordinator.wakerNode.replace(recording),
  ])

const tempDb = Effect.gen(function* () {
  const directory = yield* Effect.promise(() => fs.mkdtemp(path.join(os.tmpdir(), "aporia-coordination-")))
  return { directory, file: path.join(directory, "coordination.db") }
})

const cleanup = (directory: string) =>
  Effect.promise(() => fs.rm(directory, { recursive: true, force: true, maxRetries: 5 }))

const setup = Effect.gen(function* () {
  const mission = yield* Mission.Service
  const builder = yield* mission.createBot({ name: "Builder" })
  const reviewer = yield* mission.createBot({ name: "Critic", kind: "expert" })
  const unit = yield* mission.createMission({ title: "Stage 2" })
  const task = yield* mission.createTask({ missionId: unit.id, title: "write the log", ownerId: builder.id })
  return { mission, builder, reviewer, unit, task }
})

const wakeEvents = (events: ReadonlyArray<Mission.MissionEvent>) =>
  events.filter((event) => event.type === "coordination.wake")

const attentionEvents = (events: ReadonlyArray<Mission.MissionEvent>) =>
  events.filter((event) => event.type === "coordination.attention")

beforeEach(() => {
  deliveries.length = 0
  delivered.clear()
})

describe("coordination rules", () => {
  it.effect("an artifact wakes the reviewer once; a replay wakes nobody", () =>
    Effect.gen(function* () {
      const { builder, reviewer, unit, task } = yield* setup
      const coordinator = yield* Mission.Coordinator.Service
      const events = yield* Mission.MissionEvents.Service
      const correlationId = Mission.CorrelationID.create()
      const input = {
        type: "artifact.created" as const,
        actor: { kind: "bot" as const, id: builder.slug },
        idempotencyKey: "artifact:one",
        missionId: unit.id,
        taskId: task.id,
        correlationId,
        payload: { reviewer: reviewer.slug },
      }

      const first = yield* coordinator.emit(input)
      expect(first.inserted).toBe(true)
      expect(first.decisions.map((decision) => decision._tag)).toEqual(["wake"])
      expect(deliveries).toHaveLength(1)

      const replay = yield* coordinator.emit(input)
      expect(replay.inserted).toBe(false)
      expect(replay.decisions).toHaveLength(0)
      expect(deliveries).toHaveLength(1)
      expect(wakeEvents(yield* events.list())).toHaveLength(1)
    }),
  )

  it.effect("a replayed task.created makes one task", () =>
    Effect.gen(function* () {
      const { mission, builder, unit } = yield* setup
      const coordinator = yield* Mission.Coordinator.Service
      const input = {
        type: "task.created" as const,
        actor: { kind: "bot" as const, id: builder.slug },
        idempotencyKey: "task:one",
        missionId: unit.id,
        payload: { title: "Read the design originals", owner: builder.slug },
      }

      yield* coordinator.emit(input)
      yield* coordinator.emit(input)
      yield* coordinator.emit({ ...input, idempotencyKey: "task:one" })

      const tasks = yield* mission.listTasks({ missionID: unit.id })
      expect(tasks).toHaveLength(2) // the setup task plus this one
      expect(tasks.filter((task) => task.title === "Read the design originals")).toHaveLength(1)
    }),
  )

  it.effect("an ack never produces a wake or another ack", () =>
    Effect.gen(function* () {
      const { builder, reviewer, unit, task } = yield* setup
      const coordinator = yield* Mission.Coordinator.Service
      const correlationId = Mission.CorrelationID.create()

      yield* coordinator.emit({
        type: "coordination.opened",
        actor: { kind: "bot", id: builder.slug },
        idempotencyKey: "open:ack",
        missionId: unit.id,
        taskId: task.id,
        correlationId,
        payload: { target: reviewer.slug, purpose: "request", text: "please review" },
      })
      expect(deliveries).toHaveLength(1)

      for (let index = 0; index < 20; index++) {
        const result = yield* coordinator.emit({
          type: "ack",
          actor: { kind: "bot", id: reviewer.slug },
          idempotencyKey: `ack:${index}`,
          missionId: unit.id,
          taskId: task.id,
          correlationId,
          payload: { text: "ack" },
        })
        expect(result.decisions).toHaveLength(0)
      }

      expect(deliveries).toHaveLength(1)
      const events = yield* Mission.MissionEvents.Service
      expect(wakeEvents(yield* events.list())).toHaveLength(1)
      expect(attentionEvents(yield* events.list())).toHaveLength(0)
    }),
  )

  it.effect("a terminal task produces no wakes", () =>
    Effect.gen(function* () {
      const { mission, builder, reviewer, unit, task } = yield* setup
      const coordinator = yield* Mission.Coordinator.Service
      const correlationId = Mission.CorrelationID.create()
      yield* mission.setTaskState(task.id, "review")
      yield* mission.setTaskState(task.id, "verified")

      const result = yield* coordinator.emit({
        type: "artifact.created",
        actor: { kind: "bot", id: builder.slug },
        idempotencyKey: "artifact:terminal",
        missionId: unit.id,
        taskId: task.id,
        correlationId,
        payload: { reviewer: reviewer.slug },
      })
      expect(result.decisions).toHaveLength(0)
      expect(deliveries).toHaveLength(0)

      const passed = yield* coordinator.emit({
        type: "review.passed",
        actor: { kind: "bot", id: reviewer.slug },
        idempotencyKey: "review:terminal",
        missionId: unit.id,
        taskId: task.id,
        correlationId,
        payload: {},
      })
      expect(passed.decisions).toHaveLength(0)
      expect(deliveries).toHaveLength(0)
    }),
  )

  it.effect("new failing evidence reopens the task as revision 2", () =>
    Effect.gen(function* () {
      const { mission, builder, reviewer, unit, task } = yield* setup
      const coordinator = yield* Mission.Coordinator.Service
      const correlationId = Mission.CorrelationID.create()
      yield* mission.setTaskState(task.id, "review")
      const verified = yield* mission.setTaskState(task.id, "verified")
      expect(verified.revision).toBe(1)

      const failed = yield* coordinator.emit({
        type: "review.failed",
        actor: { kind: "bot", id: reviewer.slug },
        idempotencyKey: "review:failed",
        missionId: unit.id,
        taskId: task.id,
        correlationId,
        payload: { owner: builder.slug, finding: "the log has no cursor" },
      })
      expect(failed.decisions.map((decision) => decision._tag)).toEqual(["close", "transition", "wake"])

      const reopened = yield* mission.getTask(task.id)
      expect(reopened.revision).toBe(2)
      expect(reopened.state).toBe("in_progress")
      expect(deliveries).toHaveLength(1)

      // The same finding, replayed, is not new work.
      yield* coordinator.emit({
        type: "review.failed",
        actor: { kind: "bot", id: reviewer.slug },
        idempotencyKey: "review:failed",
        missionId: unit.id,
        taskId: task.id,
        correlationId,
        payload: { owner: builder.slug, finding: "the log has no cursor" },
      })
      expect((yield* mission.getTask(task.id)).revision).toBe(2)
      expect(deliveries).toHaveLength(1)
    }),
  )

  it.effect("fifty distinct messages are all routed: the count is not a cap", () =>
    Effect.gen(function* () {
      const { builder, reviewer, unit, task } = yield* setup
      const coordinator = yield* Mission.Coordinator.Service
      const correlationId = Mission.CorrelationID.create()

      yield* coordinator.emit({
        type: "coordination.opened",
        actor: { kind: "bot", id: builder.slug },
        idempotencyKey: "open:fifty",
        missionId: unit.id,
        taskId: task.id,
        correlationId,
        payload: { target: reviewer.slug, purpose: "request", text: "question 0" },
      })

      for (let index = 1; index <= 50; index++) {
        const result = yield* coordinator.emit({
          type: "coordination.message",
          actor: { kind: "bot", id: builder.slug },
          idempotencyKey: `message:${index}`,
          missionId: unit.id,
          taskId: task.id,
          correlationId,
          payload: { target: reviewer.slug, purpose: "request", text: `question ${index}` },
        })
        expect(result.decisions.map((decision) => decision._tag)).toEqual(["wake"])
      }

      expect(deliveries).toHaveLength(51)
      const events = yield* Mission.MissionEvents.Service
      const thread = yield* events.list({ correlationID: correlationId })
      expect(attentionEvents(thread)).toHaveLength(0)
      expect(thread.filter((event) => event.type === "coordination.closed")).toHaveLength(0)
      expect(Mission.Coordination.fold(thread)?.state).toBe("open")
    }),
  )

  it.effect("a repeat with nothing new coalesces, then escalates exactly once", () =>
    Effect.gen(function* () {
      const { builder, reviewer, unit, task } = yield* setup
      const coordinator = yield* Mission.Coordinator.Service
      const correlationId = Mission.CorrelationID.create()
      const say = (index: number) =>
        coordinator.emit({
          type: index === 0 ? ("coordination.opened" as const) : ("coordination.message" as const),
          actor: { kind: "bot" as const, id: builder.slug },
          idempotencyKey: `repeat:${index}`,
          missionId: unit.id,
          taskId: task.id,
          correlationId,
          payload: { target: reviewer.slug, purpose: "request", text: "any update?" },
        })

      const opened = yield* say(0)
      expect(opened.decisions.map((decision) => decision._tag)).toEqual(["wake"])
      // Six identical messages: three are folded away, the third repeat escalates, the rest are quiet.
      for (let index = 1; index <= 6; index++) yield* say(index)

      expect(deliveries).toHaveLength(1)
      const events = yield* Mission.MissionEvents.Service
      const thread = yield* events.list({ correlationID: correlationId })
      expect(attentionEvents(thread)).toHaveLength(1)
      const closed = thread.filter((event) => event.type === "coordination.closed")
      expect(closed).toHaveLength(1)
      expect(closed[0]?.payload.reason).toBe("no-progress")
      expect(thread.filter((event) => event.type === "coordination.message")).toHaveLength(6)
    }),
  )

  it.effect("one approval produces one attention item, however often it is raised", () =>
    Effect.gen(function* () {
      const { builder, unit, task } = yield* setup
      const coordinator = yield* Mission.Coordinator.Service
      for (const key of ["approval:one", "approval:two", "approval:three"]) {
        yield* coordinator.emit({
          type: "approval.required",
          actor: { kind: "bot", id: builder.slug },
          idempotencyKey: key,
          missionId: unit.id,
          taskId: task.id,
          payload: { approvalId: "deploy-stage-2", text: "Deploy to the dev box?" },
        })
      }
      const events = yield* Mission.MissionEvents.Service
      expect(attentionEvents(yield* events.list())).toHaveLength(1)
    }),
  )

  it.effect("handling the same fact twice delivers one wake", () =>
    Effect.gen(function* () {
      const { builder, reviewer, unit, task } = yield* setup
      const coordinator = yield* Mission.Coordinator.Service
      const events = yield* Mission.MissionEvents.Service
      const appended = yield* events.append({
        type: "artifact.created",
        actor: { kind: "bot", id: builder.slug },
        idempotencyKey: "artifact:handled-twice",
        missionId: unit.id,
        taskId: task.id,
        correlationId: Mission.CorrelationID.create(),
        payload: { reviewer: reviewer.slug },
      })

      yield* coordinator.handle(appended.event)
      yield* coordinator.handle(appended.event)
      expect(deliveries).toHaveLength(1)
      expect(wakeEvents(yield* events.list())).toHaveLength(1)
    }),
  )
})

describe("coordinator recovery", () => {
  it.effect("a restart drains what it has not seen and never delivers twice", () =>
    Effect.gen(function* () {
      const { directory, file } = yield* tempDb
      const seeded = yield* Effect.gen(function* () {
        const mission = yield* Mission.Service
        const builder = yield* mission.createBot({ name: "Builder" })
        const reviewer = yield* mission.createBot({ name: "Critic", kind: "expert" })
        const unit = yield* mission.createMission({ title: "Restart" })
        const task = yield* mission.createTask({ missionId: unit.id, title: "survive a crash", ownerId: builder.id })
        const events = yield* Mission.MissionEvents.Service
        const correlationId = Mission.CorrelationID.create()
        // The fact is recorded and never handled: this is the crash window. Nothing was woken.
        yield* events.append({
          type: "artifact.created",
          actor: { kind: "bot", id: builder.slug },
          idempotencyKey: "artifact:restart",
          missionId: unit.id,
          taskId: task.id,
          correlationId,
          payload: { reviewer: reviewer.slug },
        })
        return { taskId: task.id }
      }).pipe(Effect.provide(fileLayer(file)))

      expect(deliveries).toHaveLength(0)

      // Second boot: it replays exactly the fact it had not seen, and a second drain finds nothing.
      yield* Effect.gen(function* () {
        const coordinator = yield* Mission.Coordinator.Service
        // One: the artifact. The wake the coordinator records for itself is replayed too, and
        // produces nothing.
        expect(yield* coordinator.drain).toBeGreaterThanOrEqual(1)
        expect(yield* coordinator.drain).toBe(0)
      }).pipe(Effect.provide(fileLayer(file)))
      expect(deliveries).toHaveLength(1)

      // Third boot: even a caller that re-handles the stored fact cannot wake the reviewer twice.
      yield* Effect.gen(function* () {
        const coordinator = yield* Mission.Coordinator.Service
        const events = yield* Mission.MissionEvents.Service
        const all = yield* events.list()
        const artifact = all.find((event) => event.type === "artifact.created")
        expect(artifact).toBeDefined()
        if (artifact) yield* coordinator.handle(artifact)
        expect(wakeEvents(all)).toHaveLength(1)
      }).pipe(Effect.provide(fileLayer(file)))
      expect(deliveries).toHaveLength(1)
      expect(seeded.taskId).toBeDefined()

      yield* cleanup(directory)
    }),
  )
})
