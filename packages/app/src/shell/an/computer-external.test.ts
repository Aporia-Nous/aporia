import { describe, expect, test } from "bun:test"
import {
  AN_COMPUTER_EXTERNAL_SURFACE,
  normalizeExternalBrowserEndpoint,
  normalizeExternalBrowserRegion,
  probeExternalBrowserEndpoint,
} from "./computer-external"
import { AN_COMPOSER_SURFACE } from "./tokens"

describe("AP-BF-04 external Edge/Chrome region", () => {
  test("surface stays loopback-only and browser-first", () => {
    expect(AN_COMPUTER_EXTERNAL_SURFACE.backend).toBe("external-chromium")
    expect(AN_COMPUTER_EXTERNAL_SURFACE.loopbackOnly).toBe(true)
    expect(AN_COMPUTER_EXTERNAL_SURFACE.requiresUserLaunch).toBe(true)
    expect(AN_COMPOSER_SURFACE.ownedAttr).toBe('data-an-owned="composer"')
  })

  test("accepts loopback endpoints only", () => {
    expect(normalizeExternalBrowserEndpoint("http://127.0.0.1:9222")).toEqual({
      ok: true,
      endpoint: "http://127.0.0.1:9222",
      host: "127.0.0.1",
      port: 9222,
    })
    expect(normalizeExternalBrowserEndpoint("localhost:9333").ok).toBe(true)
    expect(normalizeExternalBrowserEndpoint("http://192.168.1.10:9222").ok).toBe(false)
    expect(normalizeExternalBrowserEndpoint("http://example.com:9222").ok).toBe(false)
    expect(normalizeExternalBrowserEndpoint("https://127.0.0.1:9222").ok).toBe(false)
    expect(normalizeExternalBrowserEndpoint("http://user:pass@127.0.0.1:9222").ok).toBe(false)
  })

  test("normalizes region ids", () => {
    expect(normalizeExternalBrowserRegion("PAGE_1-ab")).toEqual({ ok: true, regionId: "PAGE_1-ab" })
    expect(normalizeExternalBrowserRegion("").ok).toBe(false)
    expect(normalizeExternalBrowserRegion("bad id!").ok).toBe(false)
  })

  test("probe only hits normalized loopback and maps JSON version", async () => {
    const calls: string[] = []
    const fetchImpl = (async (input: RequestInfo | URL) => {
      calls.push(String(input))
      return new Response(JSON.stringify({ Browser: "Edg/120", "Protocol-Version": "1.3" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }) as typeof fetch

    const ok = await probeExternalBrowserEndpoint("127.0.0.1:9222", fetchImpl)
    expect(ok.ok).toBe(true)
    if (ok.ok) {
      expect(ok.endpoint).toBe("http://127.0.0.1:9222")
      expect(ok.browser).toBe("Edg/120")
    }
    expect(calls).toEqual(["http://127.0.0.1:9222/json/version"])

    const rejected = await probeExternalBrowserEndpoint("http://10.0.0.2:9222", fetchImpl)
    expect(rejected.ok).toBe(false)
    expect(calls).toHaveLength(1)
  })
})
