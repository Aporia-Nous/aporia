import { describe, expect, test } from "bun:test"
import { browserProfile } from "./profile"

describe("browserProfile", () => {
  test("persists, so a sign-in survives closing the pane and the app", () => {
    // An Electron partition without this prefix keeps its cookies in memory only.
    expect(browserProfile("http://127.0.0.1:4096\nses_1")).toStartWith("persist:")
  })

  test("is stable for one server and session, and separate across them", () => {
    const key = "http://127.0.0.1:4096\nses_1"
    expect(browserProfile(key)).toBe(browserProfile(key))
    expect(browserProfile(key)).not.toBe(browserProfile("http://127.0.0.1:4096\nses_2"))
    expect(browserProfile(key)).not.toBe(browserProfile("http://127.0.0.1:4097\nses_1"))
  })

  test("is a filesystem-safe partition name for any storage key", () => {
    expect(browserProfile("C:\\Users\\Dilla\\Aporia\nses_1")).toMatch(/^persist:[a-z0-9-]+$/)
    expect(browserProfile("https://host/path?q=1#f\nses_a")).toMatch(/^persist:[a-z0-9-]+$/)
  })
})
