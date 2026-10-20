/**
 * AP-ENGINE-PORT-01/02/03: first adapter — delegates to existing data.session / location sync.
 * No new agent loop. OC server + packages/core SessionRunner remain authoritative.
 * PORT-02 adds providers/models/BYOK via location catalog + optional connectKey hook.
 * PORT-03: subscribe + observeServerEvent — single AnShell session-event writer surface;
 * pairs with E21 reconnect pinned-dir sync (no dual all-dir poll from AnShell).
 */

import type { Data } from "@opencode/client/solid"
import type { SessionInfo } from "@opencode/client/promise"
import {
  routeComposerAdmission,
  type MechanicalStart,
} from "@/aporia/intent-gate"
import type {
  EngineConnectByokInput,
  EngineEvent,
  EngineLocationRef,
  EngineModelInfo,
  EnginePort,
  EngineProviderInfo,
  EngineSessionCreateInput,
  EngineSessionCreateResult,
  PromptAdmission,
} from "./types"

export type OcServerData = Pick<Data, "session" | "location">

/** AP-CE-02: mechanical Contraption slash → FlowRunner (0 model tokens); skips SessionRunner. */
export type EngineContraptionsGate = {
  registeredIds: () => ReadonlyArray<string> | ReadonlySet<string>
  start: (start: MechanicalStart & { requestId: string }) => Promise<{ runId: string; created: boolean }>
  /** Optional request id factory; defaults to admission id / timestamp. */
  requestId?: (admission: PromptAdmission, start: MechanicalStart) => string
}

export type OcServerEnginePortOptions = {
  /** Wire OC integration.connect.key (and post-connect invalidate/sync) for BYOK. */
  connectKey?: (input: EngineConnectByokInput) => Promise<void>
  /** AP-CE-02 intent gate — when set, registered `/flow-id` never calls data.session.prompt. */
  contraptions?: EngineContraptionsGate
}

const FREE_PROVIDER_IDS = new Set(["opencode", "opencode-go"])
const LOCAL_PROVIDER_IDS = new Set(["ollama", "lmstudio"])

function locationQuery(location?: EngineLocationRef) {
  return location?.directory ? { directory: location.directory } : undefined
}

function providerPath(id: string): EngineProviderInfo["path"] {
  if (FREE_PROVIDER_IDS.has(id)) return "free"
  if (LOCAL_PROVIDER_IDS.has(id)) return "local"
  return "byok"
}

function modelIsFree(cost: Array<{ input?: number; output?: number }> | undefined): boolean {
  if (!cost || cost.length === 0) return false
  const tier = cost.find((item) => "tier" in item === false) ?? cost[0]
  return (tier?.input ?? 0) === 0 && (tier?.output ?? 0) === 0
}

/**
 * Thin wrapper over client solid Data.session + Data.location.
 * AnShell send/stream/Settings must call this port — not raw data.session.prompt / Settings React.
 */
export function createOcServerEnginePort(data: OcServerData, options?: OcServerEnginePortOptions): EnginePort {
  const listeners = new Set<(event: EngineEvent) => void>()

  const emit = (event: EngineEvent) => {
    for (const handler of listeners) {
      try {
        handler(event)
      } catch {
        /* subscriber errors must not break send/stream */
      }
    }
  }

  const listRawProviders = (location?: EngineLocationRef) => {
    try {
      return data.location.provider.list(locationQuery(location)) ?? []
    } catch {
      return []
    }
  }

  const listRawModels = (location?: EngineLocationRef) => {
    try {
      return data.location.model.list(locationQuery(location)) ?? []
    } catch {
      return []
    }
  }

  const syncCatalog = async (location?: EngineLocationRef): Promise<void> => {
    const ref = locationQuery(location)
    try {
      await Promise.all([data.location.provider.sync(ref), data.location.model.sync(ref)])
      emit({ type: "providers.changed" })
    } catch {
      /* catalog sync failures surface as empty lists; Settings stays honest */
    }
  }

  return {
    listSessions(): SessionInfo[] {
      return data.session.list() ?? []
    },

    createSession(input: EngineSessionCreateInput): EngineSessionCreateResult {
      const location = input.location ?? (input.directory ? { directory: input.directory } : undefined)
      const created = data.session.create({
        id: input.id,
        title: input.title,
        agent: input.agent,
        model: input.model,
        location,
        projectID: input.projectID,
      })
      emit({ type: "session.changed", sessionID: created.id })
      return {
        id: created.id,
        request: created.request as Promise<SessionInfo>,
      }
    },

    sessionStatus(sessionID: string): string | undefined {
      try {
        const status = data.session.status(sessionID)
        return status === undefined || status === null ? undefined : String(status)
      } catch {
        return undefined
      }
    },

    async prompt(admission: PromptAdmission): Promise<unknown> {
      const gate = options?.contraptions
      if (gate && typeof admission.text === "string") {
        const hasAttachments = Array.isArray(admission.files) && admission.files.length > 0
        const routed = await routeComposerAdmission({
          text: admission.text,
          registered: gate.registeredIds(),
          hasAttachments,
          sessionPrompt: () => data.session.prompt(admission),
          startFlow: async (start) => {
            const requestId =
              gate.requestId?.(admission, start) ??
              String(admission.id ?? `flow-${Date.now()}`).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64)
            return gate.start({ ...start, requestId: requestId.length >= 8 ? requestId : `flow-${Date.now()}` })
          },
        })
        if (routed.path === "mechanical") {
          // Mechanical path: no SessionRunner / no model tokens. Status tick only (no fake message).
          emit({ type: "status.changed", sessionID: admission.sessionID })
          return {
            mechanical: true,
            modelTokens: 0 as const,
            runId: routed.result.runId,
            created: routed.result.created,
            flowId: routed.start.flowId,
          }
        }
        emit({ type: "messages.changed", sessionID: admission.sessionID })
        emit({ type: "status.changed", sessionID: admission.sessionID })
        return routed.result
      }

      const result = await data.session.prompt(admission)
      emit({ type: "messages.changed", sessionID: admission.sessionID })
      emit({ type: "status.changed", sessionID: admission.sessionID })
      return result
    },

    listMessages(sessionID: string) {
      try {
        return data.session.message.list(sessionID) ?? []
      } catch {
        return []
      }
    },

    listPermissions(sessionID: string): unknown[] {
      try {
        return (data.session.permission.list(sessionID) ?? []) as unknown[]
      } catch {
        return []
      }
    },

    listProviders(location?: EngineLocationRef): EngineProviderInfo[] {
      const providers = listRawProviders(location)
      const models = listRawModels(location)
      const counts = new Map<string, number>()
      for (const model of models) {
        if ((model as { status?: string }).status === "deprecated") continue
        const id = String((model as { providerID?: string }).providerID ?? "")
        if (!id) continue
        counts.set(id, (counts.get(id) ?? 0) + 1)
      }
      return providers.map((provider) => {
        const id = String((provider as { id: string }).id)
        const name = String((provider as { name?: string }).name ?? id)
        const integrationID = (provider as { integrationID?: string }).integrationID
        return {
          id,
          name,
          integrationID,
          modelCount: counts.get(id) ?? 0,
          path: providerPath(id),
        }
      })
    },

    listModels(location?: EngineLocationRef & { providerID?: string }): EngineModelInfo[] {
      const providerID = location?.providerID
      const models = listRawModels(location)
      return models
        .filter((model) => {
          const row = model as { status?: string; providerID?: string }
          if (row.status === "deprecated") return false
          if (providerID && row.providerID !== providerID) return false
          return true
        })
        .map((model) => {
          const row = model as {
            id: string
            name?: string
            providerID: string
            status?: string
            cost?: Array<{ input?: number; output?: number }>
          }
          return {
            id: row.id,
            name: row.name ?? row.id,
            providerID: row.providerID,
            status: row.status,
            free: modelIsFree(row.cost) || FREE_PROVIDER_IDS.has(row.providerID),
          }
        })
    },

    syncCatalog,

    async connectByok(input: EngineConnectByokInput): Promise<void> {
      if (!options?.connectKey) {
        throw new Error("BYOK connect is unavailable (EnginePort connectKey not wired)")
      }
      const key = input.key.trim()
      if (!key) throw new Error("API key is required")
      if (!input.providerID.trim()) throw new Error("Provider is required")
      await options.connectKey({
        providerID: input.providerID.trim(),
        key,
        directory: input.directory,
      })
      await syncCatalog(input.directory ? { directory: input.directory } : undefined)
    },

    subscribe(handler: (event: EngineEvent) => void) {
      listeners.add(handler)
      return () => {
        listeners.delete(handler)
      }
    },

    observeServerEvent(event: { type: string; data?: { sessionID?: string } }) {
      const sessionID = event.data?.sessionID
      if (!sessionID) return
      // Skip high-frequency deltas — solid Data already patches the message store; AnShell
      // stream memos track that store. PORT-03 subscribe is for coarse session/status ticks only.
      if (
        event.type.endsWith(".delta") ||
        event.type.endsWith(".progress") ||
        event.type.endsWith(".streamed")
      ) {
        return
      }
      if (
        event.type.startsWith("message.") ||
        event.type === "session.text.ended" ||
        event.type === "session.tool.called" ||
        event.type === "session.tool.success" ||
        event.type === "session.tool.failed" ||
        event.type === "session.tool.input.ended" ||
        event.type === "session.step.ended" ||
        event.type === "session.step.failed" ||
        event.type === "session.reasoning.ended" ||
        event.type === "session.compaction.ended" ||
        event.type === "session.compaction.failed" ||
        event.type === "session.deleted" ||
        event.type === "session.renamed" ||
        event.type === "session.revert.committed"
      ) {
        emit({ type: "messages.changed", sessionID })
      }
      if (
        event.type.startsWith("session.execution.") ||
        event.type === "session.step.started" ||
        event.type === "session.step.ended" ||
        event.type === "session.step.failed"
      ) {
        emit({ type: "status.changed", sessionID })
      }
    },
  }
}
