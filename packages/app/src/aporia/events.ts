// APORIA: per-session record of app connections, shown as inline system cards in the chat column.
import { createSignal } from "solid-js"

export type ConnectionEvent = { app: string; at: number; persisted?: string; backup?: string; error?: string }

const KEY = "aporia.connection-events"

function load(): Record<string, ConnectionEvent[]> {
  try {
    return JSON.parse(globalThis.localStorage?.getItem(KEY) ?? "{}")
  } catch {
    return {}
  }
}

const [events, setEvents] = createSignal(load())

export const connectionEvents = {
  list: (sessionID: string | undefined) => (sessionID ? (events()[sessionID] ?? []) : []),
  add(sessionID: string | undefined, event: ConnectionEvent) {
    if (!sessionID) return
    const next = { ...events(), [sessionID]: [...(events()[sessionID] ?? []), event].slice(-20) }
    setEvents(next)
    try {
      globalThis.localStorage?.setItem(KEY, JSON.stringify(next))
    } catch {
      // in-memory only
    }
  },
}

type Bridge = { aporia?: { persistMcp(name: string, config: unknown): Promise<{ file: string; backup?: string }> } }

/** Desktop only: persist into the global opencode config. Returns undefined in the web build. */
export function persistMcp(name: string, config: unknown) {
  const bridge = (globalThis as { electron?: Bridge }).electron
  return bridge?.aporia?.persistMcp(name, config)
}
