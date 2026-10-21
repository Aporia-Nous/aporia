import { describe, expect, test } from "bun:test"
import {
  beginComputerConsent,
  confirmComputerAttach,
  disconnectComputerAttach,
  initialComputerAttachState,
  isComputerLive,
  selectComputerAttachPath,
  setExternalAttachDraft,
} from "./computer-attach"
import {
  AN_COMPUTER_SCREENCAST_SURFACE,
  applyComputerScreencastFrame,
  clearedComputerScreencast,
  clearComputerScreencast,
  computerPixelSource,
  computerScreencastStatusCopy,
  connectingComputerScreencast,
  failComputerScreencast,
  isComputerScreencastStreaming,
  shouldStartComputerScreencast,
  stopComputerScreencast,
  syncComputerScreencast,
} from "./computer-screencast"
import { resolveExternalTargetWsUrl } from "./computer-screencast-cdp"
import { AN_COMPUTER_CDP_RELAY, buildComputerCdpFrameUrl, parseComputerCdpRelayQuery } from "./computer-screencast-relay"
import { AN_COMPOSER_SURFACE } from "./tokens"

function liveLocal() {
  return confirmComputerAttach(beginComputerConsent(initialComputerAttachState("ses_1")))
}

function liveExternal() {
  let attach = beginComputerConsent(initialComputerAttachState("ses_1"))
  attach = selectComputerAttachPath(attach, "external-chromium")
  attach = setExternalAttachDraft(attach, {
    family: "edge",
    endpoint: "http://127.0.0.1:9222",
    region: "PAGE_REGION_1",
  })
  return confirmComputerAttach(attach)
}

describe("AP-BF-05 computer screencast", () => {
  test("surface markers keep cursor out of capture + STAGE4-12 ownership untouched", () => {
    expect(AN_COMPUTER_SCREENCAST_SURFACE.part).toBe("computer-screencast")
    expect(AN_COMPUTER_SCREENCAST_SURFACE.framePart).toBe("computer-screencast-frame")
    expect(AN_COMPUTER_SCREENCAST_SURFACE.includeCursorInCapture).toBe(false)
    expect(AN_COMPUTER_SCREENCAST_SURFACE.source).toBe("cdp-screencast")
    expect(AN_COMPOSER_SURFACE.ownedAttr).toBe('data-an-owned="composer"')
  })

  test("screencast starts only for external Live — never invents Live for local or consenting", () => {
    expect(shouldStartComputerScreencast(initialComputerAttachState("ses_1"))).toBe(false)
    expect(shouldStartComputerScreencast(beginComputerConsent(initialComputerAttachState("ses_1")))).toBe(
      false,
    )
    expect(shouldStartComputerScreencast(liveLocal())).toBe(false)
    const external = liveExternal()
    expect(isComputerLive(external)).toBe(true)
    expect(shouldStartComputerScreencast(external)).toBe(true)
  })

  test("pixel source honesty: local iframe; external only when streaming frame", () => {
    const local = liveLocal()
    expect(computerPixelSource(local, clearedComputerScreencast(), true)).toBe("iframe")
    expect(computerPixelSource(local, clearedComputerScreencast(), false)).toBe("none")

    const external = liveExternal()
    const connecting = connectingComputerScreencast("http://127.0.0.1:9222", "PAGE_REGION_1")
    expect(computerPixelSource(external, connecting, true)).toBe("none")

    const streaming = applyComputerScreencastFrame(connecting, {
      data: "abc123",
      sessionId: 7,
    })
    expect(streaming.phase).toBe("streaming")
    expect(streaming.frameDataUrl).toBe("data:image/jpeg;base64,abc123")
    expect(streaming.includeCursorInCapture).toBe(false)
    expect(isComputerScreencastStreaming(streaming)).toBe(true)
    expect(computerPixelSource(external, streaming, true)).toBe("cdp-screencast")
  })

  test("disconnect / clear removes frames (no fake Live pixels)", () => {
    let state = connectingComputerScreencast("http://127.0.0.1:9222", "PAGE_REGION_1")
    state = applyComputerScreencastFrame(state, { data: "frame", sessionId: 1 })
    expect(state.frameCount).toBe(1)

    state = clearComputerScreencast(state)
    expect(state.phase).toBe("idle")
    expect(state.frameDataUrl).toBeUndefined()
    expect(isComputerScreencastStreaming(state)).toBe(false)

    const afterDisconnect = disconnectComputerAttach(liveExternal())
    state = syncComputerScreencast(state, afterDisconnect)
    expect(state.phase).toBe("idle")
    expect(shouldStartComputerScreencast(afterDisconnect)).toBe(false)
  })

  test("sync opens connecting for external Live and clears when not", () => {
    let attach = initialComputerAttachState("ses_1")
    let cast = syncComputerScreencast(clearedComputerScreencast(), attach)
    expect(cast.phase).toBe("idle")

    attach = liveExternal()
    cast = syncComputerScreencast(cast, attach)
    expect(cast.phase).toBe("connecting")
    expect(cast.endpoint).toBe("http://127.0.0.1:9222")
    expect(cast.regionId).toBe("PAGE_REGION_1")

    cast = applyComputerScreencastFrame(cast, { data: "x", sessionId: 2 })
    cast = syncComputerScreencast(cast, attach)
    expect(cast.phase).toBe("streaming")

    attach = disconnectComputerAttach(attach)
    cast = syncComputerScreencast(cast, attach)
    expect(cast.phase).toBe("idle")
    expect(cast.frameDataUrl).toBeUndefined()
  })

  test("error and stop never claim streaming without a frame", () => {
    let state = connectingComputerScreencast("http://127.0.0.1:9222", "R1")
    state = failComputerScreencast(state, "Region not found.")
    expect(state.phase).toBe("error")
    expect(state.frameDataUrl).toBeUndefined()
    expect(isComputerScreencastStreaming(state)).toBe(false)
    expect(computerScreencastStatusCopy(state)).toContain("Region not found")

    state = stopComputerScreencast(state)
    expect(state.phase).toBe("stopped")
    expect(state.frameDataUrl).toBeUndefined()
  })

  test("resolveExternalTargetWsUrl rejects non-loopback and missing region (mock fetch)", async () => {
    const remote = await resolveExternalTargetWsUrl(
      "http://192.168.1.9:9222",
      "R1",
      (async () => {
        throw new Error("should not fetch")
      }) as unknown as typeof fetch,
    )
    expect(remote.ok).toBe(false)

    const missing = await resolveExternalTargetWsUrl(
      "http://127.0.0.1:9222",
      "MISSING_REGION",
      (async () =>
        new Response(
          JSON.stringify([
            {
              id: "OTHER",
              type: "page",
              webSocketDebuggerUrl: "ws://127.0.0.1:9222/devtools/page/OTHER",
            },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        )) as unknown as typeof fetch,
    )
    expect(missing.ok).toBe(false)
    if (!missing.ok) expect(missing.error).toContain("MISSING_REGION")

    const ok = await resolveExternalTargetWsUrl(
      "http://127.0.0.1:9222",
      "PAGE_OK",
      (async () =>
        new Response(
          JSON.stringify([
            {
              id: "PAGE_OK",
              type: "page",
              title: "Demo",
              url: "https://example.com/",
              webSocketDebuggerUrl: "ws://127.0.0.1:9222/devtools/page/PAGE_OK",
            },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        )) as unknown as typeof fetch,
    )
    expect(ok.ok).toBe(true)
    if (ok.ok) {
      expect(ok.wsUrl).toBe("ws://127.0.0.1:9222/devtools/page/PAGE_OK")
      expect(ok.regionId).toBe("PAGE_OK")
    }

    const badWs = await resolveExternalTargetWsUrl(
      "http://127.0.0.1:9222",
      "REMOTE_WS",
      (async () =>
        new Response(
          JSON.stringify([
            {
              id: "REMOTE_WS",
              type: "page",
              webSocketDebuggerUrl: "ws://10.0.0.2:9222/devtools/page/REMOTE_WS",
            },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        )) as unknown as typeof fetch,
    )
    expect(badWs.ok).toBe(false)
  })

  test("HTTP pixel relay URLs stay loopback-only", () => {
    expect(AN_COMPUTER_CDP_RELAY.framePath).toBe("/__an/computer-cdp/frame")
    const ok = buildComputerCdpFrameUrl("http://127.0.0.1:9333", "PAGE_1", "http://localhost:5173")
    expect(ok.ok).toBe(true)
    if (ok.ok) {
      expect(ok.url).toContain("/__an/computer-cdp/frame?")
      expect(ok.url).toContain("endpoint=http%3A%2F%2F127.0.0.1%3A9333")
      expect(ok.url).toContain("region=PAGE_1")
    }
    expect(buildComputerCdpFrameUrl("http://192.168.0.5:9333", "PAGE_1").ok).toBe(false)
    const parsed = parseComputerCdpRelayQuery(
      new URLSearchParams({ endpoint: "http://127.0.0.1:9333", region: "R1" }),
    )
    expect(parsed).toEqual({ ok: true, endpoint: "http://127.0.0.1:9333", regionId: "R1" })
  })
})
