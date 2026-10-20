import type { Accessor } from "solid-js"
import type { ActiveComposerAdapter, ComposerControls } from "@/composer/adapter"
import { useComposerState } from "@/composer/persistence"
import { useData } from "@/runtime/server/current"
import { useServerSDK } from "@/runtime/server/client"
import { tryUseEnginePort } from "@/shell/an/engine"
import { useWorkspaceLocation } from "@/workspaces/location"

export function createActiveComposerAdapter(input: {
  sessionID: string
  controls: Accessor<ComposerControls>
  submitted: () => void
  setEditor: (element: HTMLDivElement) => void
}) {
  const id = input.sessionID

  const prompt = useComposerState()
  prompt.current()
  const state = prompt.capture()
  const data = useData()
  const server = useServerSDK()
  const location = useWorkspaceLocation()
  // AP-ENGINE-PORT-01: under AnShell, composer send goes through EnginePort.prompt.
  const engine = tryUseEnginePort()

  const adapter: ActiveComposerAdapter = {
    kind: "active-session",
    state,
    ready: prompt.ready,
    controls: input.controls,
    working: () => (engine ? engine.sessionStatus(id) === "running" : data.session.status(id) === "running"),
    submitted: input.submitted,
    setEditor: input.setEditor,
    session: () => ({
      id,
      directory: location().directory,
      api: server.api.session,
      data: {
        location: data.location,
        session: {
          prompt: (admission) => (engine ? engine.prompt(admission) : data.session.prompt(admission)),
          setStatus: data.session.setStatus,
        },
      },
      current: () => data.session.get(id),
      admitted: (messageID) => data.session.input.has(id, messageID) || !!data.session.message.get(id, messageID),
    }),
    interrupt: () =>
      server.api.session
        .interrupt({ sessionID: id, resume: true })
        .then(() => undefined)
        .catch(() => undefined),
  }

  return adapter
}
