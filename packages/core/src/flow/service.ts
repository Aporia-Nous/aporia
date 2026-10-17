export * as Flows from "./service.js"

import { randomUUID } from "node:crypto"
import { Cause, Clock, Context, Duration, Effect, Layer, Option, Schedule, Semaphore } from "effect"
import { makeGlobalNode } from "@opencode/util/effect/app-node"
import { Database } from "../database/database.js"
import { MissionEvents } from "../mission/event.js"
import { MissionSchema } from "../mission/schema.js"
import { canonical, ID, validate, type Definition, type Step } from "./definition.js"
import { FlowInvalidError, FlowNotFoundError, FlowRunNotFoundError } from "./errors.js"
import { resolve, type Item, type Json } from "./expr.js"
import * as Http from "./http.js"
import * as Lease from "./lease.js"
import * as Run from "./run.js"
import { isPure, runPure, type Outputs } from "./steps.js"

// Flows live in the mission log (provisional decision, docs/an-rewrite/FLOW1-PLAN.md): a definition
// is a `flow.saved` event per version, and a run is the `flow.*` events sharing its correlation id.
// Nothing else is stored, so a restart folds back exactly what was recorded.

export const MAX_DEPTH = 5
export const MAX_OUTPUT_CHARS = 256_000
const MAX_ACTIONS_PER_RUN = 50
const MAX_PASSES = 20
const RUN_CONCURRENCY = 8
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
  /**
   * Advance every open run as far as it can go now. Returns the number of actions taken. Does nothing
   * unless this service holds the runner lease, and skips a run another fiber is already advancing.
   */
  readonly tick: Effect.Effect<number>
  /** Advance one run by at most `maxActions` actions (tests use this to stop in the middle). */
  readonly advance: (runId: string, maxActions?: number) => Effect.Effect<number>
}

export interface Options {
  /** How long the runner lease lasts without renewal. Default 30 s. */
  readonly leaseMs?: number
  /** This runner's id on the lease and on every step start. Default: a fresh id per service. */
  readonly owner?: string
}

export class Service extends Context.Service<Service, Interface>()("@opencode/Flows") {}

const flowCorrelation = (flowId: string) => MissionSchema.CorrelationID.make(`cor_flow_${flowId}`)

const preview = (value: unknown, limit = 2000): string | undefined => {
  if (value === undefined) return undefined
  const text = JSON.stringify(value)
  return text.length > limit ? `${text.slice(0, limit)}…` : text
}

const clip = (text: string, limit = 500) => (text.length > limit ? `${text.slice(0, limit)}…` : text)

export const make = Effect.fn("Flows.make")(function* (options?: Options) {
  const events = yield* MissionEvents.Service
  const saving = yield* Semaphore.make(1)
  // Any number of processes may open this database; only the lease holder advances runs (lease.ts).
  const lease = yield* Lease.make({ owner: options?.owner ?? `flow-runner-${randomUUID()}`, ttlMs: options?.leaseMs })
  // Renew while held, so a lease survives a slow step even when nothing else ticks.
  yield* Effect.suspend(() => (lease.held() ? Effect.asVoid(lease.acquire) : Effect.void)).pipe(
    Effect.catchCause((cause) =>
      Cause.hasInterrupts(cause)
        ? Effect.failCause(cause)
        : Effect.logWarning("Flow runner lease renewal failed", { cause: Cause.pretty(cause) }),
    ),
    Effect.repeat(Schedule.spaced(Duration.millis(Math.max(10, Math.floor(lease.ttlMs / 3))))),
    Effect.forkScoped,
  )
  // A clean stop hands the lease over at once instead of making the next runner wait it out.
  yield* Effect.addFinalizer(() => lease.release)

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

  /** What every step start records: the step, and which runner (owner and boot) is carrying it out. */
  const startedPayload = (step: Step, attempt: number): Record<string, Json> => ({
    step: step.id,
    attempt,
    type: step.type,
    owner: lease.owner,
    boot: lease.boot,
  })

  // Steps this runner has started and not finished, by step key. Together with the owner and boot on
  // the start, this is how "started, no result" reads as still running instead of cut off by a crash.
  const inFlight = new Set<string>()

  const inFlightCheck =
    (state: Run.RunState, holder: Lease.Holder | undefined): Run.InFlight =>
    (step, attempt) => {
      const owner = attempt.payload.owner
      const boot = attempt.payload.boot
      // A start with no owner was recorded before the lease existed; nothing can still be running it.
      if (typeof owner !== "string" || typeof boot !== "string") return false
      if (owner === lease.owner && boot === lease.boot) return inFlight.has(stepKey(state, step, attempt.attempt))
      // Another runner's step is still running only while that runner holds the lease.
      return holder !== undefined && holder.owner === owner && holder.boot === boot
    }

  /** Whether some step of the run was started by another runner or boot and has no result. */
  const foreignOpen = (state: Run.RunState) => {
    for (const list of state.steps.values()) {
      const latest = list[list.length - 1]
      if (latest && !latest.result && (latest.payload.owner !== lease.owner || latest.payload.boot !== lease.boot))
        return true
    }
    return false
  }

  /** Start one step. False when this runner must stop advancing the run (lease lost, or start taken). */
  const start = Effect.fn("Flows.start")(function* (def: Definition, state: Run.RunState, step: Step, attempt: number) {
    // Checked against the database right before anything that can reach outside the log.
    if (!(yield* lease.acquire)) return false
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
        const started = yield* record(state, "flow.step.started", stepKey(state, step, attempt), startedPayload(step, attempt))
        if (!started.inserted) return false
        yield* fail(state, step, attempt, `run-flow is nested more than ${MAX_DEPTH} deep`, true)
        return true
      }
      const target = (yield* versions(flowId)).at(-1)
      if (!target) {
        const started = yield* record(state, "flow.step.started", stepKey(state, step, attempt), startedPayload(step, attempt))
        if (!started.inserted) return false
        yield* fail(state, step, attempt, `flow ${flowId} does not exist`, true)
        return true
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
      ...startedPayload(step, attempt),
      ...extra,
    })
    // Someone else recorded this start first, so the step is theirs: stop, do not count it, do not re-plan.
    if (!started.inserted) return false
    if (isPure(step)) {
      let outputs: Outputs
      try {
        outputs = runPure(step, { inputs, input: state.input, steps: scope.steps })
      } catch (error) {
        yield* fail(state, step, attempt, error instanceof Error ? error.message : String(error), true)
        return true
      }
      yield* succeed(state, step, attempt, outputs)
      return true
    }
    if (step.type === "http") {
      const key = stepKey(state, step, attempt)
      inFlight.add(key)
      yield* Effect.gen(function* () {
        const outcome = yield* Http.execute({ def, step, scope, runId: state.runId })
        if (outcome.ok) {
          yield* succeed(state, step, attempt, { main: [outcome.item] })
          return
        }
        const retry = outcome.retryable && attempt < Http.maxAttempts(step)
        const at = yield* Clock.currentTimeMillis
        yield* fail(state, step, attempt, outcome.error, !retry, retry ? at + Http.backoff(attempt) : undefined)
      }).pipe(Effect.ensuring(Effect.sync(() => inFlight.delete(key))))
      return true
    }
    // wait and run-flow finish later, through `finish-wait` and `await-child`.
    return true
  })

  const advance = Effect.fn("Flows.advance")(function* (runId: string, maxActions = MAX_ACTIONS_PER_RUN) {
    let actions = 0
    while (actions < maxActions) {
      // Only the lease holder moves runs. One that has lost it (or is near the end of it) stops here.
      if (!lease.held()) return actions
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
      const holder = foreignOpen(state) ? yield* lease.holder : undefined
      const next = Run.plan(def, state, now, inFlightCheck(state, holder))
      switch (next.kind) {
        case "none":
        case "idle":
          return actions
        case "start":
          if (!(yield* start(def, state, next.step, next.attempt))) return actions
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

  // One advance at a time per run, held across that run's own I/O. It never covers another run, so a
  // slow step holds up only the run it belongs to.
  const locks = new Map<string, Semaphore.Semaphore>()
  const lockOf = (runId: string) => {
    let lock = locks.get(runId)
    if (!lock) {
      lock = Semaphore.makeUnsafe(1)
      locks.set(runId, lock)
    }
    return lock
  }

  // Open runs, kept up to date from the log by sequence number instead of re-reading every run request
  // and end on every tick. Insertion order is request order.
  const open = new Map<string, true>()
  let scanned = 0
  const openRuns = Effect.gen(function* () {
    const rows = yield* events.list({
      types: ["flow.run.requested", "flow.run.completed", "flow.run.failed"],
      afterSeq: scanned,
    })
    for (const row of rows) {
      // Two ticks can read the same rows; only the first to get here applies them, in log order.
      if (row.seq <= scanned) continue
      scanned = row.seq
      if (row.type === "flow.run.requested") open.set(row.correlationId, true)
      else {
        open.delete(row.correlationId)
        locks.delete(row.correlationId)
      }
    }
    // Newest first: a child run finishes before the parent that waits on it looks again.
    return [...open.keys()].reverse()
  })

  const tick = Effect.gen(function* () {
    if (!(yield* lease.acquire)) return 0
    let total = 0
    // A parent can start a child mid-pass; another pass picks the child up and then the parent again.
    for (let pass = 0; pass < MAX_PASSES; pass++) {
      // Runs move side by side, and a run that another fiber is already advancing (a slow step in
      // flight) is skipped rather than waited for.
      const counts = yield* Effect.forEach(
        yield* openRuns,
        (runId) =>
          lockOf(runId)
            .withPermitsIfAvailable(1)(advance(runId))
            .pipe(Effect.map(Option.getOrElse(() => 0))),
        { concurrency: RUN_CONCURRENCY },
      )
      const progress = counts.reduce((sum, count) => sum + count, 0)
      total += progress
      if (progress === 0) break
    }
    return total
  })

  return Service.of({
    save,
    list,
    get,
    requestRun,
    runs,
    run,
    tick,
    advance: (runId, maxActions) =>
      Effect.gen(function* () {
        if (!(yield* lease.acquire)) return 0
        return yield* lockOf(runId).withPermits(1)(advance(runId, maxActions))
      }),
  })
})

export const layerWith = (options?: Options) => Layer.effect(Service, make(options))

export const layer = layerWith()

export const node = makeGlobalNode({ service: Service, layer, deps: [MissionEvents.node, Database.node] })

/** The Flows node with runner options (tests use a short lease or a fixed owner id). */
export const configured = (options?: Options) =>
  makeGlobalNode({ service: Service, layer: layerWith(options), deps: [MissionEvents.node, Database.node] })

export { ID }