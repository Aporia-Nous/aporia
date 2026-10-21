import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/http-api"
import { FlowInvalidError, FlowNotFoundError, FlowRunNotFoundError } from "../errors.js"

// Aporetic's native flow engine, stage 1. Global (no location): flows live in the app's mission log.
// A definition is plain JSON validated by the engine; the schema here only says "a JSON object".

const JsonObject = Schema.Record(Schema.String, Schema.Json)

export const FlowRunStatus = Schema.Literals(["running", "waiting", "needs-attention", "completed", "failed"])
export const FlowStepStatus = Schema.Literals([
  "pending",
  "running",
  "waiting",
  "succeeded",
  "failed",
  "skipped",
  "needs-attention",
])

const runFields = {
  runId: Schema.String,
  flowId: Schema.String,
  version: Schema.Number,
  status: FlowRunStatus,
  trigger: Schema.String,
  requestedAt: Schema.Number,
  endedAt: Schema.optional(Schema.Number),
  tokens: Schema.Number,
  error: Schema.optional(Schema.String),
}

export const FlowRunSummary = Schema.Struct(runFields).annotate({ identifier: "Flow.RunSummary" })

export const FlowSummary = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.optional(Schema.String),
  version: Schema.Number,
  steps: Schema.Number,
  updatedAt: Schema.Number,
  lastRun: Schema.optional(FlowRunSummary),
}).annotate({ identifier: "Flow.Summary" })

export const FlowStepView = Schema.Struct({
  id: Schema.String,
  type: Schema.String,
  name: Schema.optional(Schema.String),
  status: FlowStepStatus,
  attempts: Schema.Number,
  startedAt: Schema.optional(Schema.Number),
  endedAt: Schema.optional(Schema.Number),
  tokens: Schema.Number,
  error: Schema.optional(Schema.String),
  output: Schema.optional(Schema.String),
}).annotate({ identifier: "Flow.StepView" })

export const FlowRunDetail = Schema.Struct({
  ...runFields,
  flowName: Schema.String,
  output: Schema.optional(Schema.String),
  steps: Schema.Array(FlowStepView),
}).annotate({ identifier: "Flow.RunDetail" })

export const FlowRunnerStatus = Schema.Struct({
  running: Schema.Boolean,
  ticks: Schema.Number,
  actions: Schema.Number,
  lastActionAt: Schema.optional(Schema.Number),
  lastError: Schema.optional(Schema.String),
}).annotate({ identifier: "Flow.RunnerStatus" })

export const FlowGroup = HttpApiGroup.make("server.flow")
  .add(
    HttpApiEndpoint.get("flow.list", "/api/flow", {
      success: Schema.Struct({ data: Schema.Array(FlowSummary), runner: FlowRunnerStatus }),
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "flow.list",
        summary: "List flows",
        description: "Every saved flow at its latest version, with its most recent run and the runner's status.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.get("flow.get", "/api/flow/:flowID", {
      params: { flowID: Schema.String },
      success: Schema.Struct({ data: Schema.Struct({ definition: JsonObject, version: Schema.Number }) }),
      error: FlowNotFoundError,
    }).annotateMerge(
      OpenApi.annotations({ identifier: "flow.get", summary: "Get flow", description: "A flow's latest definition." }),
    ),
  )
  .add(
    HttpApiEndpoint.post("flow.save", "/api/flow", {
      payload: Schema.Struct({ definition: JsonObject }),
      success: Schema.Struct({
        data: Schema.Struct({ id: Schema.String, version: Schema.Number, created: Schema.Boolean }),
      }),
      error: FlowInvalidError,
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "flow.save",
        summary: "Save flow",
        description:
          "Validate and save a flow definition as a new version. Saving an identical definition returns the current version.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.post("flow.start", "/api/flow/:flowID/run", {
      params: { flowID: Schema.String },
      payload: Schema.Struct({
        requestId: Schema.String,
        input: Schema.optional(JsonObject),
        trigger: Schema.optional(Schema.Literals(["manual", "slash"])),
      }),
      success: Schema.Struct({ data: Schema.Struct({ runId: Schema.String, created: Schema.Boolean }) }),
      error: [FlowNotFoundError, FlowInvalidError],
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "flow.start",
        summary: "Run flow",
        description:
          "Request a run of a flow's latest version. Idempotent per requestId: the same request returns the same run. The runner starts it within a second.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.get("flow.run.list", "/api/flow-runs", {
      query: Schema.Struct({ flowID: Schema.optional(Schema.String), limit: Schema.optional(Schema.String) }),
      success: Schema.Struct({ data: Schema.Array(FlowRunSummary) }),
    }).annotateMerge(
      OpenApi.annotations({ identifier: "flow.run.list", summary: "List flow runs", description: "Recent runs, newest first." }),
    ),
  )
  .add(
    HttpApiEndpoint.get("flow.run.get", "/api/flow-runs/:runID", {
      params: { runID: Schema.String },
      success: Schema.Struct({ data: FlowRunDetail }),
      error: FlowRunNotFoundError,
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "flow.run.get",
        summary: "Get flow run",
        description: "One run with its step timeline.",
      }),
    ),
  )
  .annotateMerge(OpenApi.annotations({ title: "flow", description: "Native flow engine routes." }))
