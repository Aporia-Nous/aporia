import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/http-api"
import { AttentionCardNotFoundError } from "../errors.js"

// Aporetic mission coordination: the attention cards the coordinator raises and the trigger that
// runs it. Global (no location): the coordination log belongs to the whole app, not to one project.

/** A person's note when resolving a card. Bounded so one request cannot write an unbounded fact into the log. */
export const RESOLUTION_MAX_LENGTH = 2000

export const AttentionCard = Schema.Struct({
  id: Schema.String,
  key: Schema.String,
  title: Schema.String,
  body: Schema.String,
  state: Schema.Literals(["open", "resolved"]),
  correlationId: Schema.String,
  missionId: Schema.optional(Schema.String),
  taskId: Schema.optional(Schema.String),
  createdAt: Schema.Number,
  resolvedAt: Schema.optional(Schema.Number),
  resolvedBy: Schema.optional(Schema.String),
  resolution: Schema.optional(Schema.String),
})

export const CoordinatorStatus = Schema.Struct({
  running: Schema.Boolean,
  cursor: Schema.Number,
  latest: Schema.Number,
  drains: Schema.Number,
  handled: Schema.Number,
  lastDrainAt: Schema.optional(Schema.Number),
  lastError: Schema.optional(Schema.String),
})

export const MissionGroup = HttpApiGroup.make("server.mission")
  .add(
    HttpApiEndpoint.get("mission.attention.list", "/api/mission/attention", {
      query: Schema.Struct({
        state: Schema.optional(Schema.Literals(["open", "resolved", "all"])),
        missionID: Schema.optional(Schema.String),
      }),
      success: Schema.Struct({ data: Schema.Array(AttentionCard), coordinator: CoordinatorStatus }),
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "mission.attention.list",
        summary: "List attention cards",
        description:
          "Attention cards folded from the mission log, newest first (open only by default), with the coordinator trigger's status.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.post("mission.attention.resolve", "/api/mission/attention/:cardID/resolve", {
      params: { cardID: Schema.String },
      payload: Schema.Struct({
        resolution: Schema.optional(Schema.String.check(Schema.isMaxLength(RESOLUTION_MAX_LENGTH))),
      }),
      success: Schema.Struct({ data: AttentionCard }),
      error: AttentionCardNotFoundError,
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "mission.attention.resolve",
        summary: "Resolve attention card",
        description:
          "Record that a person dealt with an attention card. Idempotent: resolving a resolved card returns it unchanged. Resolving never wakes anybody.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.post("mission.coordinator.drain", "/api/mission/coordinator/drain", {
      success: Schema.Struct({ handled: Schema.Number, coordinator: CoordinatorStatus }),
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "mission.coordinator.drain",
        summary: "Drain the coordinator now",
        description:
          "Run one trigger tick immediately instead of waiting for the next poll. Does nothing when the log is not ahead of the cursor.",
      }),
    ),
  )
  .annotateMerge(OpenApi.annotations({ title: "mission", description: "Mission coordination routes." }))
