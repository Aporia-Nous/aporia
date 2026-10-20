/**
 * AP-ENGINE-PORT-01/02: thin AnShell ↔ OC-server ingress.
 * SessionRunner / providers / tools / DB stay behind OcServerEnginePort.
 * Single writer for AnShell prompt + message list — no parallel ad-hoc data.session.prompt from shell cards.
 * PORT-02: providers / models / BYOK read+connect via port (AN Settings does not mount OC Settings React).
 */

import type { Data } from "@opencode/client/solid"
import type { SessionInfo, SessionMessageInfo } from "@opencode/client/promise"

/** Admission payload accepted by data.session.prompt (OC client solid Data). */
export type PromptAdmission = Parameters<Data["session"]["prompt"]>[0]

export type EngineSessionCreateInput = {
  id?: string
  title?: string
  agent?: string
  model?: { id: string; providerID: string; variant?: string }
  directory?: string
  location?: { directory: string }
  projectID?: string
}

export type EngineSessionCreateResult = {
  id: string
  request: Promise<SessionInfo>
}

export type EngineEvent =
  | { type: "session.changed"; sessionID?: string }
  | { type: "messages.changed"; sessionID: string }
  | { type: "status.changed"; sessionID: string; status?: string }
  | { type: "providers.changed" }

export type EngineLocationRef = { directory?: string }

/** AN-facing provider row for Settings — no OC Settings React types. */
export type EngineProviderInfo = {
  id: string
  name: string
  integrationID?: string
  modelCount: number
  /** Free/keyless path (OpenCode catalog) vs BYOK/paid connect. */
  path: "free" | "byok" | "local" | "other"
}

export type EngineModelInfo = {
  id: string
  name: string
  providerID: string
  status?: string
  /** Rough free signal from catalog cost (input+output zero). */
  free: boolean
}

export type EngineConnectByokInput = {
  providerID: string
  key: string
  directory?: string
}

/**
 * AN-owned port surface. Names flexible; shape locked for AnShell send/stream/session + Settings.
 * Optional subscribe lands for PORT-03 event shrink.
 */
export type EnginePort = {
  listSessions(): SessionInfo[]
  createSession(input: EngineSessionCreateInput): EngineSessionCreateResult
  sessionStatus(sessionID: string): string | undefined
  prompt(admission: PromptAdmission): Promise<unknown>
  listMessages(sessionID: string): SessionMessageInfo[]
  listPermissions(sessionID: string): unknown[]
  /** PORT-02: provider catalog for AN Settings. */
  listProviders(location?: EngineLocationRef): EngineProviderInfo[]
  /** PORT-02: model catalog; optional provider filter. */
  listModels(location?: EngineLocationRef & { providerID?: string }): EngineModelInfo[]
  /** PORT-02: refresh provider/model sync from OC server. */
  syncCatalog?(location?: EngineLocationRef): Promise<void>
  /** PORT-02: BYOK API-key connect (delegates to OC integration.connect.key). */
  connectByok?(input: EngineConnectByokInput): Promise<void>
  subscribe?(handler: (event: EngineEvent) => void): () => void
}
