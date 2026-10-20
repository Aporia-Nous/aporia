/**
 * AP-STAGE4-B1 — AnShell per-session/teammate composer draft map.
 *
 * ComposerPersistenceProvider keys drafts by route session id, but roster switches can
 * change the selected teammate without a durable URL/session remount order that flushes
 * TipTap/contenteditable → store. This Map is the Stage-4 owned survival layer:
 * save on leave, restore on enter.
 *
 * Keys are aliased across session id + agent + roster slug so home (`/`) and session
 * routes resolve the same teammate draft.
 */
import {
  findComposerEditor,
  flushComposerEditorDom,
  readComposerEditorText,
} from "@/composer/session-draft"

const drafts = new Map<string, string>()

export type AnDraftIdentity = { sessionID?: string; agent?: string; slug?: string }

export function anDraftKeys(input: AnDraftIdentity): string[] {
  const keys: string[] = []
  if (input.sessionID) keys.push(`ses:${input.sessionID}`)
  if (input.agent) keys.push(`agent:${input.agent}`)
  if (input.slug) keys.push(`slug:${input.slug}`)
  if (keys.length === 0) keys.push("workspace")
  return keys
}

/** Primary key for diagnostics — agent preferred (stable across home/session). */
export function anDraftKey(input: AnDraftIdentity): string {
  return anDraftKeys(input)[0] ?? "workspace"
}

export function anDraftSave(key: string, text?: string): string {
  const value = text ?? readComposerEditorText(findComposerEditor())
  drafts.set(key, value)
  flushComposerEditorDom()
  return value
}

/** Save under all identity aliases so leave/enter can use session or agent keys. */
export function anDraftSaveIdentity(input: AnDraftIdentity, text?: string): string {
  const value = text ?? readComposerEditorText(findComposerEditor())
  for (const key of anDraftKeys(input)) drafts.set(key, value)
  flushComposerEditorDom()
  return value
}

export function anDraftLoad(key: string): string | undefined {
  return drafts.get(key)
}

export function anDraftLoadIdentity(input: AnDraftIdentity): string | undefined {
  for (const key of anDraftKeys(input)) {
    if (drafts.has(key)) return drafts.get(key)
  }
  return undefined
}

export function anDraftHas(key: string): boolean {
  return drafts.has(key)
}

export function anDraftHasIdentity(input: AnDraftIdentity): boolean {
  return anDraftKeys(input).some((key) => drafts.has(key))
}

/** Write a stored draft into the live editor and notify the Solid onInput path. */
export function anDraftApply(key: string): boolean {
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

/** Test helper — clear the in-memory draft map. */
export function anDraftClearForTests() {
  drafts.clear()
}

export function anDraftSizeForTests() {
  return drafts.size
}
