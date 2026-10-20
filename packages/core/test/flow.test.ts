import { afterAll, beforeEach, describe, expect } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { Context, Effect, Exit, Fiber, Layer, Scope } from "effect"
import { TestClock } from "effect/testing"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { AppNodeBuilder } from "../src/effect/app-node-builder"
import { Database } from "../src/database/database.js"
import { Mission } from "../src/mission.js"
import { Flow } from "../src/flow.js"
import { FlowRunnerLeaseTable } from "../src/flow/lease.sql.js"
import { testEffect } from "./lib/effect"

// Flow engine stage 1 (docs/an-rewrite/FLOW1-PLAN.md, F1-1 .. F1-7). Every HTTP call goes to a
// loopback server owned by this file, which counts what it receives: the hit counts are the proof
// that a step ran once, twice, or not at all.

// ---- a local server -------------------------------------------------------------------------

const hits: Record<string, number> = {}
const bodies: Array<{ path: string; body: string; idempotencyKey: string | null }> = []
let hang = false
let fail500 = 0
// `/slow` answers only when the test opens the gate: a call that is still in flight, not a dead one.
let slowGate: Promise<void> = Promise.resolve()
let openSlow: () => void = () => undefined
const holdSlow = () => {
  slowGate = new Promise<void>((resolve) => (openSlow = resolve))
}
const hit = (key: string) => (hits[key] = (hits[key] ?? 0) + 1)

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request) {
    const url = new URL(request.url)
    const key = `${request.method} ${url.pathname}`
    hit(key)
    bodies.push({ path: url.pathname, body: await request.text(), idempotencyKey: request.headers.get("idempotency-key") })
    // A call that never answers, so a test can cut the process off in the middle of it.
    if (hang) return new Promise<Response>(() => undefined)
    if (url.pathname === "/slow") {
      await slowGate
      return Response.json({ ok: true, method: request.method })
    }
    if (url.pathname === "/flaky" && fail500 > 0) {
      fail500--
      return new Response("busy", { status: 500 })
    }
    if (url.pathname === "/big") return new Response("x".repeat(1_200_000), { headers: { "content-type": "text/plain" } })
    if (url.pathname === "/redirect") return new Response(null, { status: 302, headers: { location: "http://example.com/" } })
    if (url.pathname === "/data")
      return Response.json({ who: url.searchParams.get("who"), count: 3, items: [{ n: 2 }, { n: 1 }, { n: 3 }] })
    return Response.json({ ok: true, method: request.method })
  },
})
const HOST = `127.0.0.1:${server.port}`
const BASE = `http://${HOST}`
afterAll(() => server.stop(true))

beforeEach(() => {
  for (const key of Object.keys(hits)) delete hits[key]
  bodies.length = 0
  hang = false
  fail500 = 0
  openSlow()
  slowGate = Promise.resolve()
  deliveries.length = 0
})

// ---- layers ---------------------------------------------------------------------------------

const deliveries: string[] = []
const recording = Layer.succeed(Mission.Coordinator.WakerService, {
  wake: (input: Mission.Coordinator.WakeInput) =>
    Effect.sync((): Mission.Coordinator.WakeResult => {
      deliveries.push(input.key)
      return "delivered"
    }),
})

const base = [
  Database.node,
  Mission.node,
  Mission.MissionEvents.node,
  Mission.Coordinator.node,
  Mission.AttentionCards.node,
  Flow.Flows.node,
] as const
const manualGroup = LayerNode.group([...base])
const runnerGroup = LayerNode.group([...base, Mission.CoordinatorTrigger.node, Flow.FlowRunner.node])

// No runner: only explicit tick/advance calls move a run, so each test controls the order exactly.
const it = testEffect(AppNodeBuilder.build(manualGroup, [Mission.Coordinator.wakerNode.replace(recording)]))

const fileNodes = (file: string) => [
  Database.node.replace(Database.configured({ path: file })),
  Mission.Coordinator.wakerNode.replace(recording),
]
const manualFile = (file: string) => AppNodeBuilder.build(manualGroup, fileNodes(file))
const runnerFile = (file: string) => AppNodeBuilder.build(runnerGroup, fileNodes(file))

const tempDb = Effect.gen(function* () {
  const directory = yield* Effect.promise(() => fs.mkdtemp(path.join(os.tmpdir(), "aporia-flow-")))
  return { directory, file: path.join(directory, "flow.db") }
})
const cleanup = (directory: string) =>
  Effect.promise(() => fs.rm(directory, { recursive: true, force: true, maxRetries: 5 }))

const spin = Effect.promise(() => new Promise((resolve) => setTimeout(resolve, 5)))

/** Real macrotasks (fetch and SQLite are async) and one test-clock second per round, until `done`. */
const settle = <E, R>(done: Effect.Effect<boolean, E, R>, seconds = 10) =>
  Effect.gen(function* () {
    for (let round = 0; round <= seconds; round++) {
      for (let i = 0; i < 40; i++) {
        if (yield* done) return true
        yield* spin
      }
      yield* TestClock.adjust("1 second")
    }
    return yield* done
  })

/** Wait in real time (no clock change) until the local server has seen `n` requests for `key`. */
const waitForHits = (key: string, n: number) =>
  Effect.gen(function* () {
    for (let i = 0; i < 400; i++) {
      if ((hits[key] ?? 0) >= n) return true
      yield* spin
    }
    return false
  })

// ---- definitions ----------------------------------------------------------------------------

/** set -> http -> if -> transform -> merge: the F1-4 flow. */
const fiveStep = (id = "five") => ({
  id,
  name: "Five steps",
  permissions: { hosts: [HOST] },
  steps: [
    { id: "start", type: "set", params: { fields: { who: "{{ input.who }}", greeting: "hi {{ input.who }}" } } },
    { id: "fetch", type: "http", params: { method: "GET", url: `${BASE}/data`, query: { who: "{{ item.who }}" } } },
    { id: "check", type: "if", params: { condition: { left: "{{ item.body.count }}", op: "gt", right: 1 } } },
    { id: "shape", type: "transform", params: { pick: ["status", "body"] } },
    { id: "join", type: "merge", params: { mode: "combine" } },
  ],
  connections: [
    { from: "start", to: "fetch" },
    { from: "fetch", to: "check" },
    { from: "check", output: "true", to: "shape" },
    { from: "shape", to: "join", input: 0 },
    { from: "start", to: "join", input: 1 },
  ],
})

const post = (id: string, options: { idempotent?: boolean; maxAttempts?: number; path?: string } = {}) => ({
  id,
  name: `Post ${id}`,
  permissions: { hosts: [HOST] },
  steps: [
    { id: "prep", type: "set", params: { fields: { n: 1 } } },
    {
      id: "send",
      type: "http",
      params: {
        method: "POST",
        url: `${BASE}${options.path ?? "/send"}`,
        body: { n: "{{ item.n }}" },
        ...(options.idempotent === undefined ? {} : { idempotent: options.idempotent }),
        ...(options.maxAttempts === undefined ? {} : { maxAttempts: options.maxAttempts }),
      },
    },
    { id: "after", type: "set", params: { fields: { done: true } } },
  ],
  connections: [
    { from: "prep", to: "send" },
    { from: "send", to: "after" },
  ],
})

const events = Effect.gen(function* () {
  return yield* (yield* Mission.MissionEvents.Service).list()
})
const runEvents = (runId: string) =>
  Effect.gen(function* () {
    return yield* (yield* Mission.MissionEvents.Service).list({ correlationID: Mission.CorrelationID.make(runId) })
  })
const startedOf = (rows: ReadonlyArray<Mission.MissionEvent>, step?: string) =>
  rows.filter((row) => row.type === "flow.step.started" && (step === undefined || row.payload.step === step))

const rid = (label: string) => `${label}-${Math.random().toString(36).slice(2, 10)}`

// ---- F1-1 definitions and versions ----------------------------------------------------------

describe("F1-1 definitions", () => {
  it.effect("an invalid definition is refused with every problem and nothing is recorded", () =>
    Effect.gen(function* () {
      const flows = yield* Flow.Flows.Service
      const error = yield* flows
        .save({
          id: "Bad Id",
          name: "",
          steps: [{ id: "x", type: "http", params: { url: "https://undeclared.example/", headers: { Authorization: "t" } } }],
          connections: [{ from: "x", to: "nope" }],
        })
        .pipe(Effect.flip)
      expect(error._tag).toBe("Flow.Invalid")
      const text = error.problems.join("\n")
      expect(text).toContain("not declared")
      expect(text).toContain("credential")
      expect(text).toContain("nope")
      expect((yield* events).filter((row) => row.type === "flow.saved")).toHaveLength(0)
    }),
  )

  it.effect("saving versions a flow; an identical save adds no version; runs keep their version", () =>
    Effect.gen(function* () {
      const flows = yield* Flow.Flows.Service
      expect(yield* flows.save(fiveStep())).toEqual({ id: "five", version: 1, created: true })
      expect(yield* flows.save(fiveStep())).toEqual({ id: "five", version: 1, created: false })
      // Key order does not make a new version: the stored form is canonical.
      const reordered = Object.fromEntries(Object.entries(fiveStep()).reverse())
      expect((yield* flows.save(reordered)).created).toBe(false)

      const v1run = yield* flows.requestRun({ flowId: "five", requestId: rid("v1"), input: { who: "ali" } })
      const changed = { ...fiveStep(), name: "Five steps, renamed" }
      expect(yield* flows.save(changed)).toEqual({ id: "five", version: 2, created: true })
      const got = yield* flows.get("five")
      expect(got.version).toBe(2)
      expect(got.definition.name).toBe("Five steps, renamed")

      yield* flows.tick
      const detail = yield* flows.run(v1run.runId)
      expect(detail.version).toBe(1)
      expect(detail.flowName).toBe("Five steps")
      expect(detail.status).toBe("completed")

      const list = yield* flows.list
      expect(list).toHaveLength(1)
      expect(list[0]!.version).toBe(2)
      expect(list[0]!.lastRun?.runId).toBe(v1run.runId)
      expect((yield* flows.get("missing").pipe(Effect.flip))._tag).toBe("Flow.NotFound")
    }),
  )
})

// ---- F1-2 / F1-3 / F1-4 a run is events; the deterministic steps; zero tokens -----------------

describe("F1-2..F1-4 runs", () => {
  it.effect("set -> http -> if -> transform -> merge runs to completion against a local server with 0 tokens", () =>
    Effect.gen(function* () {
      const flows = yield* Flow.Flows.Service
      yield* flows.save(fiveStep())
      const { runId, created } = yield* flows.requestRun({ flowId: "five", requestId: rid("f14"), input: { who: "ali" } })
      expect(created).toBe(true)
      expect(runId.startsWith("cor")).toBe(true)
      yield* flows.tick

      const detail = yield* flows.run(runId)
      expect(detail.status).toBe("completed")
      expect(detail.tokens).toBe(0)
      expect(detail.steps.map((step) => [step.id, step.status, step.attempts, step.tokens])).toEqual([
        ["start", "succeeded", 1, 0],
        ["fetch", "succeeded", 1, 0],
        ["check", "succeeded", 1, 0],
        ["shape", "succeeded", 1, 0],
        ["join", "succeeded", 1, 0],
      ])
      expect(hits["GET /data"]).toBe(1)
      // The query was templated from the set step.
      const output = JSON.parse(detail.output!)
      expect(output).toHaveLength(1)
      expect(output[0].who).toBe("ali")
      expect(output[0].greeting).toBe("hi ali")
      expect(output[0].status).toBe(200)
      expect(output[0].body.who).toBe("ali")

      // The run is nothing but flow.* events on its own correlation id.
      const rows = yield* runEvents(runId)
      expect(rows.every((row) => row.type.startsWith("flow."))).toBe(true)
      expect(rows.map((row): string => row.type)).toEqual([
        "flow.run.requested",
        ...Array.from({ length: 5 }, () => ["flow.step.started", "flow.step.succeeded"]).flat(),
        "flow.run.completed",
      ])
      expect(rows.at(-1)!.payload.tokens).toBe(0)
      for (const row of rows.filter((r) => r.type === "flow.step.succeeded")) expect(row.payload.tokens).toBe(0)
    }),
  )

  it.effect("flow events are coordinator outcomes: draining them wakes nobody and raises nothing", () =>
    Effect.gen(function* () {
      const flows = yield* Flow.Flows.Service
      const coordinator = yield* Mission.Coordinator.Service
      const cards = yield* Mission.AttentionCards.Service
      yield* flows.save(fiveStep())
      yield* flows.requestRun({ flowId: "five", requestId: rid("out"), input: { who: "x" } })
      yield* flows.tick
      const before = (yield* events).length
      yield* coordinator.drain
      const after = yield* events
      expect(after.slice(before).filter((row) => row.type.startsWith("coordination."))).toHaveLength(0)
      expect(yield* cards.list()).toHaveLength(0)
      expect(deliveries).toHaveLength(0)
      for (const type of ["flow.saved", "flow.run.requested", "flow.step.started", "flow.step.succeeded", "flow.step.failed", "flow.run.completed", "flow.run.failed"] as const)
        expect(Mission.MissionEventType.literals).toContain(type)
    }),
  )

  it.effect("the untaken side of an if is skipped, and switch routes by case", () =>
    Effect.gen(function* () {
      const flows = yield* Flow.Flows.Service
      yield* flows.save({
        id: "route",
        name: "Route",
        steps: [
          { id: "in", type: "set", params: { fields: { kind: "{{ input.kind }}" } } },
          {
            id: "pick",
            type: "switch",
            params: { cases: [{ output: "a", when: { left: "{{ item.kind }}", op: "equals", right: "a" } }] },
          },
          { id: "on-a", type: "set", params: { fields: { went: "a" } } },
          { id: "on-other", type: "set", params: { fields: { went: "other" } } },
        ],
        connections: [
          { from: "in", to: "pick" },
          { from: "pick", output: "a", to: "on-a" },
          { from: "pick", output: "default", to: "on-other" },
        ],
      })
      const a = yield* flows.requestRun({ flowId: "route", requestId: rid("ra"), input: { kind: "a" } })
      const b = yield* flows.requestRun({ flowId: "route", requestId: rid("rb"), input: { kind: "zzz" } })
      yield* flows.tick
      const da = yield* flows.run(a.runId)
      const db = yield* flows.run(b.runId)
      expect(da.status).toBe("completed")
      expect(da.steps.find((s) => s.id === "on-a")!.status).toBe("succeeded")
      expect(da.steps.find((s) => s.id === "on-other")!.status).toBe("skipped")
      expect(JSON.parse(da.output!)[0].went).toBe("a")
      expect(db.steps.find((s) => s.id === "on-a")!.status).toBe("skipped")
      expect(JSON.parse(db.output!)[0].went).toBe("other")
    }),
  )

  it.effect("a wait step sleeps on the clock and resumes when it is due", () =>
    Effect.gen(function* () {
      const flows = yield* Flow.Flows.Service
      yield* flows.save({
        id: "wait",
        name: "Wait",
        steps: [
          { id: "a", type: "set", params: { fields: { x: 1 } } },
          { id: "nap", type: "wait", params: { seconds: 30 } },
          { id: "b", type: "set", params: { fields: { y: 2 } } },
        ],
        connections: [
          { from: "a", to: "nap" },
          { from: "nap", to: "b" },
        ],
      })
      const { runId } = yield* flows.requestRun({ flowId: "wait", requestId: rid("wait") })
      yield* flows.tick
      expect((yield* flows.run(runId)).status).toBe("waiting")
      yield* TestClock.adjust("29 seconds")
      yield* flows.tick
      expect((yield* flows.run(runId)).status).toBe("waiting")
      yield* TestClock.adjust("1 second")
      yield* flows.tick
      const done = yield* flows.run(runId)
      expect(done.status).toBe("completed")
      expect(JSON.parse(done.output!)[0]).toEqual({ x: 1, y: 2 })
    }),
  )

  it.effect("a GET that answers 500 is retried after a backoff; a 4xx or a redirect is final", () =>
    Effect.gen(function* () {
      const flows = yield* Flow.Flows.Service
      const get = (id: string, p: string) => ({
        id,
        name: id,
        permissions: { hosts: [HOST] },
        steps: [{ id: "call", type: "http", params: { url: `${BASE}${p}` } }],
        connections: [],
      })
      yield* flows.save(get("flaky", "/flaky"))
      yield* flows.save(get("redir", "/redirect"))
      fail500 = 1
      const { runId } = yield* flows.requestRun({ flowId: "flaky", requestId: rid("flaky") })
      yield* flows.tick
      expect(hits["GET /flaky"]).toBe(1)
      expect((yield* flows.run(runId)).status).toBe("waiting")
      yield* TestClock.adjust("1 second")
      yield* flows.tick
      const done = yield* flows.run(runId)
      expect(done.status).toBe("completed")
      expect(done.steps[0]!.attempts).toBe(2)
      expect(hits["GET /flaky"]).toBe(2)

      const redirected = yield* flows.requestRun({ flowId: "redir", requestId: rid("redir") })
      yield* flows.tick
      const failed = yield* flows.run(redirected.runId)
      expect(failed.status).toBe("failed")
      expect(failed.error).toContain("redirects are not followed")
      expect(hits["GET /redirect"]).toBe(1)
    }),
  )

  it.effect("http: a response over 1 MB, a timeout and a refused connection each end the step as documented", () =>
    Effect.gen(function* () {
      const flows = yield* Flow.Flows.Service
      const one = (id: string, params: Record<string, unknown>, hosts = [HOST]) => ({
        id,
        name: id,
        permissions: { hosts },
        steps: [{ id: "call", type: "http", params }],
        connections: [],
      })
      // Port 9 on loopback: nothing listens there, so the connection is refused.
      const closed = "127.0.0.1:9"
      yield* flows.save(one("big", { url: `${BASE}/big` }))
      yield* flows.save(one("slow", { url: `${BASE}/slow`, timeoutSeconds: 1, maxAttempts: 1 }))
      yield* flows.save(one("refused", { url: `http://${closed}/`, maxAttempts: 2 }, [closed]))

      const big = yield* flows.requestRun({ flowId: "big", requestId: rid("big") })
      yield* flows.tick
      const bigRun = yield* flows.run(big.runId)
      expect(bigRun.status).toBe("failed")
      expect(bigRun.error).toContain("larger than")
      expect(hits["GET /big"]).toBe(1)

      hang = true
      const slow = yield* flows.requestRun({ flowId: "slow", requestId: rid("slow") })
      yield* flows.tick
      hang = false
      const slowRun = yield* flows.run(slow.runId)
      expect(slowRun.status).toBe("failed")
      expect(slowRun.error).toContain("timed out")

      const refused = yield* flows.requestRun({ flowId: "refused", requestId: rid("refused") })
      yield* flows.tick
      const first = yield* flows.run(refused.runId)
      expect(first.status).toBe("waiting")
      expect(first.steps[0]!.error).toBe("network error")
      yield* TestClock.adjust("1 second")
      yield* flows.tick
      const second = yield* flows.run(refused.runId)
      expect(second.status).toBe("failed")
      expect(second.steps[0]!.attempts).toBe(2)
    }),
    30_000,
  )

  it.effect("run-flow runs a child flow and hands its output back; nesting stops at the depth limit", () =>
    Effect.gen(function* () {
      const flows = yield* Flow.Flows.Service
      yield* flows.save({
        id: "child",
        name: "Child",
        steps: [{ id: "double", type: "set", params: { fields: { doubled: "{{ input.n }}{{ input.n }}" } } }],
        connections: [],
      })
      yield* flows.save({
        id: "parent",
        name: "Parent",
        steps: [
          { id: "a", type: "set", params: { fields: { n: "7" } } },
          { id: "call", type: "run-flow", params: { flowId: "child", input: { n: "{{ item.n }}" } } },
        ],
        connections: [{ from: "a", to: "call" }],
      })
      const { runId } = yield* flows.requestRun({ flowId: "parent", requestId: rid("parent") })
      yield* flows.tick
      const done = yield* flows.run(runId)
      expect(done.status).toBe("completed")
      expect(JSON.parse(done.output!)[0].doubled).toBe("77")
      const children = (yield* flows.runs({ flowId: "child" }))
      expect(children).toHaveLength(1)
      expect(children[0]!.trigger).toBe("subflow")

      yield* flows.save({
        id: "loop",
        name: "Loop",
        steps: [{ id: "again", type: "run-flow", params: { flowId: "loop" } }],
        connections: [],
      })
      const top = yield* flows.requestRun({ flowId: "loop", requestId: rid("loop") })
      yield* flows.tick
      const loop = yield* flows.run(top.runId)
      expect(loop.status).toBe("failed")
      const all = yield* flows.runs({ flowId: "loop" })
      expect(all).toHaveLength(Flow.Flows.MAX_DEPTH + 1)
      expect(all.every((run) => run.status === "failed")).toBe(true)
    }),
  )
})

// ---- F1-5 restart in the middle ---------------------------------------------------------------

describe("F1-5 restart", () => {
  it.effect("a run stopped after step 2 of 5 resumes on the next boot and no step is recorded twice", () =>
    Effect.gen(function* () {
      const { directory, file } = yield* tempDb
      const runId = yield* Effect.gen(function* () {
        const flows = yield* Flow.Flows.Service
        yield* flows.save(fiveStep())
        const { runId } = yield* flows.requestRun({ flowId: "five", requestId: rid("restart"), input: { who: "r" } })
        expect(yield* flows.advance(runId, 2)).toBe(2)
        const detail = yield* flows.run(runId)
        expect(detail.steps.map((s) => s.status)).toEqual(["succeeded", "succeeded", "pending", "pending", "pending"])
        expect(hits["GET /data"]).toBe(1)
        return runId
      }).pipe(Effect.provide(manualFile(file), { local: true }))

      // Second boot with the runner loop and the clock frozen: only its boot pass can finish the run.
      yield* Effect.gen(function* () {
        const flows = yield* Flow.Flows.Service
        const finished = yield* settle(Effect.map(flows.run(runId), (d) => d.status === "completed"), 0)
        expect(finished).toBe(true)
        const rows = yield* runEvents(runId)
        for (const step of ["start", "fetch", "check", "shape", "join"]) {
          expect(startedOf(rows, step)).toHaveLength(1)
          expect(rows.filter((r) => r.type === "flow.step.succeeded" && r.payload.step === step)).toHaveLength(1)
        }
        expect(rows.filter((r) => r.type === "flow.run.completed")).toHaveLength(1)
        expect(hits["GET /data"]).toBe(1)
        const status = yield* (yield* Flow.FlowRunner.Service).status
        expect(status.running).toBe(true)
        expect(status.lastError).toBeUndefined()
      }).pipe(Effect.provide(runnerFile(file), { local: true }))
      yield* cleanup(directory)
    }),
  )

  it.effect("the runner loop starts a requested run with no tick call", () =>
    Effect.gen(function* () {
      const { directory, file } = yield* tempDb
      yield* Effect.gen(function* () {
        const flows = yield* Flow.Flows.Service
        yield* flows.save(fiveStep())
        const { runId } = yield* flows.requestRun({ flowId: "five", requestId: rid("loop"), input: { who: "l" } })
        const finished = yield* settle(Effect.map(flows.run(runId), (d) => d.status === "completed"), 3)
        expect(finished).toBe(true)
      }).pipe(Effect.provide(runnerFile(file), { local: true }))
      yield* cleanup(directory)
    }),
  )
})

// ---- F1-6 replay ------------------------------------------------------------------------------

describe("F1-6 replay", () => {
  it.effect("the same request twice starts one run, and re-running the runner adds nothing", () =>
    Effect.gen(function* () {
      const flows = yield* Flow.Flows.Service
      yield* flows.save(fiveStep())
      const requestId = rid("replay")
      const first = yield* flows.requestRun({ flowId: "five", requestId, input: { who: "a" } })
      const second = yield* flows.requestRun({ flowId: "five", requestId, input: { who: "a" } })
      expect(second).toEqual({ runId: first.runId, created: false })
      yield* flows.tick
      const count = (yield* events).length
      expect(yield* flows.tick).toBe(0)
      expect(yield* flows.advance(first.runId)).toBe(0)
      expect((yield* events).length).toBe(count)
      expect(yield* flows.runs({ flowId: "five" })).toHaveLength(1)
      expect(hits["GET /data"]).toBe(1)
      // A slash request with the same id is a different trigger and so a different run.
      const slash = yield* flows.requestRun({ flowId: "five", requestId, trigger: "slash" })
      expect(slash.created).toBe(true)
      const bad = yield* flows.requestRun({ flowId: "five", requestId: "x" }).pipe(Effect.flip)
      expect(bad._tag).toBe("Flow.Invalid")
    }),
  )
})

// ---- F1-7 the crash window ----------------------------------------------------------------------

describe("F1-7 crash window", () => {
  it.effect("a pure step cut off before its result is simply run again", () =>
    Effect.gen(function* () {
      const flows = yield* Flow.Flows.Service
      const log = yield* Mission.MissionEvents.Service
      yield* flows.save(fiveStep())
      const { runId } = yield* flows.requestRun({ flowId: "five", requestId: rid("pure"), input: { who: "p" } })
      // Exactly what a crash leaves: the step's start is recorded, its result is not.
      yield* log.append({
        type: "flow.step.started",
        actor: { kind: "system", id: "flow-runner" },
        idempotencyKey: `flow:step:${runId}:start:1`,
        correlationId: Mission.CorrelationID.make(runId),
        payload: { step: "start", attempt: 1, type: "set" },
      })
      yield* flows.tick
      const detail = yield* flows.run(runId)
      expect(detail.status).toBe("completed")
      expect(detail.steps[0]!.attempts).toBe(2)
      expect(yield* (yield* Mission.AttentionCards.Service).list()).toHaveLength(0)
    }),
  )

  it.effect("an idempotent GET cut off mid-request is run again on its own", () =>
    Effect.gen(function* () {
      const flows = yield* Flow.Flows.Service
      yield* flows.save(fiveStep())
      const { runId } = yield* flows.requestRun({ flowId: "five", requestId: rid("get"), input: { who: "g" } })
      hang = true
      const fiber = yield* flows.tick.pipe(Effect.forkChild)
      expect(yield* waitForHits("GET /data", 1)).toBe(true)
      yield* Fiber.interrupt(fiber)
      hang = false
      const cut = yield* flows.run(runId)
      expect(cut.steps[1]!.status).toBe("running")
      yield* flows.tick
      const detail = yield* flows.run(runId)
      expect(detail.status).toBe("completed")
      expect(hits["GET /data"]).toBe(2)
      expect(yield* (yield* Mission.AttentionCards.Service).list()).toHaveLength(0)
    }),
  )

  const cutPost = (flowId: string) =>
    Effect.gen(function* () {
      const flows = yield* Flow.Flows.Service
      yield* flows.save(post(flowId))
      const { runId } = yield* flows.requestRun({ flowId, requestId: rid(flowId) })
      hang = true
      const fiber = yield* flows.tick.pipe(Effect.forkChild)
      expect(yield* waitForHits("POST /send", 1)).toBe(true)
      // The process "dies" with the POST in flight: the server got it, the log has no result.
      yield* Fiber.interrupt(fiber)
      hang = false
      yield* flows.tick
      const cards = yield* Mission.AttentionCards.Service
      const open = yield* cards.list()
      expect(open).toHaveLength(1)
      expect(open[0]!.title).toContain("may or may not have run")
      expect(open[0]!.correlationId as string).toBe(runId)
      // Waiting for a person: more ticks neither repeat the POST nor raise a second card.
      yield* flows.tick
      yield* flows.tick
      expect(hits["POST /send"]).toBe(1)
      expect(yield* cards.list()).toHaveLength(1)
      const detail = yield* flows.run(runId)
      expect(detail.status).toBe("needs-attention")
      expect(detail.steps[1]!.status).toBe("needs-attention")
      return { runId, card: open[0]! }
    })

  it.effect("an unsafe POST cut off mid-request raises one card; run-again repeats it exactly once", () =>
    Effect.gen(function* () {
      const flows = yield* Flow.Flows.Service
      const cards = yield* Mission.AttentionCards.Service
      const { runId, card } = yield* cutPost("post-again")
      yield* cards.resolve({ cardID: card.id, by: "ali", resolution: Flow.FlowRun.RUN_AGAIN })
      yield* flows.tick
      const detail = yield* flows.run(runId)
      expect(detail.status).toBe("completed")
      expect(detail.steps[1]!.attempts).toBe(2)
      expect(hits["POST /send"]).toBe(2)
      // An unsafe call carries no idempotency key: the far end cannot tell repeats apart.
      expect(bodies.filter((b) => b.path === "/send").every((b) => b.idempotencyKey === null)).toBe(true)
      yield* flows.tick
      expect(hits["POST /send"]).toBe(2)
    }),
  )

  it.effect("any other resolution stops the run without repeating the POST", () =>
    Effect.gen(function* () {
      const flows = yield* Flow.Flows.Service
      const cards = yield* Mission.AttentionCards.Service
      const { runId, card } = yield* cutPost("post-stop")
      yield* cards.resolve({ cardID: card.id, by: "ali", resolution: "it went through" })
      yield* flows.tick
      const detail = yield* flows.run(runId)
      expect(detail.status).toBe("failed")
      expect(detail.error).toContain("stopped by a person")
      expect(detail.steps[2]!.status).toBe("pending")
      expect(hits["POST /send"]).toBe(1)
    }),
  )

  it.effect("a POST declared idempotent sends a stable Idempotency-Key and is re-run without a card", () =>
    Effect.gen(function* () {
      const flows = yield* Flow.Flows.Service
      yield* flows.save(post("post-idem", { idempotent: true }))
      const { runId } = yield* flows.requestRun({ flowId: "post-idem", requestId: rid("idem") })
      hang = true
      const fiber = yield* flows.tick.pipe(Effect.forkChild)
      expect(yield* waitForHits("POST /send", 1)).toBe(true)
      yield* Fiber.interrupt(fiber)
      hang = false
      yield* flows.tick
      expect((yield* flows.run(runId)).status).toBe("completed")
      expect(hits["POST /send"]).toBe(2)
      const keys = bodies.filter((b) => b.path === "/send").map((b) => b.idempotencyKey)
      expect(keys[0]).toBe(`flow-${runId}-send`)
      expect(keys[1]).toBe(keys[0])
      expect(yield* (yield* Mission.AttentionCards.Service).list()).toHaveLength(0)
    }),
  )

  it.effect("an unsafe POST that answers 500 is not retried on its own", () =>
    Effect.gen(function* () {
      const flows = yield* Flow.Flows.Service
      yield* flows.save(post("post-500", { path: "/flaky" }))
      fail500 = 5
      const { runId } = yield* flows.requestRun({ flowId: "post-500", requestId: rid("p500") })
      yield* flows.tick
      yield* TestClock.adjust("1 minute")
      yield* flows.tick
      const detail = yield* flows.run(runId)
      expect(detail.status).toBe("failed")
      expect(hits["POST /flaky"]).toBe(1)
    }),
  )
})

// ---- verifier findings H1 / M3: one runner per database, and no lock held across I/O ------------

/** One HTTP step against `/slow`, which answers only when the test opens the gate. */
const slowFlow = (id: string, method: "GET" | "POST") => ({
  id,
  name: `Slow ${id}`,
  permissions: { hosts: [HOST] },
  steps: [{ id: "call", type: "http", params: { method, url: `${BASE}/slow`, timeoutSeconds: 60 } }],
  connections: [],
})

/**
 * Build a whole service graph in its own scope and its own memo map, the way a second process opens the
 * same database: its own SQLite connection, its own Flows service and its own runner id.
 */
const boot = (layer: ReturnType<typeof manualFile>) =>
  Effect.gen(function* () {
    const scope = yield* Scope.make()
    const context = yield* Layer.buildWithMemoMap(layer, yield* Layer.makeMemoMap, scope)
    return {
      flows: Context.get(context, Flow.Flows.Service),
      cards: Context.get(context, Mission.AttentionCards.Service),
      log: Context.get(context, Mission.MissionEvents.Service),
      close: Scope.close(scope, Exit.void),
    }
  })

const startedRow = (runId: string, step: string, type: string, owner: string, boot: string) => ({
  type: "flow.step.started" as const,
  actor: { kind: "system" as const, id: "flow-runner" },
  idempotencyKey: `flow:step:${runId}:${step}:1`,
  correlationId: Mission.CorrelationID.make(runId),
  payload: { step, attempt: 1, type, owner, boot },
})

const setLease = (owner: string, boot: string, expiresAt: number) =>
  Effect.gen(function* () {
    const { db } = yield* Database.Service
    yield* db
      .insert(FlowRunnerLeaseTable)
      .values({ id: "runner", owner, boot, expires_at: expiresAt, time_updated: Date.now() })
      .onConflictDoUpdate({ target: FlowRunnerLeaseTable.id, set: { owner, boot, expires_at: expiresAt } })
      .run()
      .pipe(Effect.orDie)
  })

describe("H1 one runner per database", () => {
  const twoServices = (method: "GET" | "POST") =>
    Effect.gen(function* () {
      const { directory, file } = yield* tempDb
      const a = yield* boot(manualFile(file))
      const b = yield* boot(manualFile(file))
      expect(b.flows).not.toBe(a.flows)
      const flowId = `two-${method.toLowerCase()}`
      const key = `${method} /slow`
      yield* a.flows.save(slowFlow(flowId, method))
      const { runId } = yield* a.flows.requestRun({ flowId, requestId: rid(flowId) })
      holdSlow()
      const fiber = yield* a.flows.tick.pipe(Effect.forkChild)
      expect(yield* waitForHits(key, 1)).toBe(true)
      // While A's call is in flight, B ticks and advances over and over (the verifier's repro).
      // (Each call writes the lease row to a file database, so 30 rounds is what fits the test time.)
      for (let i = 0; i < 30; i++) {
        expect(yield* b.flows.tick).toBe(0)
        expect(yield* b.flows.advance(runId)).toBe(0)
        if (i % 10 === 0) yield* spin
      }
      expect(hits[key]).toBe(1)
      expect(yield* b.cards.list()).toHaveLength(0)
      expect((yield* b.flows.run(runId)).steps[0]!.status).toBe("running")
      const started = (yield* b.log.list({ correlationID: Mission.CorrelationID.make(runId) })).filter(
        (row) => row.type === "flow.step.started",
      )
      expect(started).toHaveLength(1)
      expect(typeof started[0]!.payload.owner).toBe("string")
      expect(typeof started[0]!.payload.boot).toBe("string")
      openSlow()
      yield* Fiber.join(fiber)
      expect((yield* b.flows.run(runId)).status).toBe("completed")
      expect(hits[key]).toBe(1)
      expect(yield* b.cards.list()).toHaveLength(0)
      // A clean stop hands the lease over: B runs the next request at once, and only once.
      yield* a.close
      const next = yield* b.flows.requestRun({ flowId, requestId: rid(`${flowId}-b`) })
      yield* b.flows.tick
      expect((yield* b.flows.run(next.runId)).status).toBe("completed")
      expect(hits[key]).toBe(2)
      yield* b.close
      yield* cleanup(directory)
    })

  it.effect("two services on one file database: a slow GET in flight is called once, with no card", () =>
    twoServices("GET"),
  )
  it.effect("two services on one file database: a slow POST in flight is called once, with no card", () =>
    twoServices("POST"),
  )

  const twoRunnerLoops = (method: "GET" | "POST") =>
    Effect.gen(function* () {
      const { directory, file } = yield* tempDb
      const a = yield* boot(runnerFile(file))
      const b = yield* boot(runnerFile(file))
      expect(b.flows).not.toBe(a.flows)
      const flowId = `loops-${method.toLowerCase()}`
      const key = `${method} /slow`
      holdSlow()
      yield* b.flows.save(slowFlow(flowId, method))
      const { runId } = yield* b.flows.requestRun({ flowId, requestId: rid(flowId) })
      expect(yield* settle(Effect.sync(() => (hits[key] ?? 0) >= 1), 5)).toBe(true)
      // Both loops keep polling every second for 15 seconds while the call is in flight.
      for (let round = 0; round < 15; round++) {
        yield* TestClock.adjust("1 second")
        for (let i = 0; i < 4; i++) yield* spin
      }
      expect(hits[key]).toBe(1)
      expect(yield* a.cards.list()).toHaveLength(0)
      openSlow()
      expect(yield* settle(Effect.map(a.flows.run(runId), (d) => d.status === "completed"), 5)).toBe(true)
      expect(hits[key]).toBe(1)
      expect(yield* a.cards.list()).toHaveLength(0)
      yield* a.close
      yield* b.close
      yield* cleanup(directory)
    })

  it.effect("two runner loops on one file database: a slow GET is called once, with no card", () => twoRunnerLoops("GET"))
  it.effect("two runner loops on one file database: a slow POST is called once, with no card", () => twoRunnerLoops("POST"))

  it.effect("a step whose owner no longer holds the lease was cut off: a GET runs again, a POST raises one card", () =>
    Effect.gen(function* () {
      const flows = yield* Flow.Flows.Service
      const log = yield* Mission.MissionEvents.Service
      const cards = yield* Mission.AttentionCards.Service
      yield* flows.save(slowFlow("gone-get", "GET"))
      yield* flows.save(slowFlow("gone-post", "POST"))
      const get = yield* flows.requestRun({ flowId: "gone-get", requestId: rid("gone-get") })
      const post = yield* flows.requestRun({ flowId: "gone-post", requestId: rid("gone-post") })
      // A runner in a process that has since died held the lease and started both steps.
      yield* setLease("dead-runner", "dead-boot", Date.now() - 1)
      yield* log.append(startedRow(get.runId, "call", "http", "dead-runner", "dead-boot"))
      yield* log.append(startedRow(post.runId, "call", "http", "dead-runner", "dead-boot"))
      yield* flows.tick
      const got = yield* flows.run(get.runId)
      expect(got.status).toBe("completed")
      expect(got.steps[0]!.attempts).toBe(2)
      expect(hits["GET /slow"]).toBe(1)
      const posted = yield* flows.run(post.runId)
      expect(posted.status).toBe("needs-attention")
      expect(hits["POST /slow"]).toBeUndefined()
      const open = yield* cards.list()
      expect(open).toHaveLength(1)
      expect(open[0]!.title).toContain("may or may not have run")
      expect(open[0]!.correlationId as string).toBe(post.runId)
    }),
  )

  it.effect("a step whose owner still holds the lease is left alone; once the lease runs out it is a crash", () =>
    Effect.gen(function* () {
      const flows = yield* Flow.Flows.Service
      const log = yield* Mission.MissionEvents.Service
      const cards = yield* Mission.AttentionCards.Service
      yield* flows.save(slowFlow("held-post", "POST"))
      const { runId } = yield* flows.requestRun({ flowId: "held-post", requestId: rid("held-post") })
      yield* setLease("other-runner", "other-boot", Date.now() + 60_000)
      yield* log.append(startedRow(runId, "call", "http", "other-runner", "other-boot"))
      for (let i = 0; i < 20; i++) {
        expect(yield* flows.tick).toBe(0)
        expect(yield* flows.advance(runId)).toBe(0)
      }
      expect(hits["POST /slow"]).toBeUndefined()
      expect(yield* cards.list()).toHaveLength(0)
      expect((yield* flows.run(runId)).steps[0]!.status).toBe("running")
      // The other runner dies without handing the lease over; it runs out.
      yield* setLease("other-runner", "other-boot", Date.now() - 1)
      yield* flows.tick
      expect(yield* cards.list()).toHaveLength(1)
      expect((yield* flows.run(runId)).status).toBe("needs-attention")
      expect(hits["POST /slow"]).toBeUndefined()
    }),
  )
})

describe("M3 no lock across I/O", () => {
  it.effect("a slow step (60 s timeout, still in flight) in one run does not hold up another run", () =>
    Effect.gen(function* () {
      const flows = yield* Flow.Flows.Service
      yield* flows.save(slowFlow("slow-a", "GET"))
      yield* flows.save(fiveStep())
      holdSlow()
      const a = yield* flows.requestRun({ flowId: "slow-a", requestId: rid("slow-a") })
      const fiber = yield* flows.tick.pipe(Effect.forkChild)
      expect(yield* waitForHits("GET /slow", 1)).toBe(true)
      const b = yield* flows.requestRun({ flowId: "five", requestId: rid("five-b"), input: { who: "b" } })
      // Neither a tick nor a direct advance of B waits for A's call.
      expect(yield* flows.tick).toBeGreaterThan(0)
      expect((yield* flows.run(b.runId)).status).toBe("completed")
      expect((yield* flows.run(a.runId)).steps[0]!.status).toBe("running")
      const c = yield* flows.requestRun({ flowId: "five", requestId: rid("five-c"), input: { who: "c" } })
      expect(yield* flows.advance(c.runId)).toBeGreaterThan(0)
      expect((yield* flows.run(c.runId)).status).toBe("completed")
      expect(hits["GET /slow"]).toBe(1)
      openSlow()
      yield* Fiber.join(fiber)
      expect((yield* flows.run(a.runId)).status).toBe("completed")
      expect(hits["GET /slow"]).toBe(1)
    }),
  )

  it.effect("the runner loop keeps polling while a slow step is in flight", () =>
    Effect.gen(function* () {
      const { directory, file } = yield* tempDb
      yield* Effect.gen(function* () {
        const flows = yield* Flow.Flows.Service
        yield* flows.save(slowFlow("slow-loop", "GET"))
        yield* flows.save(fiveStep())
        holdSlow()
        const a = yield* flows.requestRun({ flowId: "slow-loop", requestId: rid("slow-loop") })
        expect(yield* settle(Effect.sync(() => (hits["GET /slow"] ?? 0) >= 1), 3)).toBe(true)
        const b = yield* flows.requestRun({ flowId: "five", requestId: rid("loop-b"), input: { who: "b" } })
        expect(yield* settle(Effect.map(flows.run(b.runId), (d) => d.status === "completed"), 3)).toBe(true)
        expect((yield* flows.run(a.runId)).steps[0]!.status).toBe("running")
        openSlow()
        expect(yield* settle(Effect.map(flows.run(a.runId), (d) => d.status === "completed"), 3)).toBe(true)
        expect(hits["GET /slow"]).toBe(1)
      }).pipe(Effect.provide(runnerFile(file), { local: true }))
      yield* cleanup(directory)
    }),
  )
})

// ---- verifier findings M1 / M2 / LOW: refused at save and again at run ----------------------------

describe("M1/M2 routing headers and userinfo", () => {
  const httpFlow = (id: string, params: Record<string, unknown>) => ({
    id,
    name: `Http ${id}`,
    permissions: { hosts: [HOST] },
    steps: [{ id: "call", type: "http", params: { method: "POST", url: `${BASE}/send`, ...params } }],
    connections: [],
  })
  const refusedAtRun: Array<[string, Record<string, unknown>, string]> = [
    ["run-host", { headers: { Host: "internal.example" } }, "header Host decides where"],
    ["run-xfh", { headers: { "X-Forwarded-Host": "internal.example" } }, "header X-Forwarded-Host decides where"],
    ["run-te", { headers: { "Transfer-Encoding": "chunked" } }, "header Transfer-Encoding decides where"],
    ["run-override", { headers: { "X-HTTP-Method-Override": "DELETE" } }, "header X-HTTP-Method-Override decides"],
    ["run-userinfo", { url: `http://user:pw@${HOST}/send` }, "may not carry a user name or password"],
  ]

  it.effect("save refuses Host, hop-by-hop, Proxy-*, X-Forwarded-*, method overrides and userinfo", () =>
    Effect.gen(function* () {
      const flows = yield* Flow.Flows.Service
      const headers = {
        Host: "a",
        Connection: "close",
        "Transfer-Encoding": "chunked",
        "Content-Length": "1",
        "Proxy-Connection": "x",
        "X-Forwarded-For": "1.2.3.4",
        "X-HTTP-Method-Override": "DELETE",
        "X-Ok": "fine",
      }
      const error = yield* flows.save(httpFlow("bad-headers", { headers })).pipe(Effect.flip)
      expect(error._tag).toBe("Flow.Invalid")
      const problems = (error as unknown as { problems: string[] }).problems
      for (const name of Object.keys(headers).filter((name) => name !== "X-Ok"))
        expect(problems.some((p) => p.includes(`header ${name} `))).toBe(true)
      expect(problems.some((p) => p.includes("X-Ok"))).toBe(false)
      for (const url of [`http://user:pw@${HOST}/send`, `http://user@${HOST}/send`, `http://user:pw@${HOST}/x/{{ item.n }}`]) {
        const bad = yield* flows.save(httpFlow("bad-userinfo", { url })).pipe(Effect.flip)
        expect((bad as unknown as { problems: string[] }).problems.join(" ")).toContain("may not carry a user name or password")
      }
      expect(yield* events).toHaveLength(0)
    }),
  )

  it.effect("a definition that slipped past save (an older version) is refused again at run, with no request sent", () =>
    Effect.gen(function* () {
      const flows = yield* Flow.Flows.Service
      const log = yield* Mission.MissionEvents.Service
      for (const [id, params, message] of refusedAtRun) {
        const def = httpFlow(id, params)
        yield* log.append({
          type: "flow.saved",
          actor: { kind: "user", id: "older-version" },
          idempotencyKey: `flow:saved:${id}:1`,
          correlationId: Mission.CorrelationID.make(`cor_flow_${id}`),
          payload: { flowId: id, version: 1, definition: def, hash: JSON.stringify(def) },
        })
        const { runId } = yield* flows.requestRun({ flowId: id, requestId: rid(id) })
        yield* flows.tick
        const detail = yield* flows.run(runId)
        expect(detail.status).toBe("failed")
        expect(detail.steps[0]!.error).toContain(message)
      }
      expect(hits["POST /send"]).toBeUndefined()
    }),
  )

  it.effect("a set step writing __proto__ is refused at save and fails at run without touching the prototype", () =>
    Effect.gen(function* () {
      const flows = yield* Flow.Flows.Service
      const log = yield* Mission.MissionEvents.Service
      const def = JSON.parse(
        `{"id":"proto","name":"Proto","steps":[{"id":"s","type":"set","params":{"fields":{"__proto__":{"polluted":true}}}}],"connections":[]}`,
      )
      const error = yield* flows.save(def).pipe(Effect.flip)
      expect((error as unknown as { problems: string[] }).problems.join(" ")).toContain('may not write the field "__proto__"')
      yield* log.append({
        type: "flow.saved",
        actor: { kind: "user", id: "older-version" },
        idempotencyKey: "flow:saved:proto:1",
        correlationId: Mission.CorrelationID.make("cor_flow_proto"),
        payload: { flowId: "proto", version: 1, definition: def, hash: JSON.stringify(def) },
      })
      const { runId } = yield* flows.requestRun({ flowId: "proto", requestId: rid("proto") })
      yield* flows.tick
      const detail = yield* flows.run(runId)
      expect(detail.status).toBe("failed")
      expect(detail.steps[0]!.error).toContain("__proto__")
      expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    }),
  )
})