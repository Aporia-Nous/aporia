import { Flow } from "@opencode/core/flow"
import { FlowInvalidError, FlowNotFoundError, FlowRunNotFoundError } from "@opencode/protocol/errors"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { Api } from "../api"

const invalid = (error: Flow.FlowInvalidError) =>
  Effect.fail(
    new FlowInvalidError({
      message: `Invalid flow: ${error.problems.slice(0, 5).join("; ")}${error.problems.length > 5 ? " ..." : ""}`,
      problems: error.problems,
    }),
  )

const notFound = (error: Flow.FlowNotFoundError) =>
  Effect.fail(new FlowNotFoundError({ id: error.flowId, message: `Flow not found: ${error.flowId}` }))

export const FlowHandler = HttpApiBuilder.group(Api, "server.flow", (handlers) =>
  handlers
    .handle(
      "flow.list",
      Effect.fn(function* () {
        const flows = yield* Flow.Flows.Service
        const runner = yield* Flow.FlowRunner.Service
        return { data: yield* flows.list, runner: yield* runner.status }
      }),
    )
    .handle(
      "flow.get",
      Effect.fn(function* (ctx) {
        const flows = yield* Flow.Flows.Service
        const found = yield* flows.get(ctx.params.flowID).pipe(Effect.catchTag("Flow.NotFound", notFound))
        return { data: { definition: found.definition as never, version: found.version } }
      }),
    )
    .handle(
      "flow.save",
      Effect.fn(function* (ctx) {
        const flows = yield* Flow.Flows.Service
        const data = yield* flows.save(ctx.payload.definition).pipe(Effect.catchTag("Flow.Invalid", invalid))
        return { data }
      }),
    )
    .handle(
      "flow.start",
      Effect.fn(function* (ctx) {
        const flows = yield* Flow.Flows.Service
        const data = yield* flows
          .requestRun({
            flowId: ctx.params.flowID,
            requestId: ctx.payload.requestId,
            input: ctx.payload.input as Flow.FlowExpr.Item | undefined,
            trigger: ctx.payload.trigger ?? "manual",
          })
          .pipe(Effect.catchTag("Flow.NotFound", notFound), Effect.catchTag("Flow.Invalid", invalid))
        return { data }
      }),
    )
    .handle(
      "flow.run.list",
      Effect.fn(function* (ctx) {
        const flows = yield* Flow.Flows.Service
        const limit = ctx.query.limit === undefined ? undefined : Number.parseInt(ctx.query.limit, 10)
        const data = yield* flows.runs({
          flowId: ctx.query.flowID,
          limit: limit === undefined || Number.isNaN(limit) ? undefined : limit,
        })
        return { data }
      }),
    )
    .handle(
      "flow.run.get",
      Effect.fn(function* (ctx) {
        const flows = yield* Flow.Flows.Service
        const data = yield* flows
          .run(ctx.params.runID)
          .pipe(
            Effect.catchTag("Flow.RunNotFound", (error) =>
              Effect.fail(new FlowRunNotFoundError({ id: error.runId, message: `Flow run not found: ${error.runId}` })),
            ),
          )
        return { data }
      }),
    ),
)
