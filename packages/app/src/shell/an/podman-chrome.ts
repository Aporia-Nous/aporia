/**
 * AP-STAGE4-4F — honest Podman chrome (understated local-runtime status).
 * AP-STAGE7-01 may attach a measured idle/active resource line when the isolation
 * seam provides a real snapshot — never invent online/running counts. Never auto-install.
 * Browser-first Computer View remains the default path (see AP-COMPUTER-ARCH).
 */

export const AN_PODMAN_SURFACE = {
  slice: "AP-STAGE4-4F",
  part: "podman-chrome",
  partAttr: 'data-an-part="podman-chrome"',
  label: "Podman",
  subtitle: "Local runtime",
  neverAutoInstall: true,
  neverFakeOnline: true,
  /**
   * Chrome surface itself is still 4F honesty.
   * Measured idle/active come from AP-STAGE7-01 IsolationRuntimePort when attached.
   */
  stage7RuntimeSeam: false,
  /** Do not make VM/Podman the default Computer View. */
  notDefaultComputerView: true,
} as const

/** Honest phases only — no "running" / "online" without Stage 7 measured proof. */
export type AnPodmanPhase = "checking" | "missing" | "present" | "probe-unavailable"

/** Optional measured resources from AP-STAGE7-01 seam — omit when not measured. */
export type AnPodmanMeasuredResources = {
  phase: "idle" | "active"
  /** Understated line already formatted by the seam (cpu / mem / runtimes). */
  line: string
  source: "fixture" | "host-podman"
}

export type AnPodmanStatus = {
  phase: AnPodmanPhase
  /** Absolute path when `which` found the binary — never invent. */
  path?: string
  /** Understated detail for expanded chrome — never invent container/GB counts. */
  detail?: string
  /**
   * Set only when IsolationRuntimePort.measure() returned a snapshot.
   * Missing Podman ⇒ leave undefined (do not invent zeros).
   */
  measured?: AnPodmanMeasuredResources
}

export type AnPodmanWhichResult = {
  found: boolean
  path?: string
}

export type AnPodmanWhichFn = (command: "podman") => Promise<AnPodmanWhichResult>

export function initialPodmanStatus(): AnPodmanStatus {
  return {
    phase: "checking",
    detail: "Checking whether Podman is on PATH…",
  }
}

/** Map a which() result into chrome status — binary present ≠ online/active. */
export function resolvePodmanStatus(
  result: AnPodmanWhichResult | null | undefined,
  measured?: AnPodmanMeasuredResources | null,
): AnPodmanStatus {
  const measuredAttach =
    measured && (measured.phase === "idle" || measured.phase === "active") ? measured : undefined
  if (result == null) {
    return {
      phase: "probe-unavailable",
      detail:
        "Desktop bridge which() unavailable — not inventing Podman online. Isolation runtime status unknown.",
      measured: measuredAttach,
    }
  }
  if (!result.found) {
    return {
      phase: "missing",
      detail:
        "Podman not found on PATH. Isolation runtime unavailable. Not auto-installed. Browser Computer View stays the default.",
      // Host missing: never attach invented resource zeros.
      measured: undefined,
    }
  }
  const path = result.path?.trim() || undefined
  return {
    phase: "present",
    path,
    detail: path
      ? `Binary found at ${path}.${measuredAttach ? ` ${measuredAttach.line}.` : " Idle/active only when Stage 7 seam measures — not claiming containers online."}`
      : measuredAttach
        ? `Binary found on PATH. ${measuredAttach.line}.`
        : "Binary found on PATH. Idle/active only when Stage 7 seam measures — not claiming containers online.",
    measured: measuredAttach,
  }
}

/** Attach a Stage 7 measured line onto an existing status (no phase upgrade to running). */
export function withMeasuredResources(
  status: AnPodmanStatus,
  measured: AnPodmanMeasuredResources | null | undefined,
): AnPodmanStatus {
  if (status.phase === "missing" || status.phase === "checking") {
    return { ...status, measured: undefined }
  }
  if (!measured) return { ...status, measured: undefined }
  return resolvePodmanStatus(
    status.phase === "probe-unavailable"
      ? null
      : { found: true, path: status.path },
    measured,
  )
}

export function podmanStatusTitle(status: AnPodmanStatus): string {
  switch (status.phase) {
    case "checking":
      return "Podman · checking"
    case "missing":
      return "Podman · not installed"
    case "present":
      return "Podman · installed"
    case "probe-unavailable":
      return "Podman · status unknown"
    default: {
      const _exhaustive: never = status.phase
      void _exhaustive
      return "Podman · status unknown"
    }
  }
}

export function podmanStatusTone(status: AnPodmanStatus): "neutral" | "ok" | "warn" {
  switch (status.phase) {
    case "checking":
      return "neutral"
    case "missing":
      return "warn"
    case "present":
      // Present ≠ healthy-online — keep neutral until Stage 7 measures idle/active.
      return "neutral"
    case "probe-unavailable":
      return "neutral"
    default: {
      const _exhaustive: never = status.phase
      void _exhaustive
      return "neutral"
    }
  }
}

/** Mission header pill — never "Podman · running" / fake online. */
export function podmanMissionPill(status: AnPodmanStatus): {
  label: string
  tone: "neutral" | "ok" | "warn"
} {
  return {
    label: podmanStatusTitle(status),
    tone: podmanStatusTone(status),
  }
}

/** Dot label under the card title (understated). */
export function podmanDotLabel(status: AnPodmanStatus): string {
  switch (status.phase) {
    case "checking":
      return "Checking"
    case "missing":
      return "Unavailable"
    case "present":
      return "Installed"
    case "probe-unavailable":
      return "Unknown"
    default: {
      const _exhaustive: never = status.phase
      void _exhaustive
      return "Unknown"
    }
  }
}

/**
 * Read Podman via desktop `aporia.which` when present.
 * Returns null when the bridge is absent (honest probe-unavailable).
 * Never installs or starts Podman.
 */
export async function probePodmanWhich(
  whichFn?: AnPodmanWhichFn | null,
): Promise<AnPodmanWhichResult | null> {
  const fn =
    whichFn ??
    (globalThis as {
      electron?: { aporia?: { which?: AnPodmanWhichFn } }
    }).electron?.aporia?.which
  if (typeof fn !== "function") return null
  try {
    const result = await fn("podman")
    if (!result || typeof result.found !== "boolean") return null
    return {
      found: result.found,
      path: typeof result.path === "string" && result.path.trim() ? result.path.trim() : undefined,
    }
  } catch {
    return null
  }
}

/** CDP / unit probe surface — does not claim Stage 4 complete. */
export type AnPodmanChromeProbe = {
  status: () => AnPodmanStatus
  refresh: () => Promise<AnPodmanStatus>
  surface: typeof AN_PODMAN_SURFACE
}

export function installAnPodmanWindowProbe(
  api: AnPodmanChromeProbe,
  target: object = globalThis,
): void {
  ;(target as { __anPodman?: AnPodmanChromeProbe }).__anPodman = api
}
