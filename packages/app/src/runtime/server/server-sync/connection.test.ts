import { expect, test } from "bun:test"
import {
  createCoalescedRunner,
  reconnectBootstrapDebounceMs,
  reconnectOrder,
  reconnectSyncDirectories,
} from "./connection"

test("held directories refresh before the rest, otherwise keeping their order", () => {
  const held = new Set(["/b", "/d"])
  expect(reconnectOrder(["/a", "/b", "/c", "/d"], (directory) => held.has(directory))).toEqual(["/b", "/d", "/a", "/c"])
  expect(reconnectOrder(["/a", "/c"], (directory) => held.has(directory))).toEqual(["/a", "/c"])
})

test("E21/PORT-03 reconnect sync queues only held directories", () => {
  const held = new Set(["/b", "/d"])
  const heldOf = (directory: string) => held.has(directory)
  expect(reconnectSyncDirectories(["/a", "/b", "/c", "/d"], heldOf, { reconnect: false })).toEqual([
    "/b",
    "/d",
    "/a",
    "/c",
  ])
  expect(reconnectSyncDirectories(["/a", "/b", "/c", "/d"], heldOf, { reconnect: true })).toEqual(["/b", "/d"])
  expect(reconnectSyncDirectories(["/a", "/c"], heldOf, { reconnect: true })).toEqual([])
})

test("E21 coalesced runner collapses bursts within debounce window", async () => {
  expect(reconnectBootstrapDebounceMs).toBe(300)
  const calls: number[] = []
  const runner = createCoalescedRunner(40, () => calls.push(Date.now()))
  runner.schedule()
  runner.schedule()
  runner.schedule()
  await new Promise((resolve) => setTimeout(resolve, 80))
  expect(calls).toHaveLength(1)
  runner.cancel()
})
