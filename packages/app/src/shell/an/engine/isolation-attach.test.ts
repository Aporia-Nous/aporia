/**
 * AP-STAGE7-02 — EnginePort isolation attach + chrome UX honesty.
 */
import { afterAll, describe, expect, test } from "bun:test"
import fs from "node:fs"
import path from "node:path"
import { podmanStatusTitle } from "../podman-chrome"
import { createOcServerEnginePort, type OcServerData } from "./oc-server-port"
import {
  AN_ENGINE_ISOLATION_ATTACH,
  chromeStatusFromIsolationAttach,
  createFixtureEngineIsolationAttach,
  createHostEngineIsolationAttach,
  formatEngineIsolationResourceLine,
  measuredResourcesFromAttach,
} from "./isolation-attach"

const EVIDENCE_DIR =
  "C:\\Users\\Dilla\\OneDrive\\Documents\\ChatGPT\\Aporia Nous\\business-control\\evidence"
const METRICS_PATH = path.join(EVIDENCE_DIR, "2026-10-20-ap-stage7-02-metrics.json")

const metrics: Record<string, unknown> = {
  slice: "AP-STAGE7-02",
  recorded_date: "2026-10-20",
  neverAutoInstall: true,
}

function bareData(): OcServerData {
  return {
    session: {
      list: () => [],
      status: () => undefined,
      create: () => ({ id: "ses_x", request: Promise.resolve({ id: "ses_x" } as never) }),
      prompt: async () => ({ ok: true }),
      message: { list: () => [] },
      permission: { list: () => [] },
    },
    location: {
      provider: { list: () => [], sync: async () => undefined, invalidate: () => undefined },
      model: { list: () => [], sync: async () => undefined, invalidate: () => undefined },
    },
  } as unknown as OcServerData
}

describe("AP-STAGE7-02 EnginePort isolation attach", () => {
  test("surface pins: Stage 7 attach, never auto-install, not default Computer View", () => {
    expect(AN_ENGINE_ISOLATION_ATTACH.slice).toBe("AP-STAGE7-02")
    expect(AN_ENGINE_ISOLATION_ATTACH.part).toBe("engine-isolation-attach")
    expect(AN_ENGINE_ISOLATION_ATTACH.neverAutoInstall).toBe(true)
    expect(AN_ENGINE_ISOLATION_ATTACH.neverFakeOnline).toBe(true)
    expect(AN_ENGINE_ISOLATION_ATTACH.notDefaultComputerView).toBe(true)
    expect(AN_ENGINE_ISOLATION_ATTACH.stage7RuntimeSeam).toBe(true)
    expect(AN_ENGINE_ISOLATION_ATTACH.measuredLineOnlyWhenMeasured).toBe(true)
  })

  test("EnginePort exposes isolation when wired; absent when omitted", () => {
    const bare = createOcServerEnginePort(bareData())
    expect(bare.isolation).toBeUndefined()

    const host = createHostEngineIsolationAttach(() => ({ found: false }))
    const withIso = createOcServerEnginePort(bareData(), { isolation: host })
    expect(withIso.isolation).toBe(host)
    expect(withIso.isolation?.neverAutoInstall).toBe(true)
    metrics.enginePortExposesIsolation = true
  })

  test("host missing via EnginePort: measure null, chrome no measured line, isolation BLOCKED", () => {
    const whichRef: { current: { found: boolean; path?: string } | null } = {
      current: { found: false },
    }
    const attach = createHostEngineIsolationAttach(() => whichRef.current)
    const engine = createOcServerEnginePort(bareData(), { isolation: attach })
    expect(engine.isolation!.availability()).toBe("unavailable")
    expect(engine.isolation!.measure()).toBeNull()
    expect(measuredResourcesFromAttach(engine.isolation)).toBeUndefined()

    const chrome = chromeStatusFromIsolationAttach(whichRef.current, engine.isolation)
    expect(chrome.phase).toBe("missing")
    expect(chrome.measured).toBeUndefined()
    expect(podmanStatusTitle(chrome).toLowerCase()).not.toContain("running")

    const blocked = engine.isolation!.createTaskRuntime({
      taskId: "tsk_iso",
      requiresIsolation: true,
    })
    expect(blocked.ok).toBe(false)
    if (!blocked.ok) {
      expect(blocked.blocked).toBe(true)
      expect(blocked.reason.toLowerCase()).toContain("not installed")
    }
    metrics.hostMissingAttach = {
      availability: "unavailable",
      measure: null,
      chromeMeasured: false,
      isolationBlocked: true,
    }
  })

  test("host present binary via EnginePort: still measure null; spawn BLOCKED; no Running title", () => {
    const attach = createHostEngineIsolationAttach(() => ({
      found: true,
      path: "C:\\Tools\\podman\\podman.exe",
    }))
    const engine = createOcServerEnginePort(bareData(), { isolation: attach })
    expect(engine.isolation!.availability()).toBe("available")
    expect(engine.isolation!.measure()).toBeNull()
    const chrome = chromeStatusFromIsolationAttach(
      { found: true, path: "C:\\Tools\\podman\\podman.exe" },
      engine.isolation,
    )
    expect(chrome.phase).toBe("present")
    expect(chrome.measured).toBeUndefined()
    expect(podmanStatusTitle(chrome)).toBe("Podman · installed")
    expect(podmanStatusTitle(chrome).toLowerCase()).not.toContain("running")
    const spawn = engine.isolation!.createTaskRuntime({
      taskId: "tsk_spawn",
      requiresIsolation: true,
    })
    expect(spawn.ok).toBe(false)
    if (!spawn.ok) expect(spawn.reason.toLowerCase()).toContain("not inventing")
    metrics.hostPresentNoMeasure = {
      availability: "available",
      measure: null,
      spawnBlocked: true,
    }
  })

  test("fixture attach: measured idle → active → idleStop; chrome line only when measured", () => {
    const attach = createFixtureEngineIsolationAttach({
      idleCpuMillis: 12,
      idleMemoryBytes: 48 * 1024 * 1024,
      activeCpuMillisPerRuntime: 850,
      activeMemoryBytesPerRuntime: 128 * 1024 * 1024,
    })
    const engine = createOcServerEnginePort(bareData(), { isolation: attach })
    expect(engine.isolation!.availability()).toBe("mocked")

    const idle = engine.isolation!.measure()!
    expect(idle.phase).toBe("idle")
    expect(idle.cpuMillis).toBe(12)
    expect(formatEngineIsolationResourceLine(idle)).toContain("idle")

    const chromeIdle = chromeStatusFromIsolationAttach(
      { found: true, path: "fixture://engine-isolation-attach" },
      engine.isolation,
    )
    expect(chromeIdle.measured?.line).toContain("idle")
    expect(chromeIdle.measured?.source).toBe("fixture")
    expect(podmanStatusTitle(chromeIdle).toLowerCase()).not.toContain("running")

    // Missing which must never show fixture measure (chrome honesty).
    const chromeMissing = chromeStatusFromIsolationAttach({ found: false }, engine.isolation)
    expect(chromeMissing.phase).toBe("missing")
    expect(chromeMissing.measured).toBeUndefined()

    const created = engine.isolation!.createTaskRuntime({
      taskId: "tsk_f",
      requiresIsolation: true,
    })
    expect(created.ok).toBe(true)
    if (!created.ok) throw new Error("create")
    engine.isolation!.executeInRuntime(created.runtimeId, () => "work-ok")
    const active = engine.isolation!.measure()!
    expect(active.phase).toBe("active")
    expect(active.cpuMillis).toBe(12 + 850)
    expect(active.activeRuntimes).toBe(1)

    const stopped = engine.isolation!.idleStop(created.runtimeId)
    expect(stopped.ok).toBe(true)
    if (!stopped.ok) throw new Error("stop")
    expect(stopped.snapshot.phase).toBe("idle")
    expect(engine.isolation!.measure()!.activeRuntimes).toBe(0)

    metrics.fixtureMeasuredViaEnginePort = {
      idleCpuMillis: idle.cpuMillis,
      activeCpuMillis: active.cpuMillis,
      idleAfterStopCpuMillis: stopped.snapshot.cpuMillis,
      chromeMeasuredWhenPresent: true,
      chromeMeasuredWhenMissing: false,
      source: "fixture",
    }
  })

  test("non-isolation create stays host-path when Podman missing", () => {
    const attach = createHostEngineIsolationAttach(() => ({ found: false }))
    const ok = attach.createTaskRuntime({ taskId: "tsk_host", requiresIsolation: false })
    expect(ok.ok).toBe(true)
    if (ok.ok) expect(ok.mode).toBe("host-path")
  })
})

afterAll(() => {
  try {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true })
    fs.writeFileSync(METRICS_PATH, JSON.stringify(metrics, null, 2) + "\n", "utf8")
  } catch {
    // Evidence dir may be locked; suite still asserts in-memory.
  }
})
