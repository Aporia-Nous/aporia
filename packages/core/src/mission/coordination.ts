export * as Coordination from "./coordination.js"

import { MissionSchema } from "./schema.js"

// Pure rules for the coordination layer. Nothing here reads the database, the clock or a random
// source, so every rule below is testable by handing it a fixed list of events.
//
// Two invariants shape the whole file:
//   1. An outcome never causes another outcome. Wakes, attention items and closes are results;
//      `ack` is not news. So a wake cannot wake a wake, and an ack cannot ask for an ack.
//   2. Finishing is a wall. A verified or cancelled task is not woken again for ordinary progress.
//      The one exception is new failing evidence (`review.failed`), because that is precisely what
//      reopens the work as a new revision.
//
// There is no message cap anywhere. A thread closes because it finished, was superseded, or made no
// progress; length alone is never a reason.

/** A coordination thread is one task-scoped conversation, identified by its correlation id. */
export interface View {
  readonly correlationId: MissionSchema.CorrelationID
  readonly missionId?: MissionSchema.MissionID
  readonly taskId?: MissionSchema.TaskID
  readonly purpose: MissionSchema.CoordinationPurpose
  readonly state: MissionSchema.CoordinationState
  readonly closureReason?: MissionSchema.ClosureReason
  /**
   * Who opened the thread and who it is addressed to, as the event named them (a slug or an id).
   * The rules do not brand these: resolving a name to a bot is the coordinator's job, because only
   * it can read the roster.
   */
  readonly openerRef?: string
  readonly targetRef?: string
  /** Total messages so far. A count for humans, never a limit for the machine. */
  readonly messages: number
  /** Consecutive messages that carried no new information. Any new content resets it to 0. */
  readonly noProgress: number
  readonly lastFingerprint?: string
}

export interface TaskView {
  readonly id: MissionSchema.TaskID
  readonly title: string
  readonly state: MissionSchema.TaskState
  readonly ownerId?: MissionSchema.BotID
}

export interface Roster {
  readonly owner?: MissionSchema.BotID
  readonly reviewer?: MissionSchema.BotID
  readonly verifier?: MissionSchema.BotID
}

export type Decision =
  | {
      readonly _tag: "wake"
      readonly botID: MissionSchema.BotID
      readonly purpose: MissionSchema.CoordinationPurpose
      readonly reason: string
    }
  | {
      /** `task.created` is the one event that creates work; its id is derived from the event key. */
      readonly _tag: "task"
      readonly id: MissionSchema.TaskID
      readonly missionId: MissionSchema.MissionID
      readonly title: string
      readonly ownerId?: MissionSchema.BotID
    }
  | { readonly _tag: "transition"; readonly state: MissionSchema.TaskState; readonly reason: string }
  | { readonly _tag: "close"; readonly reason: MissionSchema.ClosureReason; readonly dedupe?: string }
  | {
      readonly _tag: "attention"
      readonly title: string
      readonly body: string
      /** Stable identity of the thing being flagged, so the same approval never yields two items. */
      readonly dedupe: string
    }

export interface DecideInput {
  readonly event: MissionSchema.MissionEvent
  readonly task?: TaskView
  readonly coordination?: View
  readonly roster: Roster
  /** The coordinator's resolution of `coordination.targetRef`; the rules never guess it. */
  readonly target?: MissionSchema.BotID
  readonly policy?: { readonly noProgressLimit?: number }
}

export const NO_PROGRESS_LIMIT = 3

/** Results, not causes. These never produce a decision, whatever their payload says. */
const OUTCOMES: ReadonlySet<MissionSchema.MissionEventType> = new Set<MissionSchema.MissionEventType>([
  "coordination.wake",
  "coordination.attention",
  "coordination.closed",
  "ack",
  // A person resolving a card: recorded, folded into the card, and never a cause of more work.
  "attention.resolved",
  // The flow engine's record (src/flow). The runner acts on these; the coordinator never does.
  "flow.saved",
  "flow.run.requested",
  "flow.step.started",
  "flow.step.succeeded",
  "flow.step.failed",
  "flow.run.completed",
  "flow.run.failed",
])

/** The only events allowed to start work on an already-finished task. */
const REOPENS_TERMINAL: ReadonlySet<MissionSchema.MissionEventType> = new Set<MissionSchema.MissionEventType>([
  "task.reopened",
  "review.failed",
])

/** Stable, dependency-free hash so a rule can ask "is this the same message again?". */
export const fingerprint = (...parts: ReadonlyArray<string | undefined>): string => {
  const input = parts.map((part) => part ?? "").join("\u0000")
  let hash = 0x811c9dc5
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, "0")
}

const stringOf = (event: MissionSchema.MissionEvent, key: string): string | undefined => {
  const value = event.payload[key]
  return typeof value === "string" && value.length > 0 ? value : undefined
}

const purposeOf = (event: MissionSchema.MissionEvent): MissionSchema.CoordinationPurpose | undefined => {
  const value = stringOf(event, "purpose")
  const purposes: ReadonlyArray<string> = MissionSchema.CoordinationPurpose.literals
  return value !== undefined && purposes.includes(value) ? (value as MissionSchema.CoordinationPurpose) : undefined
}

const reasonOf = (event: MissionSchema.MissionEvent): MissionSchema.ClosureReason | undefined => {
  const value = stringOf(event, "reason")
  const reasons: ReadonlyArray<string> = MissionSchema.ClosureReason.literals
  return value !== undefined && reasons.includes(value) ? (value as MissionSchema.ClosureReason) : undefined
}

const refOf = (actor: MissionSchema.Actor): string | undefined =>
  actor.kind === "bot" && actor.id !== undefined ? actor.id : undefined

const message = (view: View, event: MissionSchema.MissionEvent, ack: boolean): View => {
  if (view.state === "closed") return view
  const purpose = purposeOf(event) ?? view.purpose
  const text = stringOf(event, "text") ?? stringOf(event, "reference")
  const target = stringOf(event, "target")
  // What was said, not which event carried it: a thread that opens with a question and then repeats
  // it verbatim has said one thing once.
  const print = fingerprint(purpose, text, target ?? "")
  // An ack carries no information by definition, so a stream of them can never reset the counter.
  const repeat = ack || print === view.lastFingerprint
  return {
    ...view,
    purpose,
    targetRef: target ?? view.targetRef,
    messages: view.messages + 1,
    noProgress: repeat ? view.noProgress + 1 : 0,
    lastFingerprint: print,
  }
}

/**
 * Rebuild a thread by folding its events in order. Deriving the view instead of storing one keeps a
 * restart honest: the same log always folds to the same thread, so a replay cannot drift.
 */
export const fold = (events: ReadonlyArray<MissionSchema.MissionEvent>): View | undefined => {
  let view: View | undefined
  for (const event of events) {
    if (event.type === "coordination.opened") {
      if (view) {
        view = message(view, event, false)
        continue
      }
      const purpose = purposeOf(event) ?? "request"
      view = {
        correlationId: event.correlationId,
        missionId: event.missionId,
        taskId: event.taskId,
        purpose,
        state: "open",
        openerRef: refOf(event.actor),
        targetRef: stringOf(event, "target"),
        messages: 1,
        noProgress: 0,
        lastFingerprint: fingerprint(purpose, stringOf(event, "text") ?? "", stringOf(event, "target") ?? ""),
      }
      continue
    }
    if (!view) continue
    if (event.type === "coordination.message" || event.type === "ack") {
      view = message(view, event, event.type === "ack")
      continue
    }
    if (event.type === "coordination.closed") {
      view = { ...view, state: "closed", closureReason: reasonOf(event) ?? "completed" }
    }
  }
  return view
}

const attention = (title: string, body: string, dedupe: string): Decision => ({ _tag: "attention", title, body, dedupe })

const wake = (
  botID: MissionSchema.BotID,
  purpose: MissionSchema.CoordinationPurpose,
  reason: string,
): Decision => ({ _tag: "wake", botID, purpose, reason })

export const decide = (input: DecideInput): ReadonlyArray<Decision> => {
  const { event, task, coordination, roster } = input
  const owner = roster.owner ?? task?.ownerId

  if (OUTCOMES.has(event.type)) return []
  if (task && MissionSchema.isTerminalTask(task.state) && !REOPENS_TERMINAL.has(event.type)) return []

  if (event.type === "coordination.opened" || event.type === "coordination.message") {
    if (!coordination) return []
    const limit = input.policy?.noProgressLimit ?? NO_PROGRESS_LIMIT
    // Coalesce a repeat; escalate once when the thread keeps saying the same thing.
    if (coordination.noProgress >= limit)
      return [
        attention(
          "Coordination is not progressing",
          `Thread ${coordination.correlationId} repeated itself ${coordination.noProgress} times with nothing new.`,
          `no-progress:${coordination.correlationId}:${coordination.noProgress}`,
        ),
        { _tag: "close", reason: "no-progress", dedupe: `no-progress:${coordination.correlationId}` },
      ]
    if (coordination.noProgress > 0) return []
    // A decision is recorded for the record; it does not need another turn.
    if (coordination.purpose === "decision") return []
    if (!input.target) return []
    return [
      wake(
        input.target,
        coordination.purpose,
        `Coordination ${coordination.purpose} on ${coordination.taskId ?? coordination.correlationId}.`,
      ),
    ]
  }

  switch (event.type) {
    case "task.created": {
      // The one event that creates work. The id is derived from the event's idempotency key, so a
      // replay asks for the same task instead of a second one.
      if (event.missionId === undefined)
        return [
          attention(
            "A task arrived without a mission",
            "task.created was recorded with no mission, so it was not created.",
            `task-no-mission:${event.id}`,
          ),
        ]
      return [
        {
          _tag: "task",
          id: MissionSchema.TaskID.make("task_" + fingerprint("task.created", event.idempotencyKey)),
          missionId: event.missionId,
          title: stringOf(event, "title") ?? "Untitled task",
          ownerId: owner,
        },
      ]
    }
    case "artifact.created":
      return roster.reviewer
        ? [wake(roster.reviewer, "request", "A new artifact is ready for review.")]
        : [
            attention(
              "No reviewer for this mission",
              "An artifact was created but no reviewer is assigned, so nobody was woken.",
              `missing-reviewer:${event.id}`,
            ),
          ]
    case "review.passed":
      return roster.verifier
        ? [wake(roster.verifier, "request", "A review passed; verify the work.")]
        : [
            attention(
              "No verifier for this mission",
              "A review passed but no verifier is assigned, so nobody was woken.",
              `missing-verifier:${event.id}`,
            ),
          ]
    case "review.failed": {
      const finding = stringOf(event, "finding") ?? stringOf(event, "text") ?? "no finding supplied"
      const decisions: Decision[] = [{ _tag: "close", reason: "superseded", dedupe: `review-failed:${event.id}` }]
      if (task) decisions.push({ _tag: "transition", state: "in_progress", reason: `Review failed: ${finding}` })
      if (owner) decisions.push(wake(owner, "result", `Review failed: ${finding}`))
      else
        decisions.push(
          attention(
            "Review failed with nobody to hand it back to",
            `The task has no builder: ${finding}`,
            `no-builder:${event.id}`,
          ),
        )
      return decisions
    }
    case "approval.required": {
      const approval = stringOf(event, "approvalId") ?? event.idempotencyKey
      return [
        attention(
          "Approval needed",
          stringOf(event, "text") ?? "Work is waiting on a person.",
          `approval:${approval}`,
        ),
      ]
    }
    case "approval.granted":
      return owner
        ? [wake(owner, "request", "Approval was granted; resume the work.")]
        : [
            attention(
              "Approval granted with nobody to resume",
              "No builder owns this task, so the resumed work has no owner.",
              `approval-granted:${stringOf(event, "approvalId") ?? event.idempotencyKey}`,
            ),
          ]
    case "task.reopened":
      return owner ? [wake(owner, "request", "The task was reopened; start a new revision.")] : []
    case "task.verified":
      return [{ _tag: "close", reason: "completed", dedupe: `verified:${event.taskId ?? event.id}` }]
    case "task.cancelled":
      return [{ _tag: "close", reason: "cancelled", dedupe: `cancelled:${event.taskId ?? event.id}` }]
    default:
      return []
  }
}
