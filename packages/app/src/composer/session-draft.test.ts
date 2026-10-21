import { describe, expect, test } from "bun:test"
import {
  COMPOSER_EDITOR_SELECTOR,
  OWNED_COMPOSER_EDITOR_SELECTOR,
  findComposerEditor,
  flushComposerEditorDom,
  readComposerEditorText,
} from "./session-draft"

describe("AP-STAGE4-B1 session draft flush", () => {
  test("selectors target owned composer editor", () => {
    expect(OWNED_COMPOSER_EDITOR_SELECTOR).toContain('data-an-owned="composer"')
    expect(OWNED_COMPOSER_EDITOR_SELECTOR).toContain(COMPOSER_EDITOR_SELECTOR)
  })

  test("findComposerEditor prefers AN-owned dock", () => {
    const root = document.createElement("div")
    root.innerHTML = `
      <div data-component="composer-editor">fallback</div>
      <div data-an-owned="composer">
        <div data-component="composer-editor">owned-draft</div>
      </div>
    `
    const editor = findComposerEditor(root)
    expect(editor?.textContent?.trim()).toBe("owned-draft")
  })

  test("readComposerEditorText strips ZWSP", () => {
    const el = document.createElement("div")
    el.textContent = "hello\u200Bworld"
    expect(readComposerEditorText(el)).toBe("helloworld")
  })

  test("flushComposerEditorDom dispatches input so store can capture DOM draft", () => {
    const root = document.createElement("div")
    root.innerHTML = `<div data-an-owned="composer"><div data-component="composer-editor" contenteditable="true">AP-STAGE4-B1 marker</div></div>`
    let sawInput = false
    root.querySelector(COMPOSER_EDITOR_SELECTOR)?.addEventListener("input", () => {
      sawInput = true
    })
    expect(flushComposerEditorDom(root)).toBe(true)
    expect(sawInput).toBe(true)
    expect(readComposerEditorText(findComposerEditor(root))).toContain("AP-STAGE4-B1")
  })

  test("flushComposerEditorDom is false when editor missing", () => {
    expect(flushComposerEditorDom(document.createElement("div"))).toBe(false)
  })
})
