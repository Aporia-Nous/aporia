// A run is folded from its own events and nothing else, then `plan` says what happens next. Both are
// pure, so a restart rebuilds exactly the state the crashed process had, and the tests can check the
// rules without a database.
import { safety, type Connection, type Definition, type Step } from "./definition.js"
import type { Item, Json } from "./expr.js"
import type { Outputs } from "./steps.js"

/** The slice of a mission event a run needs. */
export interface RunEvent {
  readonly seq: number
  readonly id: string
  readonly type: string
  readonly payload: { readonly [key: string]: Json }
  readonly createdAt: number
}

export type StepResult =
  | { readonly ok: true; readonly outputs: Outputs; readonly at: number; readonly tokens: number }
  | {
      readonly ok: false
      readonly error: string
      readonly final: boolean
      readonly retryAt?: number
      readonly at: number
    }

export interface Attempt {
  readonly attempt: number
  readonly startedAt: number
  readonly payload: { readonly [key: string]: Json }
  readonly result?: StepResult
}

export interface Card {
  readonly id: string
  readonly step: string
  readonly attempt: number
  readonly resolution?: { readonly value?: string }
}

export interface RunState {
  readonly runId: string
  readonly flowId: string
  readonly version: number
  readonly input: Item
  readonly depth: number
  readonly trigger: string
  readonly parent?: { readonly runId: string; readonly step: string }
  readonly requestedAt: number
  readonly steps: ReadonlyMap<string, ReadonlyArray<Attempt>>
  readonly cards: ReadonlyArray<Card>
  readonly end?: {
    readonly status: "completed" | "failed"
    readonly at: number
    readonly output?: Item[]
    readonly error?: string
  }
}

const str = (value: Json | undefined) => (typeof value === "string" ? value : undefined)
const num = (value: Json | undefined) => (typeof value === "number" ? value : undefined)
const isItem = (value: Json | undefined): value is Item =>
  value !== null && value !== undefined && typeof value === "object" && !Array.isArray(value)

/** Fold one run's events (one correlation, in log order). Undefined when there is no request. */
export const fold = (runId: string, events: ReadonlyArray<RunEvent>): RunState | undefined => {
  const request = events.find((event) => event.type === "flow.run.requested")
  if (!request) return undefined
  const p = request.payload
  const parent = isItem(p.parent) ? { runId: String(p.parent.runId), step: String(p.parent.step) } : undefined
  const steps = new Map<string, Attempt[]>()
  const cards: Card[] = []
  let end: RunState["end"]
  for (const event of events) {
    const e = event.payload
    if (event.type === "flow.step.started") {
      const step = str(e.step)
      const attempt = num(e.attempt)
      if (!step || attempt === undefined) continue
      const list = steps.get(step) ?? []
      if (list.some((entry) => entry.attempt === attempt)) continue
      steps.set(step, [...list, { attempt, startedAt: event.createdAt, payload: e }])
      continue
    }
    if (event.type === "flow.step.succeeded" || event.type === "flow.step.failed") {
      const step = str(e.step)
      const attempt = num(e.attempt)
      const list = step ? steps.get(step) : undefined
      const index = list?.findIndex((entry) => entry.attempt === attempt) ?? -1
      if (!step || !list || index < 0 || list[index]!.result) continue
      const result: StepResult =
        event.type === "flow.step.succeeded"
          ? {
              ok: true,
              outputs: (isItem(e.outputs) ? e.outputs : {}) as unknown as Outputs,
              at: event.createdAt,
              tokens: num(e.tokens) ?? 0,
            }
          : {
              ok: false,
              error: str(e.error) ?? "failed",
              final: e.final === true,
              retryAt: num(e.retryAt),
              at: event.createdAt,
            }
      const next = [...list]
      next[index] = { ...list[index]!, result }
      steps.set(step, next)
      continue
    }
    if (event.type === "coordination.attention" && str(e.flowRun) === runId) {
      cards.push({ id: event.id, step: String(e.step), attempt: num(e.attempt) ?? 0 })
      continue
    }
    if (event.type === "attention.resolved") {
      const index = cards.findIndex((card) => card.id === str(e.card))
      if (index >= 0 && !cards[index]!.resolution) cards[index] = { ...cards[index]!, resolution: { value: str(e.resolution) } }
      continue
    }
    if ((event.type === "flow.run.completed" || event.type === "flow.run.failed") && !end) {
      end = {
        status: event.type === "flow.run.completed" ? "completed" : "failed",
        at: event.createdAt,
        output: Array.isArray(e.output) ? (e.output.filter(isItem) as Item[]) : undefined,
        error: str(e.error),
      }
    }
  }
  return {
    runId,
    flowId: String(p.flowId),
    version: num(p.version) ?? 1,
    input: isItem(p.input) ? p.input : {},
    depth: num(p.depth) ?? 0,
    trigger: str(p.trigger) ?? "manual",
    parent,
    requestedAt: request.createdAt,
    steps,
    cards,
    end,
  }
}

export const last = (state: RunState, step: string): Attempt | undefined => {
  const list = state.steps.get(step)
  return list?.[list.length - 1]
}

const succeeded = (state: RunState, step: string): Outputs | undefined => {
  const result = last(state, step)?.result
  return result?.ok ? result.outputs : undefined
}

const incomingOf = (def: Definition, step: string) => def.connections.filter((c) => c.to === step)

/** Which steps will never run because no input reaches them (the untaken side of an if or switch). */
export const deadSteps = (def: Definition, state: RunState): ReadonlySet<string> => {
  const memo = new Map<string, boolean>()
  const delivered = (c: Connection) => (succeeded(state, c.from)?.[c.output ?? "main"]?.length ?? 0) > 0
  const dead = (id: string): boolean => {
    const cached = memo.get(id)
    if (cached !== undefined) return cached
    memo.set(id, false)
    const incoming = incomingOf(def, id)
    const result =
      incoming.length > 0 &&
      !state.steps.has(id) &&
      incoming.every((c) => succeeded(state, c.from) !== undefined || dead(c.from)) &&
      !incoming.some(delivered)
    memo.set(id, result)
    return result
  }
  return new Set(def.steps.map((step) => step.id).filter(dead))
}

/** The items each input index of a step receives, in connection order. */
export const inputsOf = (def: Definition, state: RunState, step: string): Item[][] => {
  const incoming = incomingOf(def, step)
  if (incoming.length === 0) return [[state.input]]
  const inputs: Item[][] = []
  for (const c of incoming) {
    const items = succeeded(state, c.from)?.[c.output ?? "main"] ?? []
    const index = c.input ?? 0
    while (inputs.length <= index) inputs.push([])
    inputs[index]!.push(...items)
  }
  return inputs
}

/** `steps.<id>` in expressions: the first item a finished step produced. */
export const stepScope = (state: RunState): Record<string, Item | undefined> => {
  const out: Record<string, Item | undefined> = {}
  for (const id of state.steps.keys()) {
    const outputs = succeeded(state, id)
    if (outputs) out[id] = (outputs.main ?? Object.values(outputs).flat())[0]
  }
  return out
}

export type Plan =
  | { readonly kind: "none" }
  | { readonly kind: "idle"; readonly until?: number; readonly reason: string }
  | { readonly kind: "start"; readonly step: Step; readonly attempt: number }
  | { readonly kind: "finish-wait"; readonly step: Step; readonly attempt: number }
  | { readonly kind: "await-child"; readonly step: Step; readonly attempt: number; readonly childRunId: string }
  | { readonly kind: "raise-card"; readonly step: Step; readonly attempt: number }
  | { readonly kind: "give-up"; readonly step: Step; readonly attempt: number; readonly error: string }
  | { readonly kind: "fail"; readonly error: string }
  | { readonly kind: "complete"; readonly output: Item[] }

export const RUN_AGAIN = "run-again"

/**
 * Whether a started step with no result is still in flight: its owner (the runner and boot recorded on
 * `flow.step.started`) still holds the runner lease and has the step open. Without an answer, or when
 * the answer is no, a started step with no result was cut off by a crash.
 */
export type InFlight = (step: Step, attempt: Attempt) => boolean

/** What to do next for a run. One action at a time; the runner re-plans after each. */
export const plan = (def: Definition, state: RunState, now: number, inFlight?: InFlight): Plan => {
  if (state.end) return { kind: "none" }
  const waits: Array<{ until?: number; reason: string }> = []
  for (const step of def.steps) {
    const attempt = last(state, step.id)
    if (!attempt) continue
    const result = attempt.result
    if (result && !result.ok && result.final) return { kind: "fail", error: `step ${step.id}: ${result.error}` }
    if (result && !result.ok) {
      if (result.retryAt === undefined || now >= result.retryAt) return { kind: "start", step, attempt: attempt.attempt + 1 }
      waits.push({ until: result.retryAt, reason: `retry ${step.id}` })
      continue
    }
    if (result) continue
    // Started, no result: the step is waiting by design, or a crash cut it off.
    if (step.type === "wait") {
      const until = num(attempt.payload.resumeAt) ?? 0
      if (now >= until) return { kind: "finish-wait", step, attempt: attempt.attempt }
      waits.push({ until, reason: `wait ${step.id}` })
      continue
    }
    if (step.type === "run-flow") {
      const childRunId = str(attempt.payload.childRunId)
      if (childRunId) return { kind: "await-child", step, attempt: attempt.attempt, childRunId }
      return { kind: "start", step, attempt: attempt.attempt + 1 }
    }
    // Still running under a live owner: neither a retry nor a card, just wait for its result.
    if (inFlight?.(step, attempt)) {
      waits.push({ reason: `${step.id} is running` })
      continue
    }
    if (safety(step) !== "unsafe") return { kind: "start", step, attempt: attempt.attempt + 1 }
    const card = state.cards.find((entry) => entry.step === step.id && entry.attempt === attempt.attempt)
    if (!card) return { kind: "raise-card", step, attempt: attempt.attempt }
    if (!card.resolution) {
      waits.push({ reason: `a person decides about ${step.id}` })
      continue
    }
    if (card.resolution.value === RUN_AGAIN) return { kind: "start", step, attempt: attempt.attempt + 1 }
    return {
      kind: "give-up",
      step,
      attempt: attempt.attempt,
      error: "stopped by a person: the step may or may not have run",
    }
  }
  if (waits.length > 0) {
    const times = waits.map((w) => w.until).filter((t): t is number => t !== undefined)
    return { kind: "idle", until: times.length > 0 ? Math.min(...times) : undefined, reason: waits[0]!.reason }
  }
  const dead = deadSteps(def, state)
  for (const step of def.steps) {
    if (state.steps.has(step.id) || dead.has(step.id)) continue
    const incoming = incomingOf(def, step.id)
    if (incoming.length === 0) return { kind: "start", step, attempt: 1 }
    const settled = incoming.every((c) => succeeded(state, c.from) !== undefined || dead.has(c.from))
    const delivered = incoming.some((c) => (succeeded(state, c.from)?.[c.output ?? "main"]?.length ?? 0) > 0)
    if (settled && delivered) return { kind: "start", step, attempt: 1 }
  }
  // Nothing left to run: the output is what the last steps (those nothing reads from) produced.
  const sinks = def.steps.filter((step) => !def.connections.some((c) => c.from === step.id))
  const output = sinks.flatMap((step) => {
    const outputs = succeeded(state, step.id)
    return outputs ? Object.values(outputs).flat() : []
  })
  return { kind: "complete", output }
}

export type StepStatus = "pending" | "running" | "waiting" | "succeeded" | "failed" | "skipped" | "needs-attention"
export type RunStatus = "running" | "waiting" | "needs-attention" | "completed" | "failed"

export const stepStatus = (def: Definition, state: RunState, step: Step, dead: ReadonlySet<string>): StepStatus => {
  const attempt = last(state, step.id)
  if (!attempt) return dead.has(step.id) ? "skipped" : "pending"
  const result = attempt.result
  if (result?.ok) return "succeeded"
  if (result && result.final) return "failed"
  if (result) return "waiting"
  if (step.type === "wait" || step.type === "run-flow") return "waiting"
  if (state.end) return "failed"
  // An unsafe step cut off by a crash waits for a person; one still in flight is just running.
  if (safety(step) === "unsafe" && state.cards.some((card) => card.step === step.id && card.attempt === attempt.attempt && !card.resolution))
    return "needs-attention"
  return "running"
}

export const runStatus = (def: Definition | undefined, state: RunState): RunStatus => {
  if (state.end) return state.end.status
  if (state.cards.some((card) => !card.resolution)) return "needs-attention"
  if (!def) return "running"
  const dead = deadSteps(def, state)
  return def.steps.some((step) => stepStatus(def, state, step, dead) === "waiting") ? "waiting" : "running"
}

export const tokens = (state: RunState): number => {
  let total = 0
  for (const list of state.steps.values()) for (const attempt of list) if (attempt.result?.ok) total += attempt.result.tokens
  return total
}
