// APORIA: sidebar session-list derivations. Pure and precomputed so the frame never
// re-formats a row on every render, the base list is sorted once (not per keystroke),
// and the windowing config is shared with the component (and its test).
import type { SessionInfo } from "@opencode/client/promise"

/** Base list cap: the server already returns at most this many. */
export const SESSION_LIST_LIMIT = 2000
/** 48px row (32px avatar + 2x8px padding) + 2px border + 2px gap, matching the old flex `gap: 2px`. */
export const SESSION_ROW_HEIGHT = 52
export const SESSION_OVERSCAN = 12
/** Filter commits are collapsed to one per window so typing does not rebuild the list per key. */
export const SEARCH_DEBOUNCE_MS = 180
/** Fallback viewport before the nav element is measured, so the first paint projects a bounded window. */
export const SESSION_INITIAL_RECT = { width: 0, height: 600 } as const

/** What the frame needs; built from a live session or from a draft (new-session) screen. */
export function projectName(directory: string | undefined) {
  if (!directory) return "Global"
  return directory.split(/[\\/]/).filter(Boolean).at(-1) ?? directory
}

/** Turn server placeholder titles like "New session - 2026-09-14T03:42:51.7Z" into a readable title. */
export function prettyTitle(title?: string) {
  if (!title) return "Untitled"
  const m = title.match(/^New session\s*-\s*(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)$/)
  if (m) {
    const d = new Date(m[1])
    if (!Number.isNaN(d.getTime()))
      return `New session · ${d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
  }
  return title
}

/** A sidebar row with its expensive strings computed once, at list-build time. */
export type SessionRow = {
  id: string
  session: SessionInfo
  title: string
  meta: string
  search: string
}

export function toSessionRow(session: SessionInfo): SessionRow {
  const project = projectName(session.location?.directory)
  const date = new Date(session.time.updated).toLocaleDateString()
  return {
    id: session.id,
    session,
    title: prettyTitle(session.title),
    meta: `${project} · ${date}`,
    // Matches the original filter exactly (title only), but lowercased once up front.
    search: (session.title ?? "").toLowerCase(),
  }
}

/** Dedupe the server list with the live store (store wins), dropping archived rows. */
export function mergeSessions(all: readonly SessionInfo[] | undefined, local: readonly SessionInfo[], includeChildren: boolean) {
  const merged = new Map<string, SessionInfo>()
  for (const session of all ?? []) merged.set(session.id, session)
  for (const session of local) merged.set(session.id, session)
  return [...merged.values()].filter((session) => (includeChildren || !session.parentID) && !session.time.archived)
}

/** Sort newest-first, cap, then precompute row strings — all off the keystroke path. */
export function toSessionRows(sessions: readonly SessionInfo[]): SessionRow[] {
  return sessions
    .toSorted((a, b) => b.time.updated - a.time.updated)
    .slice(0, SESSION_LIST_LIMIT)
    .map(toSessionRow)
}

export function filterSessionRows(rows: readonly SessionRow[], query: string): SessionRow[] {
  const filter = query.toLowerCase()
  if (!filter) return rows as SessionRow[]
  return rows.filter((row) => row.search.includes(filter))
}

/** Collapse a burst of keystrokes into at most one filter commit per window. */
export function debouncedFilter(commit: (query: string) => void, ms = SEARCH_DEBOUNCE_MS) {
  let timer: ReturnType<typeof setTimeout> | undefined
  const run = (query: string) => {
    if (timer !== undefined) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      commit(query)
    }, ms)
  }
  run.clear = () => {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
  }
  return run
}

/** Virtualizer config shared by the sidebar and its test so the mounted window is provably bounded. */
export function sessionListOptions(input: {
  count: () => number
  getScrollElement?: () => HTMLElement | null
  getItemKey?: (index: number) => string | number
}) {
  return {
    get count() {
      return input.count()
    },
    estimateSize: () => SESSION_ROW_HEIGHT,
    overscan: SESSION_OVERSCAN,
    initialRect: { width: SESSION_INITIAL_RECT.width, height: SESSION_INITIAL_RECT.height },
    getScrollElement: () => input.getScrollElement?.() ?? null,
    getItemKey: (index: number): string | number => input.getItemKey?.(index) ?? index,
  }
}
