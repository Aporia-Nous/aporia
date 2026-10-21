/**
 * AP-STAGE7-02 — EnginePort isolation attach + chrome UX wire.
 *
 * App-local attach surface (AnShell cannot import @opencode/core). Keep shape
 * aligned with packages/core IsolationRuntimePort (AP-STAGE7-01). Never auto-install.
 * Host Podman spawn/live measure stays BLOCKED without authorization. Browser
 * Computer View remains the default path.
 */

import type { AnPodmanMeasuredResources, AnPodmanPhase, AnPodmanStatus } from "../podman-chrome"
import { resolvePodmanStatus } from "../podman-chrome"

export const AN_ENGINE_ISOLATION_ATTACH = {
  slice: "AP-STAGE7-02",
  part: "engine-isolation-attach",
  neverAutoInstall: true as const,
  neverFakeOnline: true as const,
  notDefaultComputerView: true as const,
  stage7RuntimeSeam: true as const,
  /** Chrome measured-line only when measure() returns a snapshot. */
  measuredLineOnlyWhenMeasured: true as const,
} as const

export type EngineIsolationAvailability = "available" | "unavailable" | "mocked"

export type EngineIsolationResourceSnapshot = {
  readonly measuredAt: string
  readonly phase: "idle" | "active"
  readonly cpuMillis: number
  readonly memoryBytes: number
  readonly activeRuntimes: number
  readonly source: "fixture" | "host-podman"
}

export type EngineIsolationProbeResult = {
  readonly phase: AnPodmanPhase
  readonly path?: string
  readonly detail: string
}

export type EngineIsolationCreateInput = {
  readonly taskId: string
  readonly requiresIsolation: boolean
}

export type EngineIsolationCreateResult =
  | {
      readonly ok: true
      readonly runtimeId: string
      readonly mode: "isolated" | "host-path"
    }
  | {
      readonly ok: false
      readonly blocked: true
      readonly reason: string
    }

export type EngineIsolationExecuteResult =
  | { readonly ok: true; readonly output: string; readonly runtimeId: string }
  | { readonly ok: false; readonly reason: string }

export type EngineIsolationIdleStopResult =
  | {
      readonly ok: true
      readonly runtimeId: string
      readonly snapshot: EngineIsolationResourceSnapshot
    }
  | { readonly ok: false; readonly reason: string }

/**
 * Thin AN-facing isolation attach for EnginePort.
 * Implementations must not install/start Podman or invent online counts.
 */
export type EngineIsolationAttach = {
  readonly neverAutoInstall: true
  readonly notDefaultComputerView: true
  readonly availability: () => EngineIsolationAvailability
  readonly probe: () => EngineIsolationProbeResult
  readonly measure: () => EngineIsolationResourceSnapshot | null
  readonly createTaskRuntime: (input: EngineIsolationCreateInput) => EngineIsolationCreateResult
  readonly executeInRuntime: (
    runtimeId: string,
    work: () => string,
  ) => EngineIsolationExecuteResult
  readonly idleStop: (runtimeId: string) => EngineIsolationIdleStopResult
}

export type EngineIsolationWhichResult = {
  readonly found: boolean
  readonly path?: string
}

/** Format understated chrome line — never call for null measure. */
export function formatEngineIsolationResourceLine(
  snapshot: EngineIsolationResourceSnapshot,
): string {
  const mb = (snapshot.memoryBytes / (1024 * 1024)).toFixed(1)
  const cpu = (snapshot.cpuMillis / 1000).toFixed(2)
  const n = snapshot.activeRuntimes
  const phase = snapshot.phase === "idle" ? "idle" : "active"
  return `${phase} · cpu ${cpu} · mem ${mb} MiB · runtimes ${n}`
}

/** Map attach.measure() → chrome measured resources; null → undefined (no invent). */
export function measuredResourcesFromAttach(
  attach: EngineIsolationAttach | null | undefined,
): AnPodmanMeasuredResources | undefined {
  if (!attach) return undefined
  const snap = attach.measure()
  if (!snap) return undefined
  if (snap.phase !== "idle" && snap.phase !== "active") return undefined
  return {
    phase: snap.phase,
    line: formatEngineIsolationResourceLine(snap),
    source: snap.source,
  }
}

/**
 * Build Podman chrome status from which() + optional EnginePort isolation attach.
 * Missing binary never gets a measured line. Mission title never upgrades to Running.
 */
export function chromeStatusFromIsolationAttach(
  which: EngineIsolationWhichResult | null | undefined,
  attach?: EngineIsolationAttach | null,
): AnPodmanStatus {
  return resolvePodmanStatus(which ?? null, measuredResourcesFromAttach(attach))
}

export type FixtureEngineIsolationSeed = {
  readonly idleCpuMillis?: number
  readonly idleMemoryBytes?: number
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

/**
 * Fixture attach for source/unit + DEV inject — deterministic idle/active.
 * Does not touch host Podman.
 */
export function createFixtureEngineIsolationAttach(
  seed: FixtureEngineIsolationSeed = {},
): EngineIsolationAttach {
  const idleCpu = seed.idleCpuMillis ?? 12
  const idleMem = seed.idleMemoryBytes ?? 48 * 1024 * 1024
  const activeCpuAdd = seed.activeCpuMillisPerRuntime ?? 850
  const activeMemAdd = seed.activeMemoryBytesPerRuntime ?? 128 * 1024 * 1024
  const now = seed.now ?? isoNow
  const runtimes = new Map<string, LiveRuntime>()
  let seq = 0

  const snapshot = (): EngineIsolationResourceSnapshot => {
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
    notDefaultComputerView: true,
    availability: () => "mocked",
    probe: () => ({
      phase: "present",
      path: "fixture://engine-isolation-attach",
      detail:
        "Fixture isolation attach present. Measured idle/active are source/unit only — not host Podman.",
    }),
    measure: () => snapshot(),
    createTaskRuntime: (input) => {
      const taskId = input.taskId?.trim()
      if (!taskId) {
        return { ok: false, blocked: true, reason: "taskId required" }
      }
      const mode = input.requiresIsolation ? ("isolated" as const) : ("host-path" as const)
      seq += 1
      const runtimeId = `rt_engfix_${seq}_${taskId}`
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
 * Host attach — uses which("podman") getter only. Never installs or starts Podman.
 * measure() always null until a live host query/spawn is authorized (not this slice).
 */
export function createHostEngineIsolationAttach(
  getWhich?: (() => EngineIsolationWhichResult | null | undefined) | null,
): EngineIsolationAttach {
  const resolveWhich = (): EngineIsolationWhichResult | null => {
    if (typeof getWhich !== "function") return null
    try {
      const result = getWhich()
      if (!result || typeof result.found !== "boolean") return null
      return {
        found: result.found,
        path: typeof result.path === "string" && result.path.trim() ? result.path.trim() : undefined,
      }
    } catch {
      return null
    }
  }

  return {
    neverAutoInstall: true,
    notDefaultComputerView: true,
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
    measure: () => null,
    createTaskRuntime: (input) => {
      const taskId = input.taskId?.trim()
      if (!taskId) {
        return { ok: false, blocked: true, reason: "taskId required" }
      }
      if (!input.requiresIsolation) {
        return {
          ok: true,
          runtimeId: `rt_eng_hostpath_${taskId}`,
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
      return {
        ok: false,
        blocked: true,
        reason:
          "Podman binary present but host task-scoped spawn/measure is not authorized in this slice. Not inventing a running container.",
      }
    },
    executeInRuntime: () => ({
      ok: false,
      reason: "Host isolation execute not authorized in AP-STAGE7-02 without measured spawn path.",
    }),
    idleStop: () => ({
      ok: false,
      reason: "Host isolation idle/stop not authorized in AP-STAGE7-02 without measured spawn path.",
    }),
  }
}
