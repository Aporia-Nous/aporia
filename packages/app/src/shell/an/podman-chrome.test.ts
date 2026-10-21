import { describe, expect, test } from "bun:test"
import { AN_COMPOSER_SURFACE } from "./tokens"
import {
  AN_PODMAN_SURFACE,
  initialPodmanStatus,
  podmanDotLabel,
  podmanMissionPill,
  podmanStatusTitle,
  podmanStatusTone,
  resolvePodmanStatus,
  withMeasuredResources,
} from "./podman-chrome"
import { AN_NAV_ILLUSTRATED, isAnNavIconName } from "./nav-illustrated"

describe("AP-STAGE4-4F Podman chrome honesty", () => {
  test("surface pins never-auto-install and never-fake-online; not Stage 7 seam", () => {
    expect(AN_PODMAN_SURFACE.slice).toBe("AP-STAGE4-4F")
    expect(AN_PODMAN_SURFACE.part).toBe("podman-chrome")
    expect(AN_PODMAN_SURFACE.partAttr).toBe('data-an-part="podman-chrome"')
    expect(AN_PODMAN_SURFACE.neverAutoInstall).toBe(true)
    expect(AN_PODMAN_SURFACE.neverFakeOnline).toBe(true)
    expect(AN_PODMAN_SURFACE.stage7RuntimeSeam).toBe(false)
    expect(AN_PODMAN_SURFACE.notDefaultComputerView).toBe(true)
    // Ownership non-regression: EnginePort / composer ownership untouched by this surface.
    expect(AN_COMPOSER_SURFACE.ownedAttr).toBe('data-an-owned="composer"')
  })

  test("missing which result stays unavailable — never Running / online", () => {
    const status = resolvePodmanStatus({ found: false })
    expect(status.phase).toBe("missing")
    expect(podmanStatusTitle(status)).toBe("Podman · not installed")
    expect(podmanDotLabel(status)).toBe("Unavailable")
    expect(podmanStatusTone(status)).toBe("warn")
    expect(status.detail?.toLowerCase()).toContain("not installed automatically")
    expect(podmanStatusTitle(status).toLowerCase()).not.toContain("running")
    expect(status.measured).toBeUndefined()
    // Invented measure must not attach on missing even if caller passes one.
    const forced = resolvePodmanStatus(
      { found: false },
      { phase: "idle", line: "idle · cpu 0.00 · mem 0.0 MiB · runtimes 0", source: "fixture" },
    )
    expect(forced.measured).toBeUndefined()
  })

  test("present binary is installed — not fake online / container counts", () => {
    const status = resolvePodmanStatus({ found: true, path: "C:\\Tools\\podman\\podman.exe" })
    expect(status.phase).toBe("present")
    expect(podmanStatusTitle(status)).toBe("Podman · installed")
    expect(podmanDotLabel(status)).toBe("Installed")
    expect(podmanStatusTone(status)).toBe("neutral")
    expect(status.path).toContain("podman")
    expect(status.detail?.toLowerCase()).toContain("when measured")
    expect(podmanStatusTitle(status).toLowerCase()).not.toContain("running")
    expect(status.detail?.toLowerCase()).not.toMatch(/\d+\s*containers?/)
    expect(status.detail?.toLowerCase()).not.toMatch(/\d+(\.\d+)?\s*gb/)
    expect(status.measured).toBeUndefined()
  })

  test("AP-STAGE7-01 measured line attaches only when binary present", () => {
    const measured = {
      phase: "idle" as const,
      line: "idle · cpu 0.01 · mem 48.0 MiB · runtimes 0",
      source: "fixture" as const,
    }
    const status = resolvePodmanStatus({ found: true, path: "C:\\Tools\\podman\\podman.exe" }, measured)
    expect(status.phase).toBe("present")
    expect(status.measured?.line).toContain("idle")
    expect(status.detail?.toLowerCase()).toContain("idle")
    expect(podmanStatusTitle(status).toLowerCase()).not.toContain("running")
    const missingKept = withMeasuredResources(resolvePodmanStatus({ found: false }), measured)
    expect(missingKept.measured).toBeUndefined()
  })

  test("null probe is probe-unavailable — does not invent online", () => {
    const status = resolvePodmanStatus(null)
    expect(status.phase).toBe("probe-unavailable")
    expect(podmanStatusTitle(status)).toContain("unknown")
    expect(status.detail?.toLowerCase()).toContain("can't check")
  })

  test("mission pill never claims running", () => {
    const missing = podmanMissionPill(resolvePodmanStatus({ found: false }))
    expect(missing.label).toBe("Podman · not installed")
    expect(missing.tone).toBe("warn")
    const present = podmanMissionPill(resolvePodmanStatus({ found: true }))
    expect(present.label).toBe("Podman · installed")
    expect(present.label.toLowerCase()).not.toContain("running")
  })

  test("initial status is checking", () => {
    expect(initialPodmanStatus().phase).toBe("checking")
  })
})

describe("AP-STAGE4-4F illustrated nav set", () => {
  test("nav illustrated markers cover shell rail icons", () => {
    expect(AN_NAV_ILLUSTRATED.slice).toBe("AP-STAGE4-4F")
    expect(AN_NAV_ILLUSTRATED.part).toBe("nav-illustrated")
    expect(AN_NAV_ILLUSTRATED.style).toBe("illustrated-line-fill")
    expect([...AN_NAV_ILLUSTRATED.icons]).toEqual([
      "home",
      "missions",
      "contraptions",
      "review",
      "knowledge",
      "settings",
    ])
    expect(isAnNavIconName("home")).toBe(true)
    expect(isAnNavIconName("emoji")).toBe(false)
    expect(AN_COMPOSER_SURFACE.ownedAttr).toBe('data-an-owned="composer"')
  })
})
