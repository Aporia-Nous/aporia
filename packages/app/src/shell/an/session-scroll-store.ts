/**
 * AP-STAGE4-MISSION-RESTART — per-identity conversation scroll survival.
 * UI state only (handoff: separate from durable mission work). localStorage-backed
 * so Mission A→B→A and quit/reopen restore mid-thread scroll.
 */
import type { AnDraftIdentity } from "./session-draft-store"
import { anDraftKeys } from "./session-draft-store"

const STORAGE_KEY = "an.shell.scroll.v1"
const scrolls = new Map<string, number>()
let hydrated = false

function canUseStorage(): boolean {
  try {
    return typeof localStorage !== "undefined" && !!localStorage
  } catch {
    return false
  }
}

function hydrate() {
  if (hydrated) return
  hydrated = true
  if (!canUseStorage()) return
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const obj = JSON.parse(raw) as Record<string, unknown>
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
        scrolls.set(key, value)
      }
    }
  } catch {
    /* ignore corrupt UI state */
  }
}

function persist() {
  if (!canUseStorage()) return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(scrolls)))
  } catch {
    /* quota / private mode */
  }
}

export function anScrollSaveIdentity(input: AnDraftIdentity, top: number): number {
  hydrate()
  const value = Math.max(0, Math.round(top))
  // Do not clobber a restored mid-scroll with a raced pin-to-bottom 0 (reload / remount).
  if (value === 0) {
    const existing = anScrollLoadIdentity(input)
    if (typeof existing === "number" && existing > 0) return existing
  }
  for (const key of anDraftKeys(input)) scrolls.set(key, value)
  persist()
  return value
}

export function anScrollLoadIdentity(input: AnDraftIdentity): number | undefined {
  hydrate()
  for (const key of anDraftKeys(input)) {
    if (scrolls.has(key)) return scrolls.get(key)
  }
  return undefined
}

export function anScrollHasIdentity(input: AnDraftIdentity): boolean {
  return anScrollLoadIdentity(input) !== undefined
}

/** Apply saved scroll into a conversation scroller. Returns whether a value was applied. */
export function anScrollApplyIdentity(el: HTMLElement | null | undefined, input: AnDraftIdentity): boolean {
  const top = anScrollLoadIdentity(input)
  if (top === undefined || !el) return false
  const prev = el.style.scrollBehavior
  el.style.scrollBehavior = "auto"
  el.scrollTop = top
  el.style.scrollBehavior = prev
  return true
}

/** Read live conversation scroller (owned AnShell stream). */
export function findAnConversationScroller(root: ParentNode = document): HTMLElement | undefined {
  const el = root.querySelector('[data-component="an-conversation"]')
  return el instanceof HTMLElement ? el : undefined
}

export function anScrollSaveFromDom(input: AnDraftIdentity, root: ParentNode = document): number | undefined {
  const el = findAnConversationScroller(root)
  if (!el) return undefined
  return anScrollSaveIdentity(input, el.scrollTop)
}

export function anScrollClearForTests() {
  scrolls.clear()
  hydrated = false
  if (canUseStorage()) {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
  }
}

export function anScrollSizeForTests() {
  hydrate()
  return scrolls.size
}

/** DEV/CDP probe surface — scroll tops only, no secrets. */
export function anScrollInstallWindowProbe(target: Record<string, unknown> = globalThis as never) {
  hydrate()
  const probe = {
    save: anScrollSaveIdentity,
    load: anScrollLoadIdentity,
    apply: (input: AnDraftIdentity) => anScrollApplyIdentity(findAnConversationScroller(), input),
    has: anScrollHasIdentity,
    size: () => {
      hydrate()
      return scrolls.size
    },
  }
  ;(target as { __anScroll?: typeof probe }).__anScroll = probe
  return probe
}
