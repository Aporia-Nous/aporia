import { test, expect } from "bun:test"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createContextStore } from "./aporia-context"
import { planImport, handleImport } from "./aporia-context-import"

test("turns each message into a sourced entry tagged by topic", () => {
  const s = createContextStore(mkdtempSync(join(tmpdir(), "ctx-")))
  const { planned } = planImport(
    [{ id: "ses_1", title: "Billing help", messages: [{ id: "msg_1", role: "user", text: "invoice please" }] }],
    s,
  )
  expect(planned).toHaveLength(1)
  expect(planned[0].source).toEqual({
    kind: "session",
    ref: "ses_1:msg_1",
    sessionID: "ses_1",
    messageID: "msg_1",
  })
  expect(planned[0].topic).toBe("Billing help")
})

test("skips messages with no text and counts them", () => {
  const s = createContextStore(mkdtempSync(join(tmpdir(), "ctx-")))
  const { planned, skipped } = planImport(
    [{ id: "ses_1", title: "T", messages: [{ id: "m", role: "user", text: "   " }] }],
    s,
  )
  expect(planned).toHaveLength(0)
  expect(skipped).toBe(1)
})

test("re-importing the same sessions plans nothing new", () => {
  const s = createContextStore(mkdtempSync(join(tmpdir(), "ctx-")))
  const sess = [{ id: "ses_1", title: "T", messages: [{ id: "m1", role: "user" as const, text: "hi" }] }]
  const first = planImport(sess, s)
  first.planned.forEach((e) => s.add(e))
  expect(planImport(sess, s).planned).toHaveLength(0)
})

test("a session with no messages does not crash", () => {
  const s = createContextStore(mkdtempSync(join(tmpdir(), "ctx-")))
  expect(planImport([{ id: "ses_1", title: "T", messages: [] }], s).planned).toHaveLength(0)
})

test("handleImport writes the planned entries and reports added/skipped", () => {
  const s = createContextStore(mkdtempSync(join(tmpdir(), "ctx-")))
  const r = handleImport(s, [
    { id: "ses_1", title: "T", messages: [{ id: "m1", role: "user", text: "hi" }, { id: "m2", role: "user", text: "  " }] },
  ])
  expect(r.added).toBe(1)
  expect(r.skipped).toBe(1)
  expect(s.all()).toHaveLength(1)
})

test("handleImport a second time adds nothing", () => {
  const s = createContextStore(mkdtempSync(join(tmpdir(), "ctx-")))
  const sess = [{ id: "ses_1", title: "T", messages: [{ id: "m1", role: "user" as const, text: "hi" }] }]
  handleImport(s, sess)
  expect(handleImport(s, sess).added).toBe(0)
})

