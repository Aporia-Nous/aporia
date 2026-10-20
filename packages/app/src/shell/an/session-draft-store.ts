/**
 * AP-STAGE4-B1 + AP-STAGE4-MISSION-RESTART — AnShell per-session/teammate composer draft map.
 *
 * ComposerPersistenceProvider keys drafts by route session id, but roster switches can
 * change the selected teammate without a durable URL/session remount order that flushes
 * TipTap/contenteditable → store. This Map is the Stage-4 owned survival layer:
 * save on leave, restore on enter.
 *
 * Keys are aliased across session id + agent + roster slug so home (`/`) and session
 * routes resolve the same teammate draft.
 *
 * MISSION-RESTART: Map is also mirrored to localStorage (`an.shell.drafts.v1`) so
 * quit/reopen / renderer reload keeps identity-aliased drafts even when the in-memory
 * Map is cleared (ComposerPersistenceProvider remains the session-id path).
 */
import {
  findComposerEditor,
  flushComposerEditorDom,
  readComposerEditorText,
} from "@/composer/session-draft"

const STORAGE_KEY = "an.shell.drafts.v1"
const drafts = new Map<string, string>()
let hydrated = false

export type AnDraftIdentity = { sessionID?: string; agent?: string; slug?: string }

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
      if (typeof value === "string") drafts.set(key, value)
    }
  } catch {
    /* ignore corrupt UI state */
  }
}

function persist() {
  if (!canUseStorage()) return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(drafts)))
  } catch {
    /* quota / private mode */
  }
}

export function anDraftKeys(input: AnDraftIdentity): string[] {
  const keys: string[] = []
  // Agent/slug first — stable across home `/` vs session routes; session id is an alias.
  if (input.agent) keys.push(`agent:${input.agent}`)
  if (input.slug) keys.push(`slug:${input.slug}`)
  if (input.sessionID) keys.push(`ses:${input.sessionID}`)
  if (keys.length === 0) keys.push("workspace")
  return keys
}

/** Primary key — agent preferred (stable across home/session). */
export function anDraftKey(input: AnDraftIdentity): string {
  return anDraftKeys(input)[0] ?? "workspace"
}

export function anDraftSave(key: string, text?: string): string {
  hydrate()
  const value = text ?? readComposerEditorText(findComposerEditor())
  drafts.set(key, value)
  persist()
  flushComposerEditorDom()
  return value
}

/** Save under all identity aliases so leave/enter can use session or agent keys. */
export function anDraftSaveIdentity(input: AnDraftIdentity, text?: string): string {
  hydrate()
  const value = text ?? readComposerEditorText(findComposerEditor())
  for (const key of anDraftKeys(input)) drafts.set(key, value)
  persist()
  flushComposerEditorDom()
  return value
}

export function anDraftLoad(key: string): string | undefined {
  hydrate()
  return drafts.get(key)
}

export function anDraftLoadIdentity(input: AnDraftIdentity): string | undefined {
  hydrate()
  for (const key of anDraftKeys(input)) {
    if (drafts.has(key)) return drafts.get(key)
  }
  return undefined
}

export function anDraftHas(key: string): boolean {
  hydrate()
  return drafts.has(key)
}

export function anDraftHasIdentity(input: AnDraftIdentity): boolean {
  hydrate()
  return anDraftKeys(input).some((key) => drafts.has(key))
}

/** Write a stored draft into the live editor and notify the Solid onInput path. */
export function anDraftApply(key: string): boolean {
  hydrate()
  if (!drafts.has(key)) return false
  const text = drafts.get(key) ?? ""
  const editor = findComposerEditor()
  if (!editor) return false
  editor.focus()
  editor.textContent = text
  editor.dispatchEvent(
    new InputEvent("input", { bubbles: true, cancelable: true, inputType: "insertText" }),
  )
  return true
}

export function anDraftApplyIdentity(input: AnDraftIdentity): boolean {
  const text = anDraftLoadIdentity(input)
  if (text === undefined) return false
  const editor = findComposerEditor()
  if (!editor) return false
  editor.focus()
  editor.textContent = text
  editor.dispatchEvent(
    new InputEvent("input", { bubbles: true, cancelable: true, inputType: "insertText" }),
  )
  // Re-alias under current identity so subsequent leaves keep a consistent key set.
  anDraftSaveIdentity(input, text)
  return true
}

/** Save current editor under `from`, then restore `to` after paint (roster navigate). */
export function anDraftSwitch(from: AnDraftIdentity, to: AnDraftIdentity): { saved: string } {
  const saved = anDraftSaveIdentity(from)
  const apply = () => anDraftApplyIdentity(to)
  if (typeof queueMicrotask === "function") {
    queueMicrotask(() => {
      requestAnimationFrame(() => {
        setTimeout(apply, 0)
        setTimeout(apply, 120)
        setTimeout(apply, 400)
      })
    })
  } else {
    setTimeout(apply, 0)
    setTimeout(apply, 120)
  }
  return { saved }
}

/** Test helper — clear the in-memory draft map (+ durable mirror). */
export function anDraftClearForTests() {
  drafts.clear()
  hydrated = false
  if (canUseStorage()) {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
  }
}

export function anDraftSizeForTests() {
  hydrate()
  return drafts.size
}

/** DEV/CDP probe surface — no secrets; draft text only. */
export function anDraftInstallWindowProbe(target: Record<string, unknown> = globalThis as never) {
  hydrate()
  const probe = {
    key: anDraftKey,
    keys: anDraftKeys,
    save: anDraftSaveIdentity,
    load: anDraftLoadIdentity,
    apply: anDraftApplyIdentity,
    has: anDraftHasIdentity,
    size: () => {
      hydrate()
      return drafts.size
    },
    storageKey: STORAGE_KEY,
  }
  ;(target as { __anDraft?: typeof probe }).__anDraft = probe
  return probe
}
