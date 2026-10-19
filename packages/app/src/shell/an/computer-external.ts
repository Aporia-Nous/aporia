// AP-BF-04: user-launched Edge/Chrome consented region path (local loopback only).
// Product architecture — explicit opt-in to the user's own browser workspace.
// Never invent Live; never scan the network; never reach non-loopback hosts.

export const AN_COMPUTER_EXTERNAL_SURFACE = {
  part: "computer-external",
  partAttr: 'data-an-part="computer-external"',
  backend: "external-chromium",
  pathLabel: "Your Edge/Chrome (consented region)",
  loopbackOnly: true,
  defaultEndpointHint: "http://127.0.0.1:9222",
  /** User launches Edge/Chrome with remote debugging for Aporetic — not silent attach. */
  requiresUserLaunch: true,
} as const

export type ExternalBrowserFamily = "edge" | "chrome" | "chromium"

export const EXTERNAL_BROWSER_FAMILIES = ["edge", "chrome", "chromium"] as const

export function isExternalBrowserFamily(value: string): value is ExternalBrowserFamily {
  return (EXTERNAL_BROWSER_FAMILIES as readonly string[]).includes(value)
}

export function externalBrowserFamilyLabel(family: ExternalBrowserFamily): string {
  switch (family) {
    case "edge":
      return "Microsoft Edge"
    case "chrome":
      return "Google Chrome"
    case "chromium":
      return "Chromium"
    default: {
      const _exhaustive: never = family
      return _exhaustive
    }
  }
}

/**
 * Normalize a user-supplied CDP HTTP endpoint.
 * Loopback HTTP only (127.0.0.1 / localhost) — rejects LAN/WAN, credentials, non-http.
 */
export function normalizeExternalBrowserEndpoint(
  input: string,
): { ok: true; endpoint: string; host: "127.0.0.1" | "localhost"; port: number } | { ok: false; error: string } {
  const raw = input.trim()
  if (!raw) {
    return {
      ok: false,
      error: "Enter the loopback debugging address you started (for example http://127.0.0.1:9222).",
    }
  }
  // Require explicit http:// (or bare host:port). Do not treat "localhost:9222" as a custom scheme.
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`
  if (!URL.canParse(withScheme)) {
    return { ok: false, error: "Endpoint could not be parsed." }
  }
  const url = new URL(withScheme)
  if (url.username || url.password) {
    return { ok: false, error: "Endpoints with credentials are not supported." }
  }
  if (url.protocol !== "http:") {
    return { ok: false, error: "Only http:// loopback endpoints are supported for this attach path." }
  }
  const host = url.hostname.toLowerCase()
  if (host !== "127.0.0.1" && host !== "localhost") {
    return {
      ok: false,
      error: "External browser attach is local-only — use 127.0.0.1 or localhost (not a remote host).",
    }
  }
  const port = url.port ? Number(url.port) : 80
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { ok: false, error: "Port must be an integer from 1 to 65535." }
  }
  if (url.pathname && url.pathname !== "/" && url.pathname !== "") {
    return { ok: false, error: "Use the debugging base address only (no path)." }
  }
  if (url.search || url.hash) {
    return { ok: false, error: "Use the debugging base address only (no query or hash)." }
  }
  const normalizedHost = host === "localhost" ? "localhost" : "127.0.0.1"
  return {
    ok: true,
    endpoint: `http://${normalizedHost}:${port}`,
    host: normalizedHost,
    port,
  }
}

/**
 * Region = one CDP target the user explicitly chooses from their own browser
 * (tab/page id). Not a scrape of everyday browsing without opt-in.
 */
export function normalizeExternalBrowserRegion(
  input: string,
): { ok: true; regionId: string } | { ok: false; error: string } {
  const regionId = input.trim()
  if (!regionId) {
    return {
      ok: false,
      error: "Enter the target region id from your Edge/Chrome debugging list (one tab/page).",
    }
  }
  if (regionId.length > 128) {
    return { ok: false, error: "Region id is too long." }
  }
  if (!/^[A-Za-z0-9._:-]+$/.test(regionId)) {
    return {
      ok: false,
      error: "Region id may only use letters, digits, and . _ : -",
    }
  }
  return { ok: true, regionId }
}

export type ExternalBrowserProbeResult =
  | {
      ok: true
      endpoint: string
      browser?: string
      protocolVersion?: string
    }
  | { ok: false; error: string }

/**
 * Consented local check: GET {endpoint}/json/version on loopback only.
 * Caller must already have user consent intent; never probes non-loopback.
 */
export async function probeExternalBrowserEndpoint(
  input: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ExternalBrowserProbeResult> {
  const normalized = normalizeExternalBrowserEndpoint(input)
  if (!normalized.ok) return normalized
  const versionUrl = `${normalized.endpoint}/json/version`
  try {
    const res = await fetchImpl(versionUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(2500),
    })
    if (!res.ok) {
      return {
        ok: false,
        error: `No debugging response at ${normalized.endpoint} (HTTP ${res.status}). Launch Edge/Chrome with remote debugging for Aporetic, then retry.`,
      }
    }
    const body = (await res.json()) as { Browser?: string; "Protocol-Version"?: string }
    return {
      ok: true,
      endpoint: normalized.endpoint,
      browser: typeof body.Browser === "string" ? body.Browser : undefined,
      protocolVersion: typeof body["Protocol-Version"] === "string" ? body["Protocol-Version"] : undefined,
    }
  } catch {
    return {
      ok: false,
      error: `Could not reach ${normalized.endpoint}. Start your Edge/Chrome with a local debugging port you choose, then Check again.`,
    }
  }
}

export function externalAttachConsentCopy(family: ExternalBrowserFamily): string {
  const label = externalBrowserFamilyLabel(family)
  return `Confirm to attach a region in your ${label} (loopback debugging you launch). Local only — not a VM, not remote takeover.`
}
