import { describe, expect, test } from "bun:test"
import {
  AN_COMPUTER_EXTERNAL_WINDOW_SURFACE,
  computerExternalOpenTabRelayPath,
  decideExternalBrowserWindowing,
  openExternalBrowserTab,
} from "./computer-external-window"
import { AN_COMPUTER_CDP_RELAY } from "./computer-screencast-relay"

describe("AP-BF-06 external browser windowing", () => {
  test("surface prefers existing-window tab; spawn only when none", () => {
    expect(AN_COMPUTER_EXTERNAL_WINDOW_SURFACE.preferExistingWindowTab).toBe(true)
    expect(AN_COMPUTER_EXTERNAL_WINDOW_SURFACE.spawnOnlyWhenNoBrowser).toBe(true)
    expect(AN_COMPUTER_EXTERNAL_WINDOW_SURFACE.doesNotGrantLive).toBe(true)
    expect(computerExternalOpenTabRelayPath()).toBe(AN_COMPUTER_CDP_RELAY.openTabPath)
  })

  test("policy: CDP up → open tab in existing window", () => {
    const d = decideExternalBrowserWindowing({ cdpReachable: true, browserProcessRunning: true })
    expect(d.action).toBe("open-tab-existing")
    expect(d.reason).toBe("cdp-reachable")
  })

  test("policy: no browser → spawn window allowed", () => {
    const d = decideExternalBrowserWindowing({ cdpReachable: false, browserProcessRunning: false })
    expect(d.action).toBe("spawn-window")
    expect(d.reason).toBe("no-browser-running")
  })

  test("policy: browser running without CDP → refuse second window", () => {
    const d = decideExternalBrowserWindowing({ cdpReachable: false, browserProcessRunning: true })
    expect(d.action).toBe("refuse-second-window")
    expect(d.reason).toBe("browser-running-without-cdp")
    expect(d.detail.toLowerCase()).toContain("second window")
  })

  test("openExternalBrowserTab posts loopback-only open-tab and maps region", async () => {
    const calls: { url: string; body: string }[] = []
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), body: String(init?.body ?? "") })
      return new Response(
        JSON.stringify({
          ok: true,
          decision: {
            action: "open-tab-existing",
            reason: "cdp-reachable",
            detail: "ok",
          },
          endpoint: "http://127.0.0.1:9333",
          regionId: "TAB_1",
          url: "about:blank",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )
    }) as typeof fetch

    const result = await openExternalBrowserTab({
      endpoint: "http://127.0.0.1:9333",
      url: "about:blank",
      family: "edge",
      origin: "http://127.0.0.1:5173",
      fetchImpl,
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.regionId).toBe("TAB_1")
      expect(result.decision.action).toBe("open-tab-existing")
    }
    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toContain(AN_COMPUTER_CDP_RELAY.openTabPath)
    expect(calls[0]!.body).toContain("127.0.0.1:9333")

    const rejected = await openExternalBrowserTab({
      endpoint: "http://10.0.0.2:9333",
      fetchImpl,
    })
    expect(rejected.ok).toBe(false)
    expect(calls).toHaveLength(1)
  })
})
