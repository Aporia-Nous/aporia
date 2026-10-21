// AP-CE-01/02 — Contraptions efficiency intent gate (pure) + mechanical route helper.
// Mechanical-first: registered slash / explicit flow triggers prefer FlowRunner (0 model tokens).
// Chat / unregistered slash stay SessionRunner. CE-02 wires this into composer/EnginePort + flow.start.

/** Same contract as FlowDefinition.ID — kept local so this module stays dependency-free. */
const FLOW_ID = /^[a-z][a-z0-9-]{0,39}$/

export type IntentKind = "mechanical" | "session" | "coordination"

export type MechanicalTrigger = "slash" | "manual" | "subflow"

export type IntentDecision =
  | {
      readonly kind: "mechanical"
      readonly flowId: string
      readonly trigger: MechanicalTrigger
      readonly input: Readonly<Record<string, unknown>>
      /** F1 deterministic path: model tokens must stay 0 until an F3 AI step exists. */
      readonly expectedModelTokens: 0
    }
  | {
      readonly kind: "session"
      readonly reason: "chat" | "unregistered-slash" | "empty"
    }
  | {
      readonly kind: "coordination"
      readonly reason: string
    }

export type RegisteredFlows = ReadonlySet<string> | ReadonlyArray<string>

/** Start params when the gate selects FlowRunner (never SessionRunner). */
export type MechanicalStart = {
  readonly flowId: string
  readonly trigger: MechanicalTrigger
  readonly input: Readonly<Record<string, unknown>>
  readonly expectedModelTokens: 0
}

const asSet = (registered: RegisteredFlows): ReadonlySet<string> =>
  registered instanceof Set ? registered : new Set(registered)

/**
 * Slash rest → flow input object (same contract as app `slashInput`): JSON object as written,
 * otherwise `{ text }`, empty → `{}`.
 */
export function parseSlashInput(rest: string | undefined): Record<string, unknown> {
  const text = (rest ?? "").trim()
  if (text.length === 0) return {}
  if (text.startsWith("{")) {
    try {
      const parsed = JSON.parse(text) as unknown
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch {
      // fall through to text bag
    }
  }
  return { text }
}

const SLASH = /^\/([a-z][a-z0-9-]{0,39})(?:\s+([\s\S]*))?$/

/**
 * Classify composer text against registered Contraption / flow ids.
 * Registered `/flow-id …` → mechanical (FlowRunner). Anything else → session.
 */
export function classifyComposerText(text: string, registered: RegisteredFlows): IntentDecision {
  const trimmed = text.trim()
  if (trimmed.length === 0) return { kind: "session", reason: "empty" }

  const match = SLASH.exec(trimmed)
  if (!match) return { kind: "session", reason: "chat" }

  const flowId = match[1]!
  if (!FLOW_ID.test(flowId) || !asSet(registered).has(flowId)) {
    return { kind: "session", reason: "unregistered-slash" }
  }

  return {
    kind: "mechanical",
    flowId,
    trigger: "slash",
    input: parseSlashInput(match[2]),
    expectedModelTokens: 0,
  }
}

/**
 * Classify an already-resolved run request (Contraptions Run button, slash client, or subflow).
 * Session triggers never go here — callers keep those on SessionRunner.
 */
export function classifyFlowTrigger(
  flowId: string,
  trigger: MechanicalTrigger,
  input: Readonly<Record<string, unknown>> | undefined,
  registered: RegisteredFlows,
): IntentDecision {
  if (!FLOW_ID.test(flowId) || !asSet(registered).has(flowId)) {
    return { kind: "session", reason: "unregistered-slash" }
  }
  return {
    kind: "mechanical",
    flowId,
    trigger,
    input: input ?? {},
    expectedModelTokens: 0,
  }
}

/** True when the decision must not invoke a model for F1 steps. */
export const isZeroTokenPath = (decision: IntentDecision): boolean =>
  decision.kind === "mechanical" && decision.expectedModelTokens === 0

/** Extract FlowRunner start params when gated mechanical; otherwise undefined (caller keeps SessionRunner). */
export function mechanicalStartFromDecision(decision: IntentDecision): MechanicalStart | undefined {
  if (decision.kind !== "mechanical" || !isZeroTokenPath(decision)) return undefined
  return {
    flowId: decision.flowId,
    trigger: decision.trigger,
    input: decision.input,
    expectedModelTokens: 0,
  }
}

/**
 * AP-CE-02 — Composer/SessionRunner wire helper.
 * Mechanical slash → startFlow (0 model tokens). Everything else → sessionPrompt.
 * Attachments force the session path (Contraption slash is text-only).
 */
export async function routeComposerAdmission<TSession, TFlow>(input: {
  readonly text: string
  readonly registered: RegisteredFlows
  readonly sessionPrompt: () => Promise<TSession>
  readonly startFlow: (start: MechanicalStart) => Promise<TFlow>
  readonly hasAttachments?: boolean
}): Promise<
  | { readonly path: "mechanical"; readonly result: TFlow; readonly modelTokens: 0; readonly start: MechanicalStart }
  | { readonly path: "session"; readonly result: TSession }
> {
  if (input.hasAttachments) {
    return { path: "session", result: await input.sessionPrompt() }
  }
  const start = mechanicalStartFromDecision(classifyComposerText(input.text, input.registered))
  if (start) {
    return {
      path: "mechanical",
      result: await input.startFlow(start),
      modelTokens: 0,
      start,
    }
  }
  return { path: "session", result: await input.sessionPrompt() }
}
