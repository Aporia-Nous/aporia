import { Schema } from "effect"

export class FlowInvalidError extends Schema.TaggedError<FlowInvalidError>()("Flow.Invalid", {
  problems: Schema.Array(Schema.String),
}) {}

export class FlowNotFoundError extends Schema.TaggedError<FlowNotFoundError>()("Flow.NotFound", {
  flowId: Schema.String,
}) {}

export class FlowRunNotFoundError extends Schema.TaggedError<FlowRunNotFoundError>()("Flow.RunNotFound", {
  runId: Schema.String,
}) {}
