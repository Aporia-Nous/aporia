// AP-BF-05: loopback-only HTTP relay URLs for CDP page pixels when renderer WebSocket is blocked (Electron).
// Never invent Live; never accept non-loopback endpoints.

import { normalizeExternalBrowserEndpoint, normalizeExternalBrowserRegion } from "./computer-external"

export const AN_COMPUTER_CDP_RELAY = {
  framePath: "/__an/computer-cdp/frame",
  navigatePath: "/__an/computer-cdp/navigate",
  /** AP-BF-06: open tab in existing Edge/Chrome window (spawn only if none). */
  openTabPath: "/__an/computer-cdp/open-tab",
  pollMs: 450,
} as const

export function buildComputerCdpFrameUrl(
  endpoint: string,
  regionId: string,
  origin = "",
): { ok: true; url: string } | { ok: false; error: string } {
  const ep = normalizeExternalBrowserEndpoint(endpoint)
  if (!ep.ok) return ep
  const region = normalizeExternalBrowserRegion(regionId)
  if (!region.ok) return region
  const qs = new URLSearchParams({
    endpoint: ep.endpoint,
    region: region.regionId,
  })
  return { ok: true, url: `${origin}${AN_COMPUTER_CDP_RELAY.framePath}?${qs.toString()}` }
}

export function buildComputerCdpNavigateUrl(origin = ""): string {
  return `${origin}${AN_COMPUTER_CDP_RELAY.navigatePath}`
}

export function buildComputerCdpOpenTabUrl(origin = ""): string {
  return `${origin}${AN_COMPUTER_CDP_RELAY.openTabPath}`
}

export function parseComputerCdpRelayQuery(searchParams: URLSearchParams):
  | { ok: true; endpoint: string; regionId: string }
  | { ok: false; error: string } {
  const ep = normalizeExternalBrowserEndpoint(searchParams.get("endpoint") ?? "")
  if (!ep.ok) return ep
  const region = normalizeExternalBrowserRegion(searchParams.get("region") ?? "")
  if (!region.ok) return region
  return { ok: true, endpoint: ep.endpoint, regionId: region.regionId }
}
