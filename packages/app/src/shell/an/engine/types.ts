/**
 * AP-ENGINE-PORT-01: thin AnShell ↔ OC-server ingress.
 * SessionRunner / providers / tools / DB stay behind OcServerEnginePort.
 * Single writer for AnShell prompt + message list — no parallel ad-hoc data.session.prompt from shell cards.
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

/**
 * AN-owned port surface. Names flexible; shape locked for AnShell send/stream/session.
 * Optional providers + subscribe land for PORT-02 / PORT-03.
 */
export type EnginePort = {
  listSessions(): SessionInfo[]
  createSession(input: EngineSessionCreateInput): EngineSessionCreateResult
  sessionStatus(sessionID: string): string | undefined
  prompt(admission: PromptAdmission): Promise<unknown>
  listMessages(sessionID: string): SessionMessageInfo[]
  listPermissions(sessionID: string): unknown[]
  listProviders?(): unknown
  subscribe?(handler: (event: EngineEvent) => void): () => void
}
