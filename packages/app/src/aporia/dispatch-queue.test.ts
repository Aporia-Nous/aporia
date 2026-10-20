import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { createDispatchScheduler } from "./dispatch-queue"

type M = { id: string; to?: string; room?: string; priority?: boolean }

/** target key mirroring the dispatcher's per-bot / per-room identity. */
const target = (m: M) => (m.room ? `room:${m.room}` : `bot:${m.to}`)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Acceptance #1: a message for an unrelated bot starts its turn while a slow room
// round is still mid-flight — the room no longer blocks it.
describe("dispatch-queue independence", () => {
  test("an unrelated bot is delivered while a room round is in flight", async () => {
    const started: string[] = []
    let releaseRoom!: () => void
    const roomGate = new Promise<void>((r) => (releaseRoom = r))

    const scheduler = createDispatchScheduler<M, null>({
      load: async () => ({ messages: [{ id: "room1", room: "r1" }, { id: "botD", to: "D" }], context: null }),
      target,
      deliver: async (m) => {
        started.push(m.id)
        if (m.room) await roomGate
      },
    })

    await scheduler.tick()

    // Both targets were launched while the room is still holding it open: bot D did not wait.
    expect(started).toContain("room1")
    expect(started).toContain("botD")
    expect(scheduler.isLocked("room:r1")).toBe(true)

    releaseRoom()
    await scheduler.idle()

    expect(scheduler.inFlight()).toEqual([])
    expect(started).toEqual(["room1", "botD"])
  })

  test("a slow bot does not block a different bot", async () => {
    let releaseSlow!: () => void
    const slowGate = new Promise<void>((r) => (releaseSlow = r))
    const started: string[] = []

    const scheduler = createDispatchScheduler<M, null>({
      load: async () => ({ messages: [{ id: "a1", to: "A" }, { id: "b1", to: "B" }], context: null }),
      target,
      deliver: async (m) => {
        started.push(m.id)
        if (m.id === "a1") await slowGate
      },
    })

    await scheduler.tick()
    expect(started).toEqual(["a1", "b1"])

    releaseSlow()
    await scheduler.idle()
  })
})

// Acceptance #2: the same target is never delivered twice concurrently.
describe("per-target lock", () => {
  test("two messages for the same bot run one after another (never overlapping)", async () => {
    let active = 0
    let max = 0
    const scheduler = createDispatchScheduler<M, null>({
      load: async () => ({ messages: [{ id: "m1", to: "B" }, { id: "m2", to: "B" }], context: null }),
      target,
      deliver: async () => {
        active++
        max = Math.max(max, active)
        await sleep(5)
        active--
      },
    })

    await scheduler.tick()
    await scheduler.idle()

    expect(max).toBe(1)
  })

  test("a second message for an in-flight target queues behind it, not alongside", async () => {
    const calls: string[] = []
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))

    // The inbox is persistent: a delivered message is acked out of it, an undelivered one stays.
    let pending: M[] = [{ id: "m1", to: "B" }]
    const scheduler = createDispatchScheduler<M, null>({
      load: async () => ({ messages: [...pending], context: null }),
      target,
      deliver: async (m) => {
        pending = pending.filter((x) => x.id !== m.id)
        calls.push(m.id)
        if (m.id === "m1") await gate
      },
    })

    await scheduler.tick()
    expect(calls).toEqual(["m1"])
    expect(scheduler.isLocked("bot:B")).toBe(true)

    // m2 arrives while B is still mid-turn.
    pending.push({ id: "m2", to: "B" })

    // A fresh tick must NOT start m2 alongside m1; it stays queued.
    await scheduler.tick()
    expect(calls).toEqual(["m1"])
    expect(pending.map((m) => m.id)).toEqual(["m2"])

    release()
    await scheduler.idle()
    expect(scheduler.isLocked("bot:B")).toBe(false)

    // Once the lock is released, the queued message is picked up.
    await scheduler.tick()
    expect(calls).toEqual(["m1", "m2"])
  })
})

// Acceptance #3: priority ordering and error handling preserved.
describe("delivery semantics", () => {
  test("priority messages are delivered before non-priority within a target", async () => {
    const order: string[] = []
    const scheduler = createDispatchScheduler<M, null>({
      load: async () => ({
        messages: [
          { id: "low", to: "B", priority: false },
          { id: "high", to: "B", priority: true },
        ],
        context: null,
      }),
      target,
      priority: (m) => m.priority,
      deliver: async (m) => order.push(m.id),
    })

    await scheduler.tick()
    await scheduler.idle()

    expect(order).toEqual(["high", "low"])
  })

  test("a failed delivery is reported and the lock is released so the target recovers", async () => {
    const errors: string[] = []
    const delivered: string[] = []
    const scheduler = createDispatchScheduler<M, null>({
      load: async () => ({ messages: [{ id: "bad", to: "B" }, { id: "good", to: "B" }], context: null }),
      target,
      deliver: async (m) => {
        if (m.id === "bad") throw new Error("boom")
        delivered.push(m.id)
      },
      onError: (m) => {
        errors.push(m.id)
      },
    })

    await scheduler.tick()
    await scheduler.idle()

    expect(errors).toEqual(["bad"])
    expect(delivered).toEqual(["good"])
    expect(scheduler.inFlight()).toEqual([])
  })

  test("re-entrant ticks during load never schedule a target twice", async () => {
    let active = 0
    let max = 0
    let loads = 0
    const scheduler = createDispatchScheduler<M, null>({
      load: async () => {
        loads++
        await sleep(5)
        return { messages: [{ id: "m1", to: "B" }], context: null }
      },
      target,
      deliver: async () => {
        active++
        max = Math.max(max, active)
        await sleep(10)
        active--
      },
    })

    await Promise.all([scheduler.tick(), scheduler.tick(), scheduler.tick()])
    await scheduler.idle()

    // Only the first tick's load produced a delivery; the others were skipped by the ticking guard.
    expect(loads).toBe(1)
    expect(max).toBe(1)
  })

  test("an empty inbox schedules nothing", async () => {
    let called = false
    const scheduler = createDispatchScheduler<M, null>({
      load: async () => ({ messages: [], context: null }),
      target,
      deliver: async () => {
        called = true
      },
    })
    await scheduler.tick()
    await scheduler.idle()
    expect(called).toBe(false)
    expect(scheduler.inFlight()).toEqual([])
  })
})

// Guard: the dispatcher must no longer serialize on a module-global `running` flag.
describe("dispatcher wiring", () => {
  const source = readFileSync(new URL("./dispatch.tsx", import.meta.url), "utf8")

  test("uses the per-target scheduler instead of a global running flag", () => {
    expect(source).toContain("createDispatchScheduler")
    expect(source).not.toMatch(/let running\s*=\s*false/)
  })
})
