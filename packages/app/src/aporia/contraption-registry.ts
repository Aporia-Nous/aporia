/**
 * AP-CE-02 — Shared registered Contraption ids for FlowCommands + EnginePort gate.
 * Engine IDs stay flow_*; user brand = Contraptions.
 */

let registered = new Set<string>()
const listeners = new Set<() => void>()

export function setRegisteredContraptionIds(ids: ReadonlyArray<string>): void {
  const next = new Set(ids)
  let changed = next.size !== registered.size
  if (!changed) {
    for (const id of next) {
      if (!registered.has(id)) {
        changed = true
        break
      }
    }
  }
  if (!changed) return
  registered = next
  for (const listener of listeners) {
    try {
      listener()
    } catch {
      /* ignore */
    }
  }
}

export function listRegisteredContraptionIds(): ReadonlyArray<string> {
  return [...registered]
}

export function subscribeRegisteredContraptions(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
