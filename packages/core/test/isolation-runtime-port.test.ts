/**
 * AP-STAGE7-01 — Isolation runtime seam: honest missing + fixture idle/active measures.
 */
import { afterAll, describe, expect, test } from "bun:test"
import fs from "node:fs"
import path from "node:path"
import {
  AN_ISOLATION_RUNTIME_SURFACE,
  createFixtureIsolationRuntimePort,
  createHostIsolationRuntimePort,
  formatIsolationResourceLine,
} from "../src/runtime/isolation-port.js"

const EVIDENCE_DIR =
  "C:\\Users\\Dilla\\OneDrive\\Documents\\ChatGPT\\Aporia Nous\\business-control\\evidence"
const METRICS_PATH = path.join(EVIDENCE_DIR, "2026-10-20-ap-stage7-01-metrics.json")

const metrics: Record<string, unknown> = {
  slice: "AP-STAGE7-01",
  recorded_date: "2026-10-20",
  neverAutoInstall: true,
}

describe("AP-STAGE7-01 isolation runtime seam", () => {
  test("surface pins: Stage 7 seam, never auto-install, not default Computer View", () => {
    expect(AN_ISOLATION_RUNTIME.SURFACE_CHECK()).toBe(true)
  })

  test("host missing: unavailable, measure null, isolation-required blocked", () => {
    const port = createHostIsolationRuntimePort(() => ({ found: false }))
    expect(port.neverAutoInstall).toBe(true)
    expect(port.availability()).toBe("unavailable")
    const probe = port.probe()
    expect(probe.phase).toBe("missing")
    expect(probe.detail.toLowerCase()).toContain("not auto-installed")
    expect(port.measure()).toBeNull()
    const blocked = port.createTaskRuntime({ taskId: "tsk_iso", requiresIsolation: true })
    expect(blocked.ok).toBe(false)
    if (!blocked.ok) {
      expect(blocked.blocked).toBe(true)
      expect(blocked.reason.toLowerCase()).toContain("not installed")
    }
    const hostPath = port.createTaskRuntime({ taskId: "tsk_ok", requiresIsolation: false })
    expect(hostPath.ok).toBe(true)
    if (hostPath.ok) expect(hostPath.mode).toBe("host-path")
    metrics.hostMissing = {
      availability: port.availability(),
      probePhase: probe.phase,
      measure: null,
      isolationBlocked: true,
      hostPathOk: hostPath.ok,
    }
  })

  test("host probe-unavailable: measure null, never invent online", () => {
    const port = createHostIsolationRuntimePort(null)
    expect(port.availability()).toBe("unavailable")
    expect(port.probe().phase).toBe("probe-unavailable")
    expect(port.measure()).toBeNull()
    const blocked = port.createTaskRuntime({ taskId: "tsk_x", requiresIsolation: true })
    expect(blocked.ok).toBe(false)
  })

  test("host present binary: still no invented idle/active; spawn blocked this slice", () => {
    const port = createHostIsolationRuntimePort(() => ({
      found: true,
      path: "C:\\Tools\\podman\\podman.exe",
    }))
    expect(port.availability()).toBe("available")
    expect(port.probe().phase).toBe("present")
    expect(port.measure()).toBeNull()
    const spawn = port.createTaskRuntime({ taskId: "tsk_spawn", requiresIsolation: true })
    expect(spawn.ok).toBe(false)
    if (!spawn.ok) {
      expect(spawn.reason.toLowerCase()).toContain("not inventing")
    }
    metrics.hostPresentNoMeasure = {
      availability: "available",
      probePhase: "present",
      measure: null,
      spawnBlocked: true,
    }
  })

  test("fixture: measured idle → active → idle with recorded numbers", () => {
    let t = 0
    const port = createFixtureIsolationRuntimePort({
      idleCpuMillis: 12,
      idleMemoryBytes: 48 * 1024 * 1024,
      activeCpuMillisPerRuntime: 850,
      activeMemoryBytesPerRuntime: 128 * 1024 * 1024,
      now: () => {
        t += 1
        return `2026-10-20T00:00:0${t}.000Z`
      },
    })
    expect(port.availability()).toBe("mocked")
    expect(port.neverAutoInstall).toBe(true)
    const idle = port.measure()
    expect(idle).not.toBeNull()
    expect(idle!.phase).toBe("idle")
    expect(idle!.cpuMillis).toBe(12)
    expect(idle!.memoryBytes).toBe(48 * 1024 * 1024)
    expect(idle!.activeRuntimes).toBe(0)
    expect(formatIsolationResourceLine(idle!)).toContain("idle")

    const created = port.createTaskRuntime({ taskId: "tsk_f", requiresIsolation: true })
    expect(created.ok).toBe(true)
    if (!created.ok) throw new Error("expected create ok")
    expect(created.mode).toBe("isolated")

    const exec = port.executeInRuntime(created.runtimeId, () => "work-ok")
    expect(exec.ok).toBe(true)
    const active = port.measure()
    expect(active!.phase).toBe("active")
    expect(active!.cpuMillis).toBe(12 + 850)
    expect(active!.memoryBytes).toBe(48 * 1024 * 1024 + 128 * 1024 * 1024)
    expect(active!.activeRuntimes).toBe(1)
    expect(formatIsolationResourceLine(active!)).toContain("active")

    const stopped = port.idleStop(created.runtimeId)
    expect(stopped.ok).toBe(true)
    if (!stopped.ok) throw new Error("expected idleStop ok")
    expect(stopped.snapshot.phase).toBe("idle")
    expect(stopped.snapshot.activeRuntimes).toBe(0)
    expect(port.measure()!.phase).toBe("idle")

    metrics.fixtureMeasured = {
      idleCpuMillis: idle!.cpuMillis,
      idleMemoryBytes: idle!.memoryBytes,
      activeCpuMillis: active!.cpuMillis,
      activeMemoryBytes: active!.memoryBytes,
      idleAfterStopCpuMillis: stopped.snapshot.cpuMillis,
      source: "fixture",
    }
  })

  test("fixture does not keep one runtime per roster invent — only created tasks", () => {
    const port = createFixtureIsolationRuntimePort()
    expect(port.measure()!.activeRuntimes).toBe(0)
    const a = port.createTaskRuntime({ taskId: "bot_a_task", requiresIsolation: true })
    const b = port.createTaskRuntime({ taskId: "bot_b_task", requiresIsolation: true })
    expect(a.ok && b.ok).toBe(true)
    if (!a.ok || !b.ok) throw new Error("create")
    // Created but not busy → still idle (no per-roster warm containers).
    expect(port.measure()!.phase).toBe("idle")
    expect(port.measure()!.activeRuntimes).toBe(0)
    port.executeInRuntime(a.runtimeId, () => "a")
    expect(port.measure()!.activeRuntimes).toBe(1)
    port.executeInRuntime(b.runtimeId, () => "b")
    expect(port.measure()!.activeRuntimes).toBe(2)
    port.idleStop(a.runtimeId)
    port.idleStop(b.runtimeId)
    expect(port.measure()!.activeRuntimes).toBe(0)
  })
})

/** Tiny helper so surface const stays exhaustive in the suite. */
const AN_ISOLATION_RUNTIME = {
  SURFACE_CHECK: () =>
    AN_ISOLATION_RUNTIME_SURFACE.slice === "AP-STAGE7-01" &&
    AN_ISOLATION_RUNTIME_SURFACE.neverAutoInstall === true &&
    AN_ISOLATION_RUNTIME_SURFACE.stage7RuntimeSeam === true &&
    AN_ISOLATION_RUNTIME_SURFACE.notDefaultComputerView === true,
}

afterAll(() => {
  try {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true })
    fs.writeFileSync(METRICS_PATH, JSON.stringify(metrics, null, 2) + "\n", "utf8")
  } catch {
    // Evidence dir may be locked; suite still asserts in-memory.
  }
})
