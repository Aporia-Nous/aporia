export * as Coordinator from "./coordinator.js"

import { Context, Effect, Layer, Option } from "effect"
import { makeGlobalNode } from "@opencode/util/effect/app-node"
import { KeyedMutex } from "../effect/keyed-mutex.js"
import { SessionInbox } from "../session/inbox.js"
import { SessionMessage } from "../session/message.js"
import { SessionSchema } from "../session/schema.js"
import { Coordination } from "./coordination.js"
import { MissionEvents } from "./event.js"
import { MissionSchema } from "./schema.js"
import { Service as MissionService, node as missionNode } from "./service.js"

// The coordinator is the only thing that turns a fact into other people's work. It runs in the core
// (the server side), never in a renderer effect, so closing the window cannot stop it and reopening
// the window cannot replay it.
//
// Delivery is exactly-once by construction, not by luck:
//   * every wake carries a key (`wake:<eventID>:<botID>:<purpose>`);
//   * the waker admits that key into the session inbox, whose id is the deduplication;
//   * the coordinator also appends a `coordination.wake` event with the same key, so a replay after a
//     crash inserts nothing and wakes nobody. Replay is safe even when it happens in the middle of a
//     wake: the second attempt lands on the same inbox row.
//
// A wake arriving while a session is already mid-turn is queued, not steered: the bot finishes what
// it is doing, then reads the request. That is the existing session loop, not a second agent loop.

export type WakeResult = "delivered" | "duplicate" | "no-session"

export interface WakeInput {
  readonly key: string
  readonly botID: MissionSchema.BotID
  readonly purpose: MissionSchema.CoordinationPurpose
  readonly reason: string
  readonly correlationID: MissionSchema.CorrelationID
  readonly missionID?: MissionSchema.MissionID
  readonly taskID?: MissionSchema.TaskID
  readonly sourceEventID: MissionSchema.MissionEventID
}

export interface Waker {
  readonly wake: (input: WakeInput) => Effect.Effect<WakeResult>
}

export class WakerService extends Context.Service<WakerService, Waker>()("@opencode/MissionWaker") {}

export interface EmitResult {
  readonly event: MissionSchema.MissionEvent
  readonly inserted: boolean
  readonly decisions: ReadonlyArray<Coordination.Decision>
}

export interface Interface {
  /** Record a fact and act on it immediately. A repeated idempotency key does nothing at all. */
  readonly emit: (input: MissionSchema.AppendEventInput) => Effect.Effect<EmitResult>
  /** Act on one already-recorded fact without recording it again. */
  readonly handle: (event: MissionSchema.MissionEvent) => Effect.Effect<ReadonlyArray<Coordination.Decision>>
  /** Replay every fact the coordinator has not seen yet. Returns how many it handled. */
  readonly drain: Effect.Effect<number>
  readonly cursor: Effect.Effect<number>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/MissionCoordinator") {}

const SYSTEM: MissionSchema.Actor = { kind: "system", id: "coordinator" }

const taskView = (task: MissionSchema.Task): Coordination.TaskView => ({
  id: task.id,
  title: task.title,
  state: task.state,
  ownerId: task.ownerId,
})

const payloadBot = (event: MissionSchema.MissionEvent, key: string): string | undefined => {
  const value = event.payload[key]
  return typeof value === "string" && value.length > 0 ? value : undefined
}

export const make = Effect.fn("MissionCoordinator.make")(function* () {
  const mission = yield* MissionService
  const events = yield* MissionEvents.Service
  const waker = yield* WakerService
  // One coordinator action at a time. The log order is the contract, so nothing may interleave
  // between reading a fact and acting on it.
  const mutex = yield* KeyedMutex.make<"mission">()
  const serialized = <A, E, R>(effect: Effect.Effect<A, E, R>) => mutex.withLock("mission")(effect)

  /** A bot named in the payload may be an id or a slug; both are accepted. */
  const resolveBot = Effect.fn("MissionCoordinator.resolveBot")(function* (value: string | undefined) {
    if (value === undefined) return undefined
    const bySlug = yield* mission.getBotBySlug(value).pipe(Effect.orDie)
    if (bySlug) return bySlug.id
    const bots = yield* mission.listBots().pipe(Effect.orDie)
    return bots.find((bot) => bot.id === value)?.id
  })

  /**
   * Who reviews and who verifies. The event may name them (payload `reviewer` / `verifier` / `owner`,
   * by id or slug); otherwise the mission's team decides: the first expert who is not the builder
   * reviews, and the team coordinator verifies.
   */
  const resolveRoster = Effect.fn("MissionCoordinator.resolveRoster")(function* (
    event: MissionSchema.MissionEvent,
    task: MissionSchema.Task | undefined,
  ) {
    const owner = (yield* resolveBot(payloadBot(event, "owner"))) ?? task?.ownerId
    const reviewer = yield* resolveBot(payloadBot(event, "reviewer"))
    const verifier = yield* resolveBot(payloadBot(event, "verifier"))
    if (reviewer && verifier) return { owner, reviewer, verifier }
    const unit = event.missionId === undefined ? Option.none() : yield* mission.getMission(event.missionId).pipe(Effect.option)
    const teamID = Option.isSome(unit) ? unit.value.teamId : undefined
    const team = teamID === undefined ? Option.none() : yield* mission.getTeam(teamID).pipe(Effect.option)
    if (Option.isNone(team)) return { owner, reviewer, verifier }
    const bots = yield* mission.listBots().pipe(Effect.orDie)
    const expert = team.value.members
      .map((id) => bots.find((bot) => bot.id === id))
      .find((bot) => bot !== undefined && bot.kind === "expert" && bot.id !== owner)
    return {
      owner,
      reviewer: reviewer ?? expert?.id,
      verifier: verifier ?? team.value.coordinatorId,
    }
  })

  const applyDecision = (
    event: MissionSchema.MissionEvent,
    decision: Coordination.Decision,
    coordination: Coordination.View | undefined,
  ) =>
    Effect.gen(function* () {
      if (decision._tag === "task") {
        // A derived id makes the insert idempotent: the row either already exists or is created now.
        const existing = yield* mission.getTask(decision.id).pipe(Effect.option)
        if (Option.isNone(existing))
          yield* mission
            .createTask({
              id: decision.id,
              missionId: decision.missionId,
              title: decision.title,
              ownerId: decision.ownerId,
            })
            .pipe(Effect.ignore)
        return
      }
      if (decision._tag === "wake") {
        const key = `wake:${event.id}:${decision.botID}:${decision.purpose}`
        // The log decides "already woken", not process memory: if this key is recorded, the wake was
        // already attempted before, so a replay in a fresh process changes nothing.
        const recorded = yield* events
          .list({ correlationID: event.correlationId })
          .pipe(Effect.map((rows) => rows.some((row) => row.idempotencyKey === key)))
        if (recorded) return
        // Wake first: a record that claims delivery must not exist before delivery was attempted.
        const result = yield* waker.wake({
          key,
          botID: decision.botID,
          purpose: decision.purpose,
          reason: decision.reason,
          correlationID: event.correlationId,
          missionID: event.missionId,
          taskID: event.taskId,
          sourceEventID: event.id,
        })
        yield* events.append({
          type: "coordination.wake",
          actor: SYSTEM,
          idempotencyKey: key,
          correlationId: event.correlationId,
          missionId: event.missionId,
          taskId: event.taskId,
          payload: { botID: decision.botID, purpose: decision.purpose, reason: decision.reason, result },
        })
        if (result === "no-session") {
          // The bot exists but has no session in this mission. That is a person's problem, not a loop.
          yield* events.append({
            type: "coordination.attention",
            actor: SYSTEM,
            idempotencyKey: `attention:${key}`,
            correlationId: event.correlationId,
            missionId: event.missionId,
            taskId: event.taskId,
            payload: {
              title: "Wake could not be delivered",
              body: `${decision.botID} has no session in this mission, so the ${decision.purpose} was not delivered.`,
            },
          })
        }
        return
      }
      if (decision._tag === "transition") {
        if (event.taskId === undefined) return
        // A revision bump is the mission service's job: leaving a terminal state already increments it.
        yield* mission.setTaskState(event.taskId, decision.state).pipe(Effect.ignore)
        return
      }
      if (decision._tag === "close") {
        // Closing a thread that was never open, or is already closed, is noise.
        if (coordination === undefined || coordination.state === "closed") return
        yield* events.append({
          type: "coordination.closed",
          actor: SYSTEM,
          idempotencyKey: `close:${event.id}:${decision.reason}`,
          correlationId: event.correlationId,
          missionId: event.missionId,
          taskId: event.taskId,
          payload: { reason: decision.reason },
        })
        return
      }
      yield* events.append({
        type: "coordination.attention",
        actor: SYSTEM,
        idempotencyKey: `attention:${decision.dedupe}`,
        correlationId: event.correlationId,
        missionId: event.missionId,
        taskId: event.taskId,
        payload: { title: decision.title, body: decision.body },
      })
    })

  const handle = Effect.fn("MissionCoordinator.handle")(function* (event: MissionSchema.MissionEvent) {
    const task =
      event.taskId === undefined ? Option.none() : yield* mission.getTask(event.taskId).pipe(Effect.option)
    const thread = yield* events.list({ correlationID: event.correlationId })
    const coordination = Coordination.fold(thread)
    const roster = yield* resolveRoster(event, Option.isSome(task) ? task.value : undefined)
    const target = yield* resolveBot(coordination?.targetRef)
    if (coordination && coordination.state === "open" && coordination.targetRef !== undefined && !target) {
      // Nobody answers to that name: one attention item, not a silent drop and not a retry loop.
      yield* events.append({
        type: "coordination.attention",
        actor: SYSTEM,
        idempotencyKey: `attention:missing-target:${coordination.targetRef}`,
        correlationId: event.correlationId,
        missionId: event.missionId,
        taskId: event.taskId,
        payload: {
          title: "Coordination has no target",
          body: `Nothing answers to "${coordination.targetRef}", so the message was not delivered.`,
        },
      })
    }
    const decisions = Coordination.decide({
      event,
      task: Option.isSome(task) ? taskView(task.value) : undefined,
      coordination,
      roster,
      target,
    })
    for (const decision of decisions) yield* applyDecision(event, decision, coordination)
    return decisions
  })

  // Replays everything above the cursor, in order. Callers must hold the coordinator lock.
  const drainBacklog = Effect.gen(function* () {
    let handled = 0
    for (;;) {
      const from = yield* events.cursor
      const batch = yield* events.list({ afterSeq: from, limit: 100 })
      if (batch.length === 0) return handled
      for (const event of batch) {
        yield* handle(event)
        yield* events.advanceCursor(event.seq)
        handled++
      }
    }
  })

  const emit = Effect.fn("MissionCoordinator.emit")(function* (input: MissionSchema.AppendEventInput) {
    return yield* serialized(
      Effect.gen(function* () {
        // Facts recorded by anyone else and not handled yet come first. Moving the cursor past them
        // would skip them for good (Stage 3 verifier finding), and handling them first keeps log order.
        yield* drainBacklog
        const appended = yield* events.append(input)
        if (!appended.inserted)
          return { event: appended.event, inserted: false, decisions: [] as ReadonlyArray<Coordination.Decision> }
        const decisions = yield* handle(appended.event)
        // Handled live, so the cursor moves past it, but only when nothing unhandled sits between the
        // cursor and this row (another process may have appended after the backlog drain). Otherwise the
        // next drain handles the gap and replays this row too, which is safe: every effect is keyed.
        if ((yield* events.cursor) === appended.event.seq - 1) yield* events.advanceCursor(appended.event.seq)
        return { event: appended.event, inserted: true, decisions }
      }),
    )
  })

  const drain = Effect.suspend(() => serialized(drainBacklog))

  return { emit, handle, drain, cursor: events.cursor }
})

export const layer = Layer.effect(Service, make())

/**
 * The production waker: a queued synthetic inbox item on the bot's own session. Nothing about the
 * agent loop is duplicated here; the inbox row is what a normal message would be.
 */
export const waker = Layer.effect(
  WakerService,
  Effect.gen(function* () {
    const inbox = yield* SessionInbox.Service
    const mission = yield* MissionService
    const wake = Effect.fn("MissionWaker.wake")(function* (input: WakeInput) {
      if (input.missionID === undefined) return "no-session" as const
      const bot = yield* mission.getBot(input.botID).pipe(Effect.option)
      if (Option.isNone(bot)) return "no-session" as const
      const sessions = yield* mission.listMissionSessions(input.missionID)
      const session = sessions.find((entry) => entry.participant === bot.value.slug)
      if (session === undefined) return "no-session" as const
      const id = SessionMessage.ID.make("msg_" + Coordination.fingerprint(input.key))
      yield* inbox
        .admit({
          id,
          sessionID: SessionSchema.ID.make(session.sessionID),
          item: {
            type: "synthetic",
            payload: {
              text: input.reason,
              description: `Mission ${input.purpose}`,
              metadata: {
                missionWake: input.key,
                correlation: input.correlationID,
                task: input.taskID,
                sourceEvent: input.sourceEventID,
              },
            },
            delivery: "queue",
          },
        })
        .pipe(Effect.orDie)
      return "delivered" as const
    })
    return { wake }
  }),
)

export const wakerNode = makeGlobalNode({
  service: WakerService,
  layer: waker,
  deps: [missionNode, SessionInbox.node],
})

export const node = makeGlobalNode({ service: Service, layer, deps: [missionNode, MissionEvents.node, wakerNode] })
