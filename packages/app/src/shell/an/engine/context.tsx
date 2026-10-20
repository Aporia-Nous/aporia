/**
 * AP-ENGINE-PORT-01: Solid context so AnShell + composer share one EnginePort.
 */

import { createContext, useContext, type ParentProps } from "solid-js"
import type { EnginePort } from "./types"

const EnginePortContext = createContext<EnginePort>()

export function EnginePortProvider(props: ParentProps<{ engine: EnginePort }>) {
  return <EnginePortContext.Provider value={props.engine}>{props.children}</EnginePortContext.Provider>
}

/** Throws when used outside EnginePortProvider — AnShell frame always provides one. */
export function useEnginePort(): EnginePort {
  const engine = useContext(EnginePortContext)
  if (!engine) throw new Error("useEnginePort requires EnginePortProvider (AnShell frame)")
  return engine
}

/** Optional lookup for composer/queue — undefined outside AnShell. */
export function tryUseEnginePort(): EnginePort | undefined {
  return useContext(EnginePortContext)
}
