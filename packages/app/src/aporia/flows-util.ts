// APORIA: pure helpers for the native Flows section and the flow slash commands (tested in
// flows-util.test.ts). The engine itself runs in the server; the app only lists, starts and shows.

export type FlowRunStatus = "running" | "waiting" | "needs-attention" | "completed" | "failed"
export type FlowStepStatus = "pending" | "running" | "waiting" | "succeeded" | "failed" | "skipped" | "needs-attention"

export type FlowRunSummary = {
  runId: string
  flowId: string
  version: number
  status: FlowRunStatus
  trigger: string
  requestedAt: number
  endedAt?: number
  tokens: number
  error?: string
}

export type FlowSummary = {
  id: string
  name: string
  description?: string
  version: number
  steps: number
  updatedAt: number
  lastRun?: FlowRunSummary
}

export type FlowStepView = {
  id: string
  type: string
  name?: string
  status: FlowStepStatus
  attempts: number
  startedAt?: number
  endedAt?: number
  tokens: number
  error?: string
  output?: string
}

export type FlowRunDetail = FlowRunSummary & { flowName: string; output?: string; steps: FlowStepView[] }

type JsonObject = Record<string, unknown>

const isObject = (value: unknown): value is JsonObject =>
  value !== null && typeof value === "object" && !Array.isArray(value)

/**
 * What `/flow-id <rest>` hands the flow: a JSON object as written, anything else as `{ text }`, and
 * nothing at all as `{}`. A JSON array or number is text too, so the input is always an object.
 */
export function slashInput(rest: string | undefined): JsonObject {
  const text = (rest ?? "").trim()
  if (text.length === 0) return {}
  if (text.startsWith("{")) {
    try {
      const parsed = JSON.parse(text) as unknown
      if (isObject(parsed)) return parsed
    } catch {
      // Not JSON after all: hand it over as text.
    }
  }
  return { text }
}

/** Parse the "Add flow from JSON" box. The server validates the definition itself; this only checks it is an object. */
export function parseDefinition(text: string): { ok: true; definition: JsonObject } | { ok: false; error: string } {
  const trimmed = text.trim()
  if (trimmed.length === 0) return { ok: false, error: "Paste a flow definition (JSON) first." }
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch (error) {
    return { ok: false, error: `Not valid JSON: ${error instanceof Error ? error.message : String(error)}` }
  }
  if (!isObject(parsed)) return { ok: false, error: "A flow definition is a JSON object." }
  return { ok: true, definition: parsed }
}

/** A request id the server accepts ([A-Za-z0-9_-]{8,64}); one per click, so a double submit is one run. */
export function requestId(prefix: string, random: () => number = Math.random, now: () => number = Date.now): string {
  const tail = Array.from({ length: 10 }, () => "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(random() * 36)]).join("")
  return `${prefix}-${now().toString(36)}-${tail}`.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64)
}

/** The slash name for a flow: its id, which is already lowercase letters, digits and dashes. */
export const slashName = (flow: Pick<FlowSummary, "id">) => flow.id

const RUN_LABEL: Record<FlowRunStatus, string> = {
  running: "Running",
  waiting: "Waiting",
  "needs-attention": "Needs you",
  completed: "Done",
  failed: "Failed",
}
export const runLabel = (status: FlowRunStatus) => RUN_LABEL[status] ?? status

const STEP_ICON: Record<FlowStepStatus, string> = {
  pending: "○",
  running: "◐",
  waiting: "◷",
  succeeded: "●",
  failed: "✕",
  skipped: "–",
  "needs-attention": "!",
}
export const stepIcon = (status: FlowStepStatus) => STEP_ICON[status] ?? "?"

/** "120 ms", "3.4 s", "2 min" between two times; empty when the step has not finished. */
export function duration(start?: number, end?: number): string {
  if (start === undefined || end === undefined || end < start) return ""
  const ms = end - start
  if (ms < 1000) return `${ms} ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`
  return `${Math.round(ms / 60_000)} min`
}

/** One line per step for the timeline. */
export function stepLine(step: FlowStepView): string {
  const parts = [`${stepIcon(step.status)} ${step.name ?? step.id}`, step.type, step.status]
  if (step.attempts > 1) parts.push(`${step.attempts} attempts`)
  const took = duration(step.startedAt, step.endedAt)
  if (took) parts.push(took)
  parts.push(`${step.tokens} tokens`)
  return parts.join(" · ")
}

/** A run is still moving when it has not ended; the panel keeps polling it. */
export const isOpen = (status: FlowRunStatus) => status !== "completed" && status !== "failed"

/** The toast after a slash run was requested. */
export function startedToast(flowName: string, created: boolean): string {
  return created ? `Started flow "${flowName}"` : `Flow "${flowName}" was already started for this request`
}

/** A short, readable error from whatever the client threw (a FlowInvalidError lists its problems). */
export function errorText(error: unknown): string {
  if (isObject(error)) {
    const problems = error.problems
    if (Array.isArray(problems) && problems.length > 0) return problems.slice(0, 5).map(String).join("; ")
    if (typeof error.message === "string") return error.message
  }
  if (error instanceof Error) return error.message
  return String(error)
}
