import { describe, expect, test, vi } from "bun:test"
import { Virtualizer } from "@tanstack/solid-virtual"
import type { SessionInfo } from "@opencode/client/promise"
import {
  SESSION_LIST_LIMIT,
  SESSION_OVERSCAN,
  SESSION_ROW_HEIGHT,
  debouncedFilter,
  filterSessionRows,
  mergeSessions,
  prettyTitle,
  projectName,
  sessionListOptions,
  toSessionRows,
} from "./session-list"

function session(id: string, overrides: Partial<SessionInfo> = {}): SessionInfo {
  return {
    id,
    projectID: "p1",
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: 0, updated: 0 },
    location: { directory: "C:\\work\\demo" },
    title: `Session ${id}`,
    ...overrides,
  } as unknown as SessionInfo
}

// Acceptance #1: with a 2000-session fixture, the window the sidebar mounts is
// bounded (≈ viewport / row height + overscan), independent of the list length.
describe("sessionListOptions windowing bound", () => {
  test("mounts a small, bounded window for 2000 rows", () => {
    const virtualizer = new Virtualizer<HTMLDivElement, HTMLDivElement>({
      ...sessionListOptions({ count: () => SESSION_LIST_LIMIT }),
      getScrollElement: () => null,
      observeElementRect: () => {},
      observeElementOffset: () => {},
      scrollToFn: () => {},
    })

    const items = virtualizer.getVirtualItems()

    expect(items.length).toBeGreaterThan(0)
    // 600px initial viewport / 52px rows = ~12 visible; overscan adds 2 x 12.
    expect(items.length).toBeLessThanOrEqual(60)
    expect(items.length).toBeLessThan(SESSION_LIST_LIMIT)
    expect(items[0]!.index).toBe(0)
  })

  test("bounds the window at every scroll position", () => {
    const virtualizer = new Virtualizer<HTMLDivElement, HTMLDivElement>({
      ...sessionListOptions({ count: () => SESSION_LIST_LIMIT }),
      initialOffset: 50_000,
      getScrollElement: () => null,
      observeElementRect: () => {},
      observeElementOffset: () => {},
      scrollToFn: () => {},
    })

    expect(virtualizer.getVirtualItems().length).toBeLessThanOrEqual(
      Math.ceil(600 / SESSION_ROW_HEIGHT) + SESSION_OVERSCAN * 2 + 4,
    )
  })
})

// Acceptance #2: rapid keystrokes collapse into at most one filter/sort pass per window.
describe("debouncedFilter", () => {
  test("runs once for a burst of keystrokes and keeps the last query", () => {
    vi.useFakeTimers()
    try {
      const calls: string[] = []
      const run = debouncedFilter((q: string) => calls.push(q), 180)

      for (const q of ["a", "ap", "apo", "apor", "apori", "aporia"]) run(q)

      vi.advanceTimersByTime(179)
      expect(calls).toEqual([])

      vi.advanceTimersByTime(1)
      expect(calls).toEqual(["aporia"])

      // A keystroke after the window opens a fresh single commit.
      run("aporia x")
      vi.advanceTimersByTime(180)
      expect(calls).toEqual(["aporia", "aporia x"])

      run("pending")
      run.clear()
      vi.advanceTimersByTime(1000)
      expect(calls).toEqual(["aporia", "aporia x"])
    } finally {
      vi.useRealTimers()
    }
  })
})

describe("mergeSessions", () => {
  test("dedupes by id with the local store winning, and drops archived rows", () => {
    const all = [session("a"), session("b"), session("arch", { time: { created: 0, updated: 0, archived: 1 } })]
    const local = [session("b", { title: "local b" }), session("c")]

    const merged = mergeSessions(all, local, true)

    expect(merged.map((s) => s.id)).toEqual(["a", "b", "c"])
    expect(merged.find((s) => s.id === "b")!.title).toBe("local b")
  })

  test("hides child sessions unless includeChildren is set", () => {
    const all = [session("root"), session("child", { parentID: "root" as unknown as SessionInfo["id"] })]
    expect(mergeSessions(all, [], false).map((s) => s.id)).toEqual(["root"])
    expect(mergeSessions(all, [], true).map((s) => s.id)).toEqual(["root", "child"])
  })
})

describe("toSessionRows + filterSessionRows", () => {
  test("precomputes title/date and sorts newest first", () => {
    const rows = toSessionRows([
      session("old", { title: "Old", time: { created: 0, updated: 10 } }),
      session("new", { title: "New", time: { created: 0, updated: 20 } }),
    ])

    expect(rows.map((r) => r.id)).toEqual(["new", "old"])
    expect(rows[0]!.title).toBe("New")
    expect(rows[0]!.meta).toContain("demo")
  })

  test("filters on the precomputed lowercased title only (behavior parity)", () => {
    const rows = toSessionRows([session("a", { title: "Alpha" }), session("b", { title: "Beta" })])
    expect(filterSessionRows(rows, "ALP").map((r) => r.id)).toEqual(["a"])
    expect(filterSessionRows(rows, "").length).toBe(2)
    expect(filterSessionRows(rows, "zzz").length).toBe(0)
  })

  test("caps the base list at the render limit", () => {
    const many = Array.from({ length: SESSION_LIST_LIMIT + 250 }, (_, i) =>
      session(`s${i}`, { time: { created: 0, updated: i } }),
    )
    expect(toSessionRows(many).length).toBe(SESSION_LIST_LIMIT)
  })
})

describe("row formatting helpers", () => {
  test("prettyTitle rewrites the server placeholder and leaves real titles alone", () => {
    expect(prettyTitle("My chat")).toBe("My chat")
    expect(prettyTitle()).toBe("Untitled")
    const pretty = prettyTitle("New session - 2026-09-14T03:42:51.700Z")
    expect(pretty.startsWith("New session · ")).toBe(true)
    expect(pretty).not.toBe("New session - 2026-09-14T03:42:51.700Z")
  })

  test("projectName takes the last path segment", () => {
    expect(projectName("C:\\Users\\Dilla\\Aporia")).toBe("Aporia")
    expect(projectName("/home/dilla/aporia")).toBe("aporia")
    expect(projectName(undefined)).toBe("Global")
  })
})
