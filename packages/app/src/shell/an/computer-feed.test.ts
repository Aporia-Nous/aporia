import { describe, expect, test } from "bun:test"
import {
  beginComputerConsent,
  confirmComputerAttach,
  disconnectComputerAttach,
  initialComputerAttachState,
  isComputerLive,
} from "./computer-attach"
import {
  AN_COMPUTER_FEED_SURFACE,
  clearComputerFeed,
  computerFeedCapturePayload,
  computerFeedWorkspaceSrcdoc,
  isComputerFeedActive,
  navigateComputerFeed,
  normalizeComputerFeedUrl,
  openComputerFeed,
  syncComputerFeed,
} from "./computer-feed"
import { AN_COMPOSER_SURFACE } from "./tokens"

function liveAttach() {
  return confirmComputerAttach(beginComputerConsent(initialComputerAttachState("ses_1")))
}

describe("AP-BF-02 computer feed", () => {
  test("surface markers stay watch-only and cursor-out-of-capture", () => {
    expect(AN_COMPUTER_FEED_SURFACE.part).toBe("computer-feed")
    expect(AN_COMPUTER_FEED_SURFACE.partAttr).toBe('data-an-part="computer-feed"')
    expect(AN_COMPUTER_FEED_SURFACE.watchOnly).toBe(true)
    expect(AN_COMPUTER_FEED_SURFACE.includeCursorInCapture).toBe(false)
    expect(AN_COMPUTER_FEED_SURFACE.defaultUrl).toBe("about:blank")
    // STAGE4-12 ownership must remain untouched by BF-02
    expect(AN_COMPOSER_SURFACE.ownedAttr).toBe('data-an-owned="composer"')
  })

  test("feed closed until Live attach", () => {
    const disconnected = initialComputerAttachState("ses_1")
    const refused = openComputerFeed(disconnected)
    expect(refused.phase).toBe("cleared")
    expect(isComputerFeedActive(refused, disconnected)).toBe(false)

    const consenting = beginComputerConsent(disconnected)
    expect(isComputerLive(consenting)).toBe(false)
    expect(openComputerFeed(consenting).phase).toBe("cleared")
  })

  test("Live attach opens real workspace srcdoc feed", () => {
    const attach = liveAttach()
    const feed = openComputerFeed(attach)
    expect(feed.phase).toBe("open")
    expect(feed.url).toBe("about:blank")
    expect(feed.srcdoc).toContain('data-an-workspace="local-browser"')
    expect(feed.srcdoc).toContain(AN_COMPUTER_FEED_SURFACE.workspaceTitle)
    expect(feed.watchOnly).toBe(true)
    expect(feed.includeCursorInCapture).toBe(false)
    expect(isComputerFeedActive(feed, attach)).toBe(true)
    expect(computerFeedWorkspaceSrcdoc()).toContain("watch-only")
  })

  test("disconnect / clear removes feed (no fake Live pixels)", () => {
    const attach = liveAttach()
    let feed = openComputerFeed(attach)
    expect(isComputerFeedActive(feed, attach)).toBe(true)

    const cleared = clearComputerFeed(feed)
    expect(cleared.phase).toBe("cleared")
    expect(cleared.url).toBe("")
    expect(isComputerFeedActive(cleared, attach)).toBe(false)

    const afterDisconnect = disconnectComputerAttach(attach)
    feed = syncComputerFeed(feed, afterDisconnect)
    expect(feed.phase).toBe("cleared")
    expect(isComputerFeedActive(feed, afterDisconnect)).toBe(false)
  })

  test("sync opens feed when Live and clears when not", () => {
    let attach = initialComputerAttachState("ses_1")
    let feed = syncComputerFeed(clearComputerFeed(), attach)
    expect(feed.phase).toBe("cleared")

    attach = liveAttach()
    feed = syncComputerFeed(feed, attach)
    expect(feed.phase).toBe("open")
    expect(feed.url).toBe("about:blank")

    attach = disconnectComputerAttach(attach)
    feed = syncComputerFeed(feed, attach)
    expect(feed.phase).toBe("cleared")
  })

  test("navigate accepts https and about:blank; rejects credentials and file", () => {
    expect(normalizeComputerFeedUrl("about:blank")).toEqual({ ok: true, url: "about:blank" })
    expect(normalizeComputerFeedUrl("https://example.com/path")).toEqual({
      ok: true,
      url: "https://example.com/path",
    })
    expect(normalizeComputerFeedUrl("example.com")).toEqual({
      ok: true,
      url: "https://example.com/",
    })
    expect(normalizeComputerFeedUrl("https://user:pass@example.com").ok).toBe(false)
    expect(normalizeComputerFeedUrl("file:///C:/secret.txt").ok).toBe(false)

    const attach = liveAttach()
    let feed = openComputerFeed(attach)
    feed = navigateComputerFeed(feed, "https://example.com")
    expect(feed.url).toBe("https://example.com/")
    expect(feed.srcdoc).toBeUndefined()
    expect(feed.includeCursorInCapture).toBe(false)

    feed = navigateComputerFeed(feed, "about:blank")
    expect(feed.srcdoc).toContain("data-an-workspace")
  })

  test("capture payload never includes cursor", () => {
    const feed = openComputerFeed(liveAttach())
    expect(computerFeedCapturePayload(feed)).toEqual({ url: "about:blank", includeCursor: false })
    expect(computerFeedCapturePayload(clearComputerFeed())).toBeNull()
  })
})
