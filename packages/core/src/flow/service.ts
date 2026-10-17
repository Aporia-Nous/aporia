export * as Flows from "./service.js"

import { Clock, Context, Effect, Layer, Semaphore } from "effect"
import { makeGlobalNode } from "@opencode/util/effect/app-node"
import { MissionEvents } from "../mission/event.js"
import { MissionSchema } from "../mission/schema.js"
import { canonical, ID, validate, type Definition, type Step } from "./definition.js"
import { FlowInvalidError, FlowNotFoundError, FlowRunNotFoundError } from "./errors.js"
import { resolve, type Item, type Json } from "./expr.js"
import * as Http from "./http.js"
import * as Run from "./run.js"
import { isPure, runPure, type Outputs } from "./steps.js"

// Flows live in the mission log (provisional decision, docs/an-rewrite/FLOW1-PLAN.md): a definition
// is a `flow.saved` event per version, and a run is the `flow.*` events sharing its correlation id.
// Nothing else is stored, so a restart folds back exactly what was recorded.

export const MAX_DEPTH = 5
export const MAX_OUTPUT_CHARS = 256_000
const MAX_ACTIONS_PER_RUN = 50
const MAX_PASSES = 20
const REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/
const RUNNER: MissionSchema.Actor = { kind: "system", id: "flow-runner" }

export type Trigger = "manual" | "slash" | "subflow"

export interface Saved {
  readonly id: string
  readonly version: number
  readonly created: boolean
}

export interface RunSummary {
  readonly runId: string
  readonly flowId: string
  readonly version: number
  readonly status: Run.RunStatus
  readonly trigger: string
  readonly requestedAt: number
  readonly endedAt?: number
  readonly tokens: number
  readonly error?: string
}

export interface FlowSummary {
  readonly id: string
  readonly name: string
  readonly description?: string
  readonly version: number
  readonly steps: number
  readonly updatedAt: number
  readonly lastRun?: RunSummary
}

export interface StepView {
  readonly id: string
  readonly type: string
  readonly name?: string
  readonly status: Run.StepStatus
  readonly attempts: number
  readonly startedAt?: number
  readonly endedAt?: number
  readonly tokens: number
  readonly error?: string
  readonly output?: string
}

export interface RunDetail extends RunSummary {
  readonly flowName: string
  readonly output?: string
  readonly steps: ReadonlyArray<StepView>
}

export interface RequestInput {
  readonly flowId: string
  readonly requestId: string
  readonly input?: Item
  readonly trigger?: Trigger
  readonly by?: string
}

export interface Interface {
  readonly save: (definition: unknown, by?: string) => Effect.Effect<Saved, FlowInvalidError>
  readonly list: Effect.Effect<ReadonlyArray<FlowSummary>>
  readonly get: (flowId: string) => Effect.Effect<{ definition: Definition; version: number }, FlowNotFoundError>
  readonly requestRun: (
    input: RequestInput,
  ) => Effect.Effect<{ runId: string; created: boolean }, FlowNotFoundError | FlowInvalidError>
  readonly runs: (input?: { flowId?: string; limit?: number }) => Effect.Effect<ReadonlyArray<RunSummary>>
  readonly run: (runId: string) => Effect.Effect<RunDetail, FlowRunNotFoundError>
  /** Advance every open run as far as it can go now. Returns the number of actions taken. */
  readonly tick: Effect.Effect<number>
  /** Advance one run by at most `maxActions` actions (tests use this to stop in the middle). */
  readonly advance: (runId: string, maxActions?: number) => Effect.Effect<number>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/Flows") {}

const flowCorrelation = (flowId: string) => MissionSchema.CorrelationID.make(`cor_flow_${flowId}`)

const preview = (value: unknown, limit = 2000): string | undefined => {
  if (value === undefined) return undefined
  const text = JSON.stringify(value)
  return text.length > limit ? `${text.slice(0, limit)}…` : text
}

const clip = (text: string, limit = 500) => (text.length > limit ? `${text.slice(0, limit)}…` : text)

export const make = Effect.fn("Flows.make")(function* () {
  const events = yield* MissionEvents.Service
  const saving = yield* Semaphore.make(1)
  const ticking = yield* Semaphore.make(1)

  const versions = Effect.fn("Flows.versions")(function* (flowId: string) {
    const rows = yield* events.list({ correlationID: flowCorrelation(flowId), types: ["flow.saved"] })
    return rows.map((row) => ({
      version: Number(row.payload.version),
      definition: row.payload.definition as unknown as Definition,
      hash: String(row.payload.hash),
      at: row.createdAt,
    }))
  })

  const definitionAt = Effect.fn("Flows.definitionAt")(function* (flowId: string, version: number) {
    return (yield* versions(flowId)).find((entry) => entry.version === version)?.definition
  })

  const save = Effect.fn("Flows.save")(function* (definition: unknown, by?: string) {
    const problems = validate(definition)
    if (problems.length > 0) return yield* new FlowInvalidError({ problems })
    const def = definition as Definition
    const hash = canonical(def)
    return yield* saving.withPermits(1)(
      Effect.gen(function* () {
        const existing = yield* versions(def.id)
        const latest = existing[existing.length - 1]
        if (latest && latest.hash === hash) return { id: def.id, version: latest.version, created: false }
        const version = (latest?.version ?? 0) + 1
        yield* events.append({
          type: "flow.saved",
          actor: { kind: "user", id: by ?? "user" },
          idempotencyKey: `flow:saved:${def.id}:${version}`,
          correlationId: flowCorrelation(def.id),
          payload: { flowId: def.id, version, definition: JSON.parse(hash) as Json, hash },
        })
        return { id: def.id, version, created: true }
      }),
    )
  })

  const get = Effect.fn("Flows.get")(function* (flowId: string) {
    const list = yield* versions(flowId)
    const latest = list[list.length - 1]
    if (!latest) return yield* new FlowNotFoundError({ flowId })
    return { definition: latest.definition, version: latest.version }
  })

  const loadRun = Effect.fn("Flows.loadRun")(function* (runId: string) {
    if (!runId.startsWith("cor")) return undefined
    const rows = yield* events.list({ correlationID: MissionSchema.CorrelationID.make(runId) })
    // Schema.Json is the readonly twin of expr.Json; the payloads are the same JSON either way.
    return Run.fold(runId, rows as unknown as ReadonlyArray<Run.RunEvent>)
  })

  const requestRun = Effect.fn("Flows.requestRun")(function* (input: RequestInput) {
    if (!REQUEST_ID.test(input.requestId))
      return yield* new FlowInvalidError({ problems: ["requestId: 8 to 64 letters, digits, - or _"] })
    if (input.input !== undefined && preview(input.input, MAX_OUTPUT_CHARS)!.length > MAX_OUTPUT_CHARS)
      return yield* new FlowInvalidError({ problems: ["input is too large"] })
    const { version } = yield* get(input.flowId)
    const trigger = input.trigger ?? "manual"
    const appended = yield* events.append({
      type: "flow.run.requested",
      actor: { kind: "user", id: input.by ?? "user" },
      idempotencyKey: `flow:run:${trigger}:${input.flowId}:${input.requestId}`,
      correlationId: MissionSchema.CorrelationID.create(),
      payload: { flowId: input.flowId, version, input: input.input ?? {}, trigger, depth: 0 },
    })
    return { runId: appended.event.correlationId as string, created: appended.inserted }
  })

  const summary = (state: Run.RunState, def: Definition | undefined): RunSummary => ({
    runId: state.runId,
    flowId: state.flowId,
    version: state.version,
    status: Run.runStatus(def, state),
    trigger: state.trigger,
    requestedAt: state.requestedAt,
    ...(state.end ? { endedAt: state.end.at } : {}),
    tokens: Run.tokens(state),
    ...(state.end?.error ? { error: state.end.error } : {}),
  })

  const runs = Effect.fn("Flows.runs")(function* (input?: { flowId?: string; limit?: number }) {
    const limit = Math.min(Math.max(input?.limit ?? 20, 1), 100)
    const requested = yield* events.list({ types: ["flow.run.requested"] })
    const picked = requested
      .filter((row) => input?.flowId === undefined || row.payload.flowId === input.flowId)
      .slice(-limit)
      .reverse()
    const out: RunSummary[] = []
    for (const row of picked) {
      const state = yield* loadRun(row.correlationId)
      if (!state) continue
      out.push(summary(state, yield* definitionAt(state.flowId, state.version)))
    }
    return out
  })

  const run = Effect.fn("Flows.run")(function* (runId: string) {
    const state = yield* loadRun(runId)
    if (!state) return yield* new FlowRunNotFoundError({ runId })
    const def = yield* definitionAt(state.flowId, state.version)
    const dead = def ? Run.deadSteps(def, state) : new Set<string>()
    const steps: StepView[] = (def?.steps ?? []).map((step) => {
      const attempts = state.steps.get(step.id) ?? []
      const latest = attempts[attempts.length - 1]
      const result = latest?.result
      return {
        id: step.id,
        type: step.type,
        ...(step.name ? { name: step.name } : {}),
        status: Run.stepStatus(def!, state, step, dead),
        attempts: attempts.length,
        ...(attempts[0] ? { startedAt: attempts[0].startedAt } : {}),
        ...(result ? { endedAt: result.at } : {}),
        tokens: result?.ok ? result.tokens : 0,
        ...(result && !result.ok ? { error: result.error } : {}),
        ...(result?.ok ? { output: preview(result.outputs) } : {}),
      }
    })
    return {
      ...summary(state, def),
      flowName: def?.name ?? state.flowId,
      ...(state.end?.output ? { output: preview(state.end.output) } : {}),
      steps,
    }
  })

  const list = Effect.gen(function* () {
    const saved = yield* events.list({ types: ["flow.saved"] })
    const latest = new Map<string, { def: Definition; version: number; at: number }>()
    for (const row of saved)
      latest.set(String(row.payload.flowId), {
        def: row.payload.definition as unknown as Definition,
        version: Number(row.payload.version),
        at: row.createdAt,
      })
    const recent = yield* runs({ limit: 100 })
    return [...latest.values()]
      .map(({ def, version, at }): FlowSummary => {
        const lastRun = recent.find((entry) => entry.flowId === def.id)
        return {
          id: def.id,
          name: def.name,
          ...(def.description ? { description: def.description } : {}),
          version,
          steps: def.steps.length,
          updatedAt: at,
          ...(lastRun ? { lastRun } : {}),
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  })

  // ---- the runner ----------------------------------------------------------------------------

  const record = (
    state: Run.RunState,
    type: MissionSchema.MissionEventType,
    key: string,
    payload: Record<string, Json>,
  ) =>
    events.append({
      type,
      actor: RUNNER,
      idempotencyKey: key,
      correlationId: MissionSchema.CorrelationID.make(state.runId),
      payload,
    })

  const stepKey = (state: Run.RunState, step: Step, attempt: number) => `flow:step:${state.runId}:${step.id}:${attempt}`

  const succeed = (state: Run.RunState, step: Step, attempt: number, outputs: Outputs) => {
    const size = JSON.stringify(outputs).length
    if (size > MAX_OUTPUT_CHARS)
      return fail(state, step, attempt, `output is ${size} characters; the limit is ${MAX_OUTPUT_CHARS}`, true)
    return record(state, "flow.step.succeeded", `${stepKey(state, step, attempt)}:ok`, {
      step: step.id,
      attempt,
      outputs: outputs as unknown as Json,
      // Deterministic steps never call a model. AI steps (F3) will record what they spend here.
      tokens: 0,
    })
  }

  const fail = (state: Run.RunState, step: Step, attempt: number, error: string, final: boolean, retryAt?: number) =>
    record(state, "flow.step.failed", `${stepKey(state, step, attempt)}:err`, {
      step: step.id,
      attempt,
      error: clip(error),
      final,
      ...(retryAt === undefined ? {} : { retryAt }),
    })

  const start = Effect.fn("Flows.start")(function* (def: Definition, state: Run.RunState, step: Step, attempt: number) {
    const now = yield* Clock.currentTimeMillis
    const inputs = Run.inputsOf(def, state, step.id)
    const items = inputs.flat()
    const scope = { item: items[0] ?? {}, items, input: state.input, steps: Run.stepScope(state) }
    const extra: Record<string, Json> = {}
    if (step.type === "wait") extra.resumeAt = now + Number(step.params.seconds) * 1000
    let child: { flowId: string; version: number; input: Item } | undefined
    if (step.type === "run-flow") {
      const flowId = String(step.params.flowId)
      if (state.depth + 1 > MAX_DEPTH) {
        yield* record(state, "flow.step.started", stepKey(state, step, attempt), { step: step.id, attempt, type: step.type })
        return yield* fail(state, step, attempt, `run-flow is nested more than ${MAX_DEPTH} deep`, true)
      }
      const target = (yield* versions(flowId)).at(-1)
      if (!target) {
        yield* record(state, "flow.step.started", stepKey(state, step, attempt), { step: step.id, attempt, type: step.type })
        return yield* fail(state, step, attempt, `flow ${flowId} does not exist`, true)
      }
      const resolved = step.params.input === undefined ? (scope.item as Json) : resolve(step.params.input, scope)
      child = {
        flowId,
        version: target.version,
        input: resolved && typeof resolved === "object" && !Array.isArray(resolved) ? (resolved as Item) : { value: resolved },
      }
    }
    // The child run's key is derived from the parent step, so a crash and a retry request it once.
    const childRunId = child ? MissionSchema.CorrelationID.create() : undefined
    if (child) {
      const appended = yield* events.append({
        type: "flow.run.requested",
        actor: RUNNER,
        idempotencyKey: `flow:run:subflow:${state.runId}:${step.id}`,
        correlationId: childRunId,
        payload: {
          flowId: child.flowId,
          version: child.version,
          input: child.input,
          trigger: "subflow",
          depth: state.depth + 1,
          parent: { runId: state.runId, step: step.id },
        },
      })
      extra.childRunId = appended.event.correlationId
    }
    const started = yield* record(state, "flow.step.started", stepKey(state, step, attempt), {
      step: step.id,
      attempt,
      type: step.type,
      ...extra,
    })
    if (!started.inserted) return
    if (isPure(step)) {
      let outputs: Outputs
      try {
        outputs = runPure(step, { inputs, input: state.input, steps: scope.steps })
      } catch (error) {
        return yield* fail(state, step, attempt, error instanceof Error ? error.message : String(error), true)
      }
      return yield* succeed(state, step, attempt, outputs)
    }
    if (step.type === "http") {
      const outcome = yield* Http.execute({ def, step, scope, runId: state.runId })
      if (outcome.ok) return yield* succeed(state, step, attempt, { main: [outcome.item] })
      const retry = outcome.retryable && attempt < Http.maxAttempts(step)
      const at = yield* Clock.currentTimeMillis
      return yield* fail(state, step, attempt, outcome.error, !retry, retry ? at + Http.backoff(attempt) : undefined)
    }
    // wait and run-flow finish later, through `finish-wait` and `await-child`.
  })

  const advance = Effect.fn("Flows.advance")(function* (runId: string, maxActions = MAX_ACTIONS_PER_RUN) {
    let actions = 0
    while (actions < maxActions) {
      const state = yield* loadRun(runId)
      if (!state || state.end) return actions
      const def = yield* definitionAt(state.flowId, state.version)
      if (!def) {
        yield* record(state, "flow.run.failed", `flow:run-end:${runId}`, {
          error: `flow ${state.flowId} version ${state.version} is missing`,
          tokens: 0,
        })
        return actions + 1
      }
      const now = yield* Clock.currentTimeMillis
      const next = Run.plan(def, state, now)
      switch (next.kind) {
        case "none":
        case "idle":
          return actions
        case "start":
          yield* start(def, state, next.step, next.attempt)
          break
        case "finish-wait":
          yield* succeed(state, next.step, next.attempt, { main: Run.inputsOf(def, state, next.step.id).flat() })
          break
        case "await-child": {
          const child = yield* loadRun(next.childRunId)
          if (!child?.end) return actions
          if (child.end.status === "completed") yield* succeed(state, next.step, next.attempt, { main: child.end.output ?? [] })
          else yield* fail(state, next.step, next.attempt, `child run failed: ${child.end.error ?? "unknown"}`, true)
          break
        }
        case "raise-card":
          yield* record(state, "coordination.attention", `attention:flow:uncertain:${runId}:${next.step.id}:${next.attempt}`, {
            title: `Flow ${def.name}: step "${next.step.name ?? next.step.id}" may or may not have run`,
            body:
              `The app stopped while this step was running, and it can change something outside Aporetic, so it is not ` +
              `run again on its own. Check whether it happened. Resolve with "run-again" to run it again; any other ` +
              `resolution stops the run.`,
            flowRun: runId,
            flowId: state.flowId,
            step: next.step.id,
            attempt: next.attempt,
          })
          return actions + 1
        case "give-up":
          yield* fail(state, next.step, next.attempt, next.error, true)
          break
        case "fail":
          yield* record(state, "flow.run.failed", `flow:run-end:${runId}`, { error: clip(next.error), tokens: Run.tokens(state) })
          return actions + 1
        case "complete":
          yield* record(state, "flow.run.completed", `flow:run-end:${runId}`, {
            output: next.output as unknown as Json,
            tokens: Run.tokens(state),
          })
          return actions + 1
      }
      actions++
    }
    return actions
  })

  const openRuns = Effect.gen(function* () {
    const rows = yield* events.list({ types: ["flow.run.requested", "flow.run.completed", "flow.run.failed"] })
    const ended = new Set(rows.filter((row) => row.type !== "flow.run.requested").map((row) => row.correlationId))
    // Newest first: a child run finishes before the parent that waits on it looks again, so a chain
    // of sub-flows unwinds in one pass instead of one level per pass.
    return rows
      .filter((row) => row.type === "flow.run.requested" && !ended.has(row.correlationId))
      .map((row) => row.correlationId)
      .reverse()
  })

  const tick = ticking.withPermits(1)(
    Effect.gen(function* () {
      let total = 0
      // A parent can start a child mid-pass; another pass picks the child up and then the parent again.
      for (let pass = 0; pass < MAX_PASSES; pass++) {
        let progress = 0
        for (const runId of yield* openRuns) progress += yield* advance(runId)
        total += progress
        if (progress === 0) break
      }
      return total
    }),
  )

  return Service.of({
    save,
    list,
    get,
    requestRun,
    runs,
    run,
    tick,
    advance: (runId, maxActions) => ticking.withPermits(1)(advance(runId, maxActions)),
  })
})

export const layer = Layer.effect(Service, make())

export const node = makeGlobalNode({ service: Service, layer, deps: [MissionEvents.node] })

export { ID }
