// AP-BF-02: watch-only page feed into Computer View when Live (local-browser path).
// Real page surface only — never invent Live; Bot cursor stays a separate UI overlay (not in captures).

import { type ComputerAttachState, isComputerLive } from "./computer-attach"

export const AN_COMPUTER_FEED_SURFACE = {
  part: "computer-feed",
  partAttr: 'data-an-part="computer-feed"',
  watchOnly: true,
  /** Bot cursor is Computer View chrome — never painted into agent page captures. */
  includeCursorInCapture: false,
  defaultUrl: "about:blank",
  /** Identifiable workspace start document — real HTML, not a fake Live screenshot. */
  workspaceTitle: "Aporetic local browser workspace",
} as const

export type ComputerFeedPhase = "cleared" | "open"

export type ComputerFeedState = {
  phase: ComputerFeedPhase
  /** Normalized page URL when open; empty when cleared. */
  url: string
  /** Optional srcdoc for about:blank workspace start — real HTML document. */
  srcdoc?: string
  watchOnly: true
  includeCursorInCapture: false
  error?: string
}

/** Real workspace start page shown when attach opens feed at about:blank. */
export function computerFeedWorkspaceSrcdoc(): string {
  const title = AN_COMPUTER_FEED_SURFACE.workspaceTitle
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><title>${title}</title>
<style>
  html,body{margin:0;height:100%;background:#070b10;color:#e8eef6;font:14px/1.45 system-ui,sans-serif}
  main{padding:28px 24px;max-width:42ch}
  h1{margin:0 0 8px;font-size:18px;font-weight:600;color:#f0c66d}
  p{margin:0 0 8px;color:#a8b4c4}
  .tag{display:inline-block;margin-top:10px;padding:2px 8px;border:1px solid rgba(240,198,109,.35);
    border-radius:999px;color:#f0c66d;font-size:11px;letter-spacing:.04em;text-transform:uppercase}
</style></head><body data-an-workspace="local-browser" data-an-feed="workspace-start">
<main><h1>${title}</h1>
<p>Watch-only Computer View feed. Local Chromium path (Edge/Chrome family) — not a VM.</p>
<p>Page pixels are the iframe document. Labeled Bot cursor is a Computer View overlay outside this document.</p>
<span class="tag" data-an-part="feed-workspace-tag">Local browser · watch-only</span>
</main></body></html>`
}

export function clearedComputerFeed(): ComputerFeedState {
  return {
    phase: "cleared",
    url: "",
    srcdoc: undefined,
    watchOnly: true,
    includeCursorInCapture: false,
  }
}

/** Open feed only when Computer View is honestly Live (BF-01 attach). */
export function openComputerFeed(attach: ComputerAttachState): ComputerFeedState {
  if (!isComputerLive(attach)) {
    return {
      ...clearedComputerFeed(),
      error: "Page feed opens only after consented local-browser attach.",
    }
  }
  return {
    phase: "open",
    url: AN_COMPUTER_FEED_SURFACE.defaultUrl,
    srcdoc: computerFeedWorkspaceSrcdoc(),
    watchOnly: true,
    includeCursorInCapture: false,
  }
}

export function clearComputerFeed(_state?: ComputerFeedState): ComputerFeedState {
  return clearedComputerFeed()
}

/** Sync feed to attach honesty — Live opens/keeps feed; disconnect/rescope clears it. */
export function syncComputerFeed(
  feed: ComputerFeedState,
  attach: ComputerAttachState,
): ComputerFeedState {
  if (!isComputerLive(attach)) return clearedComputerFeed()
  if (feed.phase === "open" && feed.url) {
    return {
      ...feed,
      watchOnly: true,
      includeCursorInCapture: false,
      error: undefined,
    }
  }
  return openComputerFeed(attach)
}

/**
 * Normalize a Computer View navigate target: about:blank or http(s) without credentials.
 * Rejects file: and credentialed URLs — keep feed local-browser web-safe for this slice.
 */
export function normalizeComputerFeedUrl(input: string): { ok: true; url: string } | { ok: false; error: string } {
  const raw = input.trim()
  if (!raw) return { ok: false, error: "Enter a URL to load in the watch-only feed." }
  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw) ? raw : `https://${raw}`
  if (withScheme === "about:blank") return { ok: true, url: "about:blank" }
  if (!URL.canParse(withScheme)) return { ok: false, error: "URL could not be parsed." }
  const url = new URL(withScheme)
  if (url.username || url.password) {
    return { ok: false, error: "URLs with credentials are not supported in Computer View." }
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "Only HTTP, HTTPS, and about:blank are supported in this feed." }
  }
  return { ok: true, url: url.href }
}

export function navigateComputerFeed(feed: ComputerFeedState, input: string): ComputerFeedState {
  if (feed.phase !== "open") {
    return { ...feed, error: "Connect and attach before navigating the page feed." }
  }
  const normalized = normalizeComputerFeedUrl(input)
  if (!normalized.ok) {
    return { ...feed, error: normalized.error }
  }
  if (normalized.url === "about:blank") {
    return {
      phase: "open",
      url: "about:blank",
      srcdoc: computerFeedWorkspaceSrcdoc(),
      watchOnly: true,
      includeCursorInCapture: false,
    }
  }
  return {
    phase: "open",
    url: normalized.url,
    srcdoc: undefined,
    watchOnly: true,
    includeCursorInCapture: false,
  }
}

/** Active feed only when Live attach + open phase — never show page surface without Live. */
export function isComputerFeedActive(feed: ComputerFeedState, attach: ComputerAttachState): boolean {
  return isComputerLive(attach) && feed.phase === "open" && !!feed.url
}

export function computerFeedCapturePayload(feed: ComputerFeedState): {
  url: string
  includeCursor: false
} | null {
  if (feed.phase !== "open" || !feed.url) return null
  return { url: feed.url, includeCursor: false }
}
