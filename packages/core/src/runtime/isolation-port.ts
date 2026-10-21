/**
 * AP-STAGE7-01 — Isolation runtime seam (brief F first slice).
 *
 * Product boundary for optional task-scoped Podman / isolation.
 * Uses an honest probe + measured idle/active resources. Never auto-installs.
 * Does not tie bot identity to a container lifetime. Does not keep one active
 * container per roster entry. Browser Computer View remains the default path.
 *
 * Host Podman missing/stopped → unavailable + blocked for isolation-required work.
 * Fixture/mocked path records deterministic idle/active numbers for source/unit proof.
 */

export const AN_ISOLATION_RUNTIME_SURFACE = {
  slice: "AP-STAGE7-01",
  part: "isolation-runtime-seam",
  neverAutoInstall: true as const,
  neverFakeOnline: true as const,
  /** Optional isolation — not default Computer View. */
  notDefaultComputerView: true as const,
  stage7RuntimeSeam: true as const,
} as const

/** Probe phases before/without a measured idle|active snapshot. */
export type IsolationProbePhase = "checking" | "missing" | "present" | "probe-unavailable"

export type IsolationAvailability = "available" | "unavailable" | "mocked"

export type IsolationResourceSnapshot = {
  readonly measuredAt: string
  readonly phase: "idle" | "active"
  /** Millicores equivalent; only when actually measured. */
  readonly cpuMillis: number
  /** Resident bytes; only when actually measured. */
  readonly memoryBytes: number
  /** Task-scoped runtimes currently active (never per-roster invent). */
  readonly activeRuntimes: number
  readonly source: "fixture" | "host-podman"
}

export type IsolationProbeResult = {
  readonly phase: IsolationProbePhase
  readonly path?: string
  readonly detail: string
}

export type CreateTaskRuntimeInput = {
  readonly taskId: string
  /** When true, isolation is required — missing Podman must BLOCK, not silently weaken. */
  readonly requiresIsolation: boolean
}

export type CreateTaskRuntimeResult =
  | {
      readonly ok: true
      readonly runtimeId: string
      /** isolated = task-scoped runtime; host-path = authorized non-isolation path. */
      readonly mode: "isolated" | "host-path"
    }
  | {
      readonly ok: false
      readonly blocked: true
      readonly reason: string
    }

export type ExecuteInRuntimeResult =
  | { readonly ok: true; readonly output: string; readonly runtimeId: string }
  | { readonly ok: false; readonly reason: string }

export type IdleStopResult =
  | { readonly ok: true; readonly runtimeId: string; readonly snapshot: IsolationResourceSnapshot }
  | { readonly ok: false; readonly reason: string }

/**
 * Stage 7 seam port. Implementations must not install/start Podman or invent
 * online/running counts without a measured snapshot.
 */
export type IsolationRuntimePort = {
  readonly availability: () => IsolationAvailability
  readonly probe: () => IsolationProbeResult
  /**
   * Measured idle/active resources, or null when not measurable.
   * null ≠ "0 resources" — do not invent zeros for missing Podman.
   */
  readonly measure: () => IsolationResourceSnapshot | null
  readonly createTaskRuntime: (input: CreateTaskRuntimeInput) => CreateTaskRuntimeResult
  readonly executeInRuntime: (
    runtimeId: string,
    work: () => string,
  ) => ExecuteInRuntimeResult
  readonly idleStop: (runtimeId: string) => IdleStopResult
  readonly neverAutoInstall: true
}

export type IsolationWhichResult = {
  readonly found: boolean
  readonly path?: string
}

export type IsolationWhichFn = (command: "podman") => IsolationWhichResult | Promise<IsolationWhichResult>

export type FixtureIsolationSeed = {
  /** Idle baseline (no active task runtimes). */
  readonly idleCpuMillis?: number
  readonly idleMemoryBytes?: number
  /** Per active runtime addend while work runs. */
  readonly activeCpuMillisPerRuntime?: number
  readonly activeMemoryBytesPerRuntime?: number
  readonly now?: () => string
}

type LiveRuntime = {
  readonly taskId: string
  readonly mode: "isolated" | "host-path"
  busy: boolean
}

function isoNow(): string {
  return new Date().toISOString()
}

/** Format understated chrome line from a measured snapshot — never for null. */
export function formatIsolationResourceLine(snapshot: IsolationResourceSnapshot): string {
  const mb = (snapshot.memoryBytes / (1024 * 1024)).toFixed(1)
  const cpu = (snapshot.cpuMillis / 1000).toFixed(2)
  const n = snapshot.activeRuntimes
  const phase = snapshot.phase === "idle" ? "idle" : "active"
  return `${phase} · cpu ${cpu} · mem ${mb} MiB · runtimes ${n}`
}

/**
 * Fixture / mocked seam — deterministic idle/active measures for source/unit.
 * Does not touch host Podman. neverAutoInstall remains true.
 */
export function createFixtureIsolationRuntimePort(
  seed: FixtureIsolationSeed = {},
): IsolationRuntimePort {
  const idleCpu = seed.idleCpuMillis ?? 12
  const idleMem = seed.idleMemoryBytes ?? 48 * 1024 * 1024
  const activeCpuAdd = seed.activeCpuMillisPerRuntime ?? 850
  const activeMemAdd = seed.activeMemoryBytesPerRuntime ?? 128 * 1024 * 1024
  const now = seed.now ?? isoNow
  const runtimes = new Map<string, LiveRuntime>()
  let seq = 0

  const snapshot = (): IsolationResourceSnapshot => {
    const active = [...runtimes.values()].filter((r) => r.busy).length
    const phase = active > 0 ? ("active" as const) : ("idle" as const)
    return {
      measuredAt: now(),
      phase,
      cpuMillis: idleCpu + active * activeCpuAdd,
      memoryBytes: idleMem + active * activeMemAdd,
      activeRuntimes: active,
      source: "fixture",
    }
  }

  return {
    neverAutoInstall: true,
    availability: () => "mocked",
    probe: () => ({
      phase: "present",
      path: "fixture://isolation-runtime",
      detail:
        "Fixture isolation runtime present. Measured idle/active are source/unit only — not host Podman.",
    }),
    measure: () => snapshot(),
    createTaskRuntime: (input) => {
      const taskId = input.taskId?.trim()
      if (!taskId) {
        return { ok: false, blocked: true, reason: "taskId required" }
      }
      const mode = input.requiresIsolation ? ("isolated" as const) : ("host-path" as const)
      seq += 1
      const runtimeId = `rt_fix_${seq}_${taskId}`
      runtimes.set(runtimeId, { taskId, mode, busy: false })
      return { ok: true, runtimeId, mode }
    },
    executeInRuntime: (runtimeId, work) => {
      const rt = runtimes.get(runtimeId)
      if (!rt) return { ok: false, reason: `unknown runtime ${runtimeId}` }
      rt.busy = true
      try {
        const output = work()
        return { ok: true, output, runtimeId }
      } catch (err) {
        rt.busy = false
        return {
          ok: false,
          reason: err instanceof Error ? err.message : "execute failed",
        }
      }
    },
    idleStop: (runtimeId) => {
      const rt = runtimes.get(runtimeId)
      if (!rt) return { ok: false, reason: `unknown runtime ${runtimeId}` }
      rt.busy = false
      runtimes.delete(runtimeId)
      return { ok: true, runtimeId, snapshot: snapshot() }
    },
  }
}

/**
 * Host probe seam — uses which("podman") only. Never installs or starts Podman.
 * When missing: measure() returns null; isolation-required create is blocked.
 */
export function createHostIsolationRuntimePort(whichFn?: IsolationWhichFn | null): IsolationRuntimePort {
  let cached: IsolationWhichResult | null | undefined

  const resolveWhich = (): IsolationWhichResult | null => {
    if (cached !== undefined) return cached
    if (typeof whichFn !== "function") {
      cached = null
      return null
    }
    try {
      const raw = whichFn("podman")
      // Sync-only host factory for unit tests; async which is adapted at UI layer.
      if (raw && typeof (raw as Promise<IsolationWhichResult>).then === "function") {
        cached = null
        return null
      }
      const result = raw as IsolationWhichResult
      if (!result || typeof result.found !== "boolean") {
        cached = null
        return null
      }
      cached = {
        found: result.found,
        path: typeof result.path === "string" && result.path.trim() ? result.path.trim() : undefined,
      }
      return cached
    } catch {
      cached = null
      return null
    }
  }

  return {
    neverAutoInstall: true,
    availability: () => {
      const w = resolveWhich()
      if (w == null) return "unavailable"
      return w.found ? "available" : "unavailable"
    },
    probe: () => {
      const w = resolveWhich()
      if (w == null) {
        return {
          phase: "probe-unavailable",
          detail:
            "Desktop which() unavailable — not inventing Podman online. Isolation status unknown.",
        }
      }
      if (!w.found) {
        return {
          phase: "missing",
          detail:
            "Podman not found on PATH. Isolation runtime unavailable. Not auto-installed. Browser Computer View stays the default.",
        }
      }
      return {
        phase: "present",
        path: w.path,
        detail: w.path
          ? `Binary found at ${w.path}. Host idle/active measure requires a live Podman query — not claimed without proof.`
          : "Binary found on PATH. Host idle/active measure requires a live Podman query — not claimed without proof.",
      }
    },
    measure: () => {
      // Host live stats need Podman machine/query authorization — not invented here.
      // Present binary alone is not a measured idle/active snapshot.
      return null
    },
    createTaskRuntime: (input) => {
      const taskId = input.taskId?.trim()
      if (!taskId) {
        return { ok: false, blocked: true, reason: "taskId required" }
      }
      if (!input.requiresIsolation) {
        return {
          ok: true,
          runtimeId: `rt_hostpath_${taskId}`,
          mode: "host-path",
        }
      }
      const w = resolveWhich()
      if (w == null) {
        return {
          ok: false,
          blocked: true,
          reason:
            "Isolation required but Podman probe unavailable. Not auto-installed. Use browser Computer View or authorize probe.",
        }
      }
      if (!w.found) {
        return {
          ok: false,
          blocked: true,
          reason:
            "Isolation required but Podman is not installed. Not auto-installed. Use an authorized non-isolation path or install Podman yourself.",
        }
      }
      // Binary present but Stage 7-01 does not yet spawn containers without measured host path.
      return {
        ok: false,
        blocked: true,
        reason:
          "Podman binary present but host task-scoped spawn/measure is not authorized in this slice. Not inventing a running container.",
      }
    },
    executeInRuntime: () => ({
      ok: false,
      reason: "Host isolation execute not authorized in AP-STAGE7-01 without measured spawn path.",
    }),
    idleStop: () => ({
      ok: false,
      reason: "Host isolation idle/stop not authorized in AP-STAGE7-01 without measured spawn path.",
    }),
  }
}

/** Map seam probe → 4F-compatible chrome phase (no idle/active without measure). */
export function chromePhaseFromProbe(probe: IsolationProbeResult): IsolationProbePhase {
  return probe.phase
}
