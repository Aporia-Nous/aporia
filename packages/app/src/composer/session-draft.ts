/**
 * AP-STAGE4-B1: keep composer drafts keyed by session across teammate/mission switches.
 *
 * ComposerPersistenceProvider + tabs.memory already own per-session Prompt stores.
 * CDP insertText / fast roster clicks can leave text only in the contenteditable DOM
 * before the Solid onInput path writes the store — flush DOM → store before leave.
 */

export const COMPOSER_EDITOR_SELECTOR = '[data-component="composer-editor"]' as const

export const OWNED_COMPOSER_EDITOR_SELECTOR =
  `[data-an-owned="composer"] ${COMPOSER_EDITOR_SELECTOR}` as const

/** Resolve the AN-owned composer editor, falling back to the session composer editor. */
export function findComposerEditor(root: ParentNode = document): HTMLElement | undefined {
  const owned = root.querySelector(OWNED_COMPOSER_EDITOR_SELECTOR)
  if (owned instanceof HTMLElement) return owned
  const any = root.querySelector(COMPOSER_EDITOR_SELECTOR)
  return any instanceof HTMLElement ? any : undefined
}

/** Plain text currently shown in the composer editor (ZWSP stripped). */
export function readComposerEditorText(editor: HTMLElement | null | undefined): string {
  if (!editor) return ""
  return (editor.textContent ?? "").replace(/\u200B/g, "")
}

/**
 * Force the live editor DOM into the bound Solid onInput / draft store.
 * Safe no-op when no editor is mounted.
 * @returns whether an editor was found and an input event was dispatched
 */
export function flushComposerEditorDom(root: ParentNode = document): boolean {
  const editor = findComposerEditor(root)
  if (!editor) return false
  // contenteditable sync path is onInput — programmatic CDP insertText may skip it.
  editor.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true, inputType: "insertText" }))
  return true
}
