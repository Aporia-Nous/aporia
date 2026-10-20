import { describe, expect, test, beforeEach } from "bun:test"
import {
  anScrollApplyIdentity,
  anScrollClearForTests,
  anScrollLoadIdentity,
  anScrollSaveIdentity,
  anScrollSizeForTests,
} from "./session-scroll-store"

describe("AP-STAGE4-MISSION-RESTART AnShell scroll store", () => {
  beforeEach(() => {
    anScrollClearForTests()
    document.body.innerHTML = ""
  })

  test("save/load round-trip is per-identity (Mission A→B→A)", () => {
    anScrollSaveIdentity({ sessionID: "ses_a", agent: "aporia-grok", slug: "grok" }, 420)
    anScrollSaveIdentity({ sessionID: "ses_b", agent: "aporia-dev", slug: "aporetic-dev" }, 12)
    expect(anScrollLoadIdentity({ agent: "aporia-grok" })).toBe(420)
    expect(anScrollLoadIdentity({ slug: "aporetic-dev" })).toBe(12)
    expect(anScrollSizeForTests()).toBe(6)
  })

  test("durable localStorage mirrors identity scroll tops", () => {
    anScrollSaveIdentity({ agent: "aporia-grok", slug: "grok" }, 88)
    const raw = localStorage.getItem("an.shell.scroll.v1")
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw!) as Record<string, number>
    expect(parsed["agent:aporia-grok"]).toBe(88)
    expect(parsed["slug:grok"]).toBe(88)
  })

  test("save(0) does not clobber an existing mid-scroll", () => {
    anScrollSaveIdentity({ slug: "grok" }, 480)
    expect(anScrollSaveIdentity({ slug: "grok" }, 0)).toBe(480)
    expect(anScrollLoadIdentity({ slug: "grok" })).toBe(480)
  })

  test("apply restores scrollTop on conversation scroller", () => {
    document.body.innerHTML = `<div data-component="an-conversation"></div>`
    const el = document.querySelector('[data-component="an-conversation"]') as HTMLElement
    anScrollSaveIdentity({ slug: "grok" }, 120)
    expect(anScrollApplyIdentity(el, { slug: "grok" })).toBe(true)
    expect(el.scrollTop).toBe(120)
  })
})
