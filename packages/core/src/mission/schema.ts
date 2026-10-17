export * as MissionSchema from "./schema.js"

import { Schema } from "effect"
import { Identifier } from "@opencode/schema/identifier"
import { SessionID } from "@opencode/schema/session-id"
import { NonNegativeInt, optional, PositiveInt, statics } from "../schema.js"

// Durable Aporetic domain: Bots, Teams, Missions, Tasks.
//
// Identity is split in two on purpose:
//   * `id` is stable and never reused. Work (tasks, missions, sessions) points at it.
//   * `slug` is the natural key carried over from the file store. It is immutable once assigned,
//     so a rename only touches `name` and every existing reference keeps resolving.
// Backfilled rows derive `id` from the slug (`bot_alpha`), which is what makes a repeated backfill
// an upsert instead of a duplicate.

// Effect's `isStartingWith`/`brand` only accept literals, so each id states its own prefix.
// Ids are time-ordered (ascending), which keeps inserts local in the b-tree and sorts by creation.

export const BotID = Schema.String.check(Schema.isStartingWith("bot")).pipe(
  Schema.brand("BotID"),
  Schema.annotate({ identifier: "Bot.ID" }),
  statics((schema) => {
    const create = () => schema.make("bot_" + Identifier.ascending())
    return { create, ascending: (id?: string) => (id === undefined ? create() : schema.make(id)) }
  }),
)
export type BotID = typeof BotID.Type

export const TeamID = Schema.String.check(Schema.isStartingWith("team")).pipe(
  Schema.brand("TeamID"),
  Schema.annotate({ identifier: "Team.ID" }),
  statics((schema) => {
    const create = () => schema.make("team_" + Identifier.ascending())
    return { create, ascending: (id?: string) => (id === undefined ? create() : schema.make(id)) }
  }),
)
export type TeamID = typeof TeamID.Type

export const MissionID = Schema.String.check(Schema.isStartingWith("mis")).pipe(
  Schema.brand("MissionID"),
  Schema.annotate({ identifier: "Mission.ID" }),
  statics((schema) => {
    const create = () => schema.make("mis_" + Identifier.ascending())
    return { create, ascending: (id?: string) => (id === undefined ? create() : schema.make(id)) }
  }),
)
export type MissionID = typeof MissionID.Type

export const TaskID = Schema.String.check(Schema.isStartingWith("task")).pipe(
  Schema.brand("TaskID"),
  Schema.annotate({ identifier: "Task.ID" }),
  statics((schema) => {
    const create = () => schema.make("task_" + Identifier.ascending())
    return { create, ascending: (id?: string) => (id === undefined ? create() : schema.make(id)) }
  }),
)
export type TaskID = typeof TaskID.Type

export const Slug = Schema.String.check(Schema.isPattern(/^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/u)).annotate({
  identifier: "Mission.Slug",
  description: "One path-safe segment, shaped like the file store's slugify() output",
})

export const Time = Schema.Struct({
  created: NonNegativeInt,
  updated: NonNegativeInt,
  archived: optional(NonNegativeInt),
}).annotate({ identifier: "Mission.Time" })
export interface Time extends Schema.Schema.Type<typeof Time> {}

/** Tool-name -> allow/ask/deny. An empty record inherits the engine's configured permissions. */
export const Permission = Schema.Literals(["allow", "ask", "deny"])
export type Permission = typeof Permission.Type
export const Permissions = Schema.Record(Schema.String, Permission)
export type Permissions = typeof Permissions.Type

export const BotKind = Schema.Literals(["expert", "worker"])
export type BotKind = typeof BotKind.Type

export const Bot = Schema.Struct({
  id: BotID,
  slug: Slug,
  name: Schema.String,
  role: Schema.String,
  avatar: optional(Schema.String),
  instructions: Schema.String,
  model: Schema.String,
  /** Enabled tools for this bot. Membership is the allowlist; per-tool decisions live in `permissions`. */
  tools: Schema.Array(Schema.String),
  mcps: Schema.Array(Schema.String),
  skills: Schema.Array(Schema.String),
  voice: optional(Schema.String),
  /** Where memory is read from: "bot" (own MEMORY.md) and/or "user" (shared USER.md). */
  memoryScope: Schema.Array(Schema.String),
  permissions: Permissions,
  kind: optional(BotKind),
  time: Time,
}).annotate({ identifier: "Bot" })
export interface Bot extends Schema.Schema.Type<typeof Bot> {}

export const Team = Schema.Struct({
  id: TeamID,
  slug: Slug,
  name: Schema.String,
  /** The bot that runs the team's coordination turns. Optional: a team can exist before it has one. */
  coordinatorId: optional(BotID),
  /** View field assembled from the membership table, ordered by join time. */
  members: Schema.Array(BotID),
  time: Time,
}).annotate({ identifier: "Team" })
export interface Team extends Schema.Schema.Type<typeof Team> {}

export const MissionState = Schema.Literals(["active", "paused", "done", "archived"])
export type MissionState = typeof MissionState.Type
/** Where a mission came from, so a backfilled container is never mistaken for user work. */
export const MissionOrigin = Schema.Literals(["manual", "room", "import"])
export type MissionOrigin = typeof MissionOrigin.Type

export const Mission = Schema.Struct({
  id: MissionID,
  title: Schema.String,
  state: MissionState,
  origin: MissionOrigin,
  teamId: optional(TeamID),
  /** View field assembled from the mission<>session link table, oldest link first. */
  sessionIds: Schema.Array(SessionID),
  time: Time,
}).annotate({ identifier: "Mission" })
export interface Mission extends Schema.Schema.Type<typeof Mission> {}

/**
 * pending -> someone still has to start; blocked -> waiting on a dependency, a decision or a human;
 * in_progress -> being worked; review -> work exists and waits for a reviewer; verified -> proof
 * accepted; cancelled -> dropped. Terminal states are verified and cancelled.
 */
export const TaskState = Schema.Literals(["pending", "blocked", "in_progress", "review", "verified", "cancelled"])
export type TaskState = typeof TaskState.Type
export const TERMINAL_TASK_STATES: ReadonlyArray<TaskState> = ["verified", "cancelled"]
export const isTerminalTask = (state: TaskState) => TERMINAL_TASK_STATES.includes(state)

export const Task = Schema.Struct({
  id: TaskID,
  missionId: MissionID,
  title: Schema.String,
  state: TaskState,
  ownerId: optional(BotID),
  /** Task ids this task waits on. A task with an unfinished dependency cannot start. */
  dependsOn: Schema.Array(TaskID),
  /** Bumped whenever the task is reassigned or reopened; evidence is attached per revision later. */
  revision: PositiveInt,
  time: Time,
}).annotate({ identifier: "Task" })
export interface Task extends Schema.Schema.Type<typeof Task> {}

/**
 * Per-mission UI state, deliberately separate from work state: a draft, a scroll position and a
 * selected artifact describe one window's view, never the job. Losing this row loses no work.
 */
export const UIState = Schema.Struct({
  missionId: MissionID,
  draft: optional(Schema.String),
  /** Opaque client blob (anchor message id + offset). The server never interprets it. */
  scroll: optional(Schema.Json),
  selectedArtifact: optional(Schema.String),
  selectedBotId: optional(BotID),
  time: Time,
}).annotate({ identifier: "Mission.UIState" })
export interface UIState extends Schema.Schema.Type<typeof UIState> {}

// ---- inputs ---------------------------------------------------------------------------------

export const CreateBotInput = Schema.Struct({
  name: Schema.String,
  slug: optional(Slug),
  id: optional(BotID),
  role: optional(Schema.String),
  avatar: optional(Schema.String),
  instructions: optional(Schema.String),
  model: optional(Schema.String),
  tools: optional(Schema.Array(Schema.String)),
  mcps: optional(Schema.Array(Schema.String)),
  skills: optional(Schema.Array(Schema.String)),
  voice: optional(Schema.String),
  memoryScope: optional(Schema.Array(Schema.String)),
  permissions: optional(Permissions),
  kind: optional(BotKind),
}).annotate({ identifier: "Bot.CreateInput" })
export interface CreateBotInput extends Schema.Schema.Type<typeof CreateBotInput> {}

export const UpdateBotInput = Schema.Struct({
  name: optional(Schema.String),
  role: optional(Schema.String),
  avatar: optional(Schema.String),
  instructions: optional(Schema.String),
  model: optional(Schema.String),
  tools: optional(Schema.Array(Schema.String)),
  mcps: optional(Schema.Array(Schema.String)),
  skills: optional(Schema.Array(Schema.String)),
  voice: optional(Schema.String),
  memoryScope: optional(Schema.Array(Schema.String)),
  permissions: optional(Permissions),
  kind: optional(BotKind),
}).annotate({ identifier: "Bot.UpdateInput" })
export interface UpdateBotInput extends Schema.Schema.Type<typeof UpdateBotInput> {}

export const ArchiveBotInput = Schema.Struct({
  /** Move every non-terminal task this bot owns to another bot before archiving it. */
  reassignTo: optional(BotID),
}).annotate({ identifier: "Bot.ArchiveInput" })
export interface ArchiveBotInput extends Schema.Schema.Type<typeof ArchiveBotInput> {}

export const CreateTeamInput = Schema.Struct({
  name: Schema.String,
  slug: optional(Slug),
  id: optional(TeamID),
  coordinatorId: optional(BotID),
  members: optional(Schema.Array(BotID)),
}).annotate({ identifier: "Team.CreateInput" })
export interface CreateTeamInput extends Schema.Schema.Type<typeof CreateTeamInput> {}

export const CreateMissionInput = Schema.Struct({
  title: Schema.String,
  id: optional(MissionID),
  state: optional(MissionState),
  origin: optional(MissionOrigin),
  teamId: optional(TeamID),
  sessionIds: optional(Schema.Array(SessionID)),
}).annotate({ identifier: "Mission.CreateInput" })
export interface CreateMissionInput extends Schema.Schema.Type<typeof CreateMissionInput> {}

export const CreateTaskInput = Schema.Struct({
  missionId: MissionID,
  title: Schema.String,
  id: optional(TaskID),
  state: optional(TaskState),
  ownerId: optional(BotID),
  dependsOn: optional(Schema.Array(TaskID)),
}).annotate({ identifier: "Task.CreateInput" })
export interface CreateTaskInput extends Schema.Schema.Type<typeof CreateTaskInput> {}

export const SaveUIStateInput = Schema.Struct({
  missionId: MissionID,
  draft: optional(Schema.String),
  scroll: optional(Schema.Json),
  selectedArtifact: optional(Schema.String),
  selectedBotId: optional(BotID),
}).annotate({ identifier: "Mission.SaveUIStateInput" })
export interface SaveUIStateInput extends Schema.Schema.Type<typeof SaveUIStateInput> {}

// ---- events and coordination ----------------------------------------------------------------

export const MissionEventID = Schema.String.check(Schema.isStartingWith("evt")).pipe(
  Schema.brand("MissionEventID"),
  Schema.annotate({ identifier: "Mission.EventID" }),
  statics((schema) => {
    const create = () => schema.make("evt_" + Identifier.ascending())
    return { create, ascending: (id?: string) => (id === undefined ? create() : schema.make(id)) }
  }),
)
export type MissionEventID = typeof MissionEventID.Type

/** One causal chain: the events a single piece of work and its follow-ups share. */
export const CorrelationID = Schema.String.check(Schema.isStartingWith("cor")).pipe(
  Schema.brand("CorrelationID"),
  Schema.annotate({ identifier: "Mission.CorrelationID" }),
  statics((schema) => {
    const create = () => schema.make("cor_" + Identifier.ascending())
    return { create, ascending: (id?: string) => (id === undefined ? create() : schema.make(id)) }
  }),
)
export type CorrelationID = typeof CorrelationID.Type

/**
 * Every kind of fact the coordination layer records. The split matters:
 *   * causes are work facts (`artifact.created`, `review.failed`, ...) and coordination messages;
 *   * outcomes are what the coordinator produced (`coordination.wake`, `coordination.attention`,
 *     `coordination.closed`) and `ack`, which is by definition not news.
 * An outcome never causes another outcome, so a wake cannot wake a wake.
 *
 * `attention.resolved` is a person closing an attention card. It is recorded like any fact, but it is
 * treated as an outcome: dealing with a card never wakes anybody.
 */
export const MissionEventType = Schema.Literals([
  "task.created",
  "task.started",
  "task.review_requested",
  "task.verified",
  "task.cancelled",
  "task.reopened",
  "artifact.created",
  "review.passed",
  "review.failed",
  "approval.required",
  "approval.granted",
  "coordination.opened",
  "coordination.message",
  "coordination.closed",
  "coordination.wake",
  "coordination.attention",
  "attention.resolved",
  "ack",
])
export type MissionEventType = typeof MissionEventType.Type

export const ActorKind = Schema.Literals(["bot", "user", "system"])
export type ActorKind = typeof ActorKind.Type

export const Actor = Schema.Struct({
  kind: ActorKind,
  /** Bot slug when kind is "bot"; a person when kind is "user"; a service name when kind is "system". */
  id: optional(Schema.String),
}).annotate({ identifier: "Mission.Actor" })
export interface Actor extends Schema.Schema.Type<typeof Actor> {}

export const MissionEvent = Schema.Struct({
  /** Monotonic position in the log. The coordinator replays from here, so it is never rewritten. */
  seq: NonNegativeInt,
  id: MissionEventID,
  missionId: optional(MissionID),
  taskId: optional(TaskID),
  correlationId: CorrelationID,
  type: MissionEventType,
  actor: Actor,
  payload: Schema.Record(Schema.String, Schema.Json),
  /** Unique per logical occurrence: replaying the same input inserts nothing and wakes nobody. */
  idempotencyKey: Schema.String,
  createdAt: NonNegativeInt,
}).annotate({ identifier: "Mission.Event" })
export interface MissionEvent extends Schema.Schema.Type<typeof MissionEvent> {}

export const AppendEventInput = Schema.Struct({
  type: MissionEventType,
  actor: Actor,
  idempotencyKey: Schema.String,
  id: optional(MissionEventID),
  missionId: optional(MissionID),
  taskId: optional(TaskID),
  correlationId: optional(CorrelationID),
  payload: optional(Schema.Record(Schema.String, Schema.Json)),
}).annotate({ identifier: "Mission.AppendEventInput" })
export interface AppendEventInput extends Schema.Schema.Type<typeof AppendEventInput> {}

/** What a coordination message is for. A record always states one of these. */
export const CoordinationPurpose = Schema.Literals(["request", "question", "result", "blocker", "handoff", "decision"])
export type CoordinationPurpose = typeof CoordinationPurpose.Type

/** Why a coordination thread ended. There is no "hit a message cap" reason: the count is not a limit. */
export const ClosureReason = Schema.Literals([
  "completed",
  "answered",
  "no-progress",
  "escalated",
  "duplicate",
  "superseded",
  "cancelled",
])
export type ClosureReason = typeof ClosureReason.Type

export const CoordinationState = Schema.Literals(["open", "closed"])
export type CoordinationState = typeof CoordinationState.Type

// ---- errors ---------------------------------------------------------------------------------

export class BotNotFoundError extends Schema.TaggedError<BotNotFoundError>()("Mission.BotNotFound", {
  botID: Schema.String,
}) {}
export class TeamNotFoundError extends Schema.TaggedError<TeamNotFoundError>()("Mission.TeamNotFound", {
  teamID: Schema.String,
}) {}
export class MissionNotFoundError extends Schema.TaggedError<MissionNotFoundError>()("Mission.MissionNotFound", {
  missionID: Schema.String,
}) {}
export class TaskNotFoundError extends Schema.TaggedError<TaskNotFoundError>()("Mission.TaskNotFound", {
  taskID: Schema.String,
}) {}
export class SlugTakenError extends Schema.TaggedError<SlugTakenError>()("Mission.SlugTaken", {
  kind: Schema.Literals(["bot", "team"]),
  slug: Schema.String,
}) {}
/**
 * Archiving a bot that still owns work is refused unless `reassignTo` names the new owner.
 * Carrying the task ids makes the refusal actionable instead of a bare failure.
 */
export class BotHasOpenTasksError extends Schema.TaggedError<BotHasOpenTasksError>()("Mission.BotHasOpenTasks", {
  botID: Schema.String,
  taskIDs: Schema.Array(Schema.String),
}) {}
export class TeamCoordinatorError extends Schema.TaggedError<TeamCoordinatorError>()("Mission.TeamCoordinator", {
  teamID: Schema.String,
  botID: Schema.String,
}) {}
export class AttentionCardNotFoundError extends Schema.TaggedError<AttentionCardNotFoundError>()(
  "Mission.AttentionCardNotFound",
  { cardID: Schema.String },
) {}
export class MissionLinkError extends Schema.TaggedError<MissionLinkError>()("Mission.Link", {
  message: Schema.String,
}) {}
