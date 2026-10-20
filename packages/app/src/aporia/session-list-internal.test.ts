import { test, expect } from "bun:test"
import { isInternalSession, mergeSessions } from "./session-list"

const make = (id: string, internal: boolean) =>
  ({ id, time: { created: 1, updated: 1, archived: false }, metadata: internal ? { aporia: { internal: true } } : {} }) as any

test("isInternalSession reads metadata.aporia.internal", () => {
  expect(isInternalSession({ metadata: { aporia: { internal: true } } } as any)).toBe(true)
  expect(isInternalSession({ metadata: {} } as any)).toBe(false)
  expect(isInternalSession({} as any)).toBe(false)
})

test("mergeSessions drops internal (bot/dispatch) sessions", () => {
  const ids = mergeSessions([make("a", true), make("b", false)], [], false).map((s) => s.id)
  expect(ids).toEqual(["b"])
})
