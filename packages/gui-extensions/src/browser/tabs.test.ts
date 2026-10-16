import { describe, expect, test } from "bun:test"
import { Browser } from "@opencode/plugin-browser/rpc"
import { openTab } from "./tabs"

const A = "tab_11111111-1111-1111-1111-111111111111"
const B = "tab_22222222-2222-2222-2222-222222222222"

const tab = (id: string, url: string, loadError?: string): Browser.Tab => ({
  id: Browser.TabID.make(id),
  url,
  title: "",
  loading: false,
  loadError,
  canGoBack: false,
  canGoForward: false,
  generation: 0,
})

/** The matched tab's id as a plain string, for readable assertions. */
const id = (tabs: ReadonlyArray<Browser.Tab>, url: string) => {
  const found = openTab(tabs, url)
  return found === undefined ? undefined : String(found.id)
}

describe("openTab", () => {
  test("finds the tab already showing the url, so it is focused instead of duplicated", () => {
    const tabs = [tab(A, "about:blank"), tab(B, "https://example.com/")]
    expect(id(tabs, "https://example.com/")).toBe(B)
  })

  test("ignores a tab whose load failed, so retrying the url navigates again", () => {
    const failed = tab(A, "https://example.com/", "ERR_CONNECTION_REFUSED")
    expect(openTab([failed], "https://example.com/")).toBeUndefined()
    expect(id([failed, tab(B, "https://example.com/")], "https://example.com/")).toBe(B)
  })

  test("does not treat a different url, including a redirected one, as the same page", () => {
    const tabs = [tab(A, "https://example.com/home"), tab(B, "https://example.com/")]
    expect(id(tabs, "https://example.com/")).toBe(B)
    expect(openTab(tabs, "https://example.com/other")).toBeUndefined()
  })

  test("reuses an existing blank tab for the default open", () => {
    expect(id([tab(A, "about:blank")], "about:blank")).toBe(A)
  })
})
