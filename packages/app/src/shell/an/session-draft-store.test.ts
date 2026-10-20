import { describe, expect, test, beforeEach } from "bun:test"
import {
  anDraftApplyIdentity,
  anDraftClearForTests,
  anDraftHasIdentity,
  anDraftKey,
  anDraftKeys,
  anDraftLoadIdentity,
  anDraftSaveIdentity,
  anDraftSizeForTests,
  anDraftSwitch,
} from "./session-draft-store"

describe("AP-STAGE4-B1 AnShell session draft store", () => {
  beforeEach(() => {
    anDraftClearForTests()
    document.body.innerHTML = ""
  })

  test("keys alias agent + slug + session (agent primary)", () => {
    expect(anDraftKeys({ sessionID: "ses_a", agent: "aporia-grok", slug: "grok" })).toEqual([
      "agent:aporia-grok",
      "slug:grok",
      "ses:ses_a",
    ])
    expect(anDraftKey({ agent: "aporia-grok", slug: "grok" })).toBe("agent:aporia-grok")
    expect(anDraftKey({})).toBe("workspace")
  })

  test("save/load round-trip is per-identity (Mission A→B→A)", () => {
    anDraftSaveIdentity({ sessionID: "ses_a", agent: "aporia-grok", slug: "grok" }, "draft-A")
    anDraftSaveIdentity({ sessionID: "ses_b", agent: "aporia-dev", slug: "aporetic-dev" }, "draft-B")
    // Leave used session id; return uses only agent — still resolves.
    expect(anDraftLoadIdentity({ agent: "aporia-grok" })).toBe("draft-A")
    expect(anDraftLoadIdentity({ slug: "aporetic-dev" })).toBe("draft-B")
    expect(anDraftSizeForTests()).toBe(6)
  })

  test("apply restores text into owned composer editor", () => {
    document.body.innerHTML = `
      <div data-an-owned="composer">
        <div data-component="composer-editor" contenteditable="true">stale</div>
      </div>
    `
    anDraftSaveIdentity({ agent: "aporia-grok", slug: "grok" }, "restored-A")
    expect(anDraftApplyIdentity({ slug: "grok" })).toBe(true)
    const el = document.querySelector('[data-component="composer-editor"]')
    expect(el?.textContent).toBe("restored-A")
  })

  test("switch saves from-identity and keeps to-identity available", () => {
    document.body.innerHTML = `
      <div data-an-owned="composer">
        <div data-component="composer-editor" contenteditable="true">leaving-A</div>
      </div>
    `
    anDraftSaveIdentity({ agent: "aporia-dev", slug: "aporetic-dev" }, "keep-B")
    const result = anDraftSwitch(
      { agent: "aporia-grok", slug: "grok" },
      { agent: "aporia-dev", slug: "aporetic-dev" },
    )
    expect(result.saved).toBe("leaving-A")
    expect(anDraftHasIdentity({ slug: "grok" })).toBe(true)
    expect(anDraftLoadIdentity({ agent: "aporia-grok" })).toBe("leaving-A")
    expect(anDraftLoadIdentity({ agent: "aporia-dev" })).toBe("keep-B")
  })

  test("MISSION-RESTART durable localStorage mirrors identity drafts", () => {
    anDraftSaveIdentity({ agent: "aporia-grok", slug: "grok" }, "survive-reload")
    const raw = localStorage.getItem("an.shell.drafts.v1")
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw!) as Record<string, string>
    expect(parsed["agent:aporia-grok"]).toBe("survive-reload")
    expect(parsed["slug:grok"]).toBe("survive-reload")
  })
})
