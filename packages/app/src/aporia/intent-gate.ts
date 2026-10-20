/**
 * AP-CE-02 — App-side mirror of packages/core/src/flow/intent-gate.ts (pure).
 * Keep in sync with core. App cannot depend on @opencode/core (browser bundle);
 * EnginePort + FlowCommands use this copy so mechanical slash skips SessionRunner.
 */

export type MechanicalTrigger = "slash" | "manual" | "subflow"

export type IntentDecision =
  | {
      readonly kind: "mechanical"
      readonly flowId: string
      readonly trigger: MechanicalTrigger
      readonly input: Readonly<Record<string, unknown>>
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

export type MechanicalStart = {
  readonly flowId: string
  readonly trigger: MechanicalTrigger
  readonly input: Readonly<Record<string, unknown>>
  readonly expectedModelTokens: 0
}

const FLOW_ID = /^[a-z][a-z0-9-]{0,39}$/

const asSet = (registered: RegisteredFlows): ReadonlySet<string> =>
  registered instanceof Set ? registered : new Set(registered)

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
      // fall through
    }
  }
  return { text }
}

const SLASH = /^\/([a-z][a-z0-9-]{0,39})(?:\s+([\s\S]*))?$/

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

export const isZeroTokenPath = (decision: IntentDecision): boolean =>
  decision.kind === "mechanical" && decision.expectedModelTokens === 0

export function mechanicalStartFromDecision(decision: IntentDecision): MechanicalStart | undefined {
  if (decision.kind !== "mechanical" || !isZeroTokenPath(decision)) return undefined
  return {
    flowId: decision.flowId,
    trigger: decision.trigger,
    input: decision.input,
    expectedModelTokens: 0,
  }
}

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
