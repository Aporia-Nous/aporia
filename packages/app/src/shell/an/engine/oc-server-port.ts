/**
 * AP-ENGINE-PORT-01: first adapter — delegates to existing data.session / sync.
 * No new agent loop. OC server + packages/core SessionRunner remain authoritative.
 */

import type { Data } from "@opencode/client/solid"
import type { SessionInfo } from "@opencode/client/promise"
import type {
  EngineEvent,
  EnginePort,
  EngineSessionCreateInput,
  EngineSessionCreateResult,
  PromptAdmission,
} from "./types"

export type OcServerData = Pick<Data, "session">

/**
 * Thin wrapper over client solid Data.session.
 * AnShell send/stream must call this port — not raw data.session.prompt / message.list.
 */
export function createOcServerEnginePort(data: OcServerData): EnginePort {
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

    subscribe(handler: (event: EngineEvent) => void) {
      listeners.add(handler)
      return () => {
        listeners.delete(handler)
      }
    },
  }
}
