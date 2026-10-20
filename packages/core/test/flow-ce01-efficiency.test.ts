/**
 * AP-CE-01 — Contraptions efficiency: intent gate + measured 0-token mechanical fixtures.
 * Plan/fixtures slice — does not wire the gate into SessionRunner / composer (FLOW-GENIUS-03 later).
 */
import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import fs from "node:fs"
import path from "node:path"
import { Effect, Layer } from "effect"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { AppNodeBuilder } from "../src/effect/app-node-builder"
import { Database } from "../src/database/database.js"
import { Mission } from "../src/mission.js"
import { Flow } from "../src/flow.js"
import {
  classifyComposerText,
  classifyFlowTrigger,
  isZeroTokenPath,
  parseSlashInput,
} from "../src/flow/intent-gate.js"
import { testEffect } from "./lib/effect"

const EVIDENCE =
  "C:\\Users\\Dilla\\OneDrive\\Documents\\ChatGPT\\Aporia Nous\\business-control\\evidence\\2026-10-20-ap-ce-01-metrics.json"

// ---- intent gate (pure) ---------------------------------------------------------------------

describe("AP-CE-01 intent gate", () => {
  const registered = ["five", "greet", "fetch-shape"]

  test("registered slash → mechanical, expectedModelTokens 0", () => {
    const d = classifyComposerText('/five {"who":"ali"}', registered)
    expect(d).toEqual({
      kind: "mechanical",
      flowId: "five",
      trigger: "slash",
      input: { who: "ali" },
      expectedModelTokens: 0,
    })
    expect(isZeroTokenPath(d)).toBe(true)
  })

  test("registered slash with free text → { text }", () => {
    expect(classifyComposerText("/greet hello there", registered)).toMatchObject({
      kind: "mechanical",
      flowId: "greet",
      input: { text: "hello there" },
      expectedModelTokens: 0,
    })
  })

  test("unregistered slash stays session (no invented flow)", () => {
    expect(classifyComposerText("/nope x", registered)).toEqual({
      kind: "session",
      reason: "unregistered-slash",
    })
    expect(isZeroTokenPath(classifyComposerText("/nope x", registered))).toBe(false)
  })

  test("plain chat and empty → session", () => {
    expect(classifyComposerText("refactor the auth module", registered)).toEqual({
      kind: "session",
      reason: "chat",
    })
    expect(classifyComposerText("   ", registered)).toEqual({ kind: "session", reason: "empty" })
  })

  test("manual / subflow triggers on registered ids are mechanical", () => {
    expect(classifyFlowTrigger("fetch-shape", "manual", { n: 1 }, registered)).toEqual({
      kind: "mechanical",
      flowId: "fetch-shape",
      trigger: "manual",
      input: { n: 1 },
      expectedModelTokens: 0,
    })
    expect(classifyFlowTrigger("five", "subflow", undefined, registered).kind).toBe("mechanical")
  })

  test("parseSlashInput matches Contraptions slash contract", () => {
    expect(parseSlashInput(undefined)).toEqual({})
    expect(parseSlashInput('{"who":"ali"}')).toEqual({ who: "ali" })
    expect(parseSlashInput("hello")).toEqual({ text: "hello" })
    expect(parseSlashInput("[1,2]")).toEqual({ text: "[1,2]" })
  })
})

// ---- measured 0-token fixtures (FlowRunner, local HTTP) -------------------------------------

const hits: Record<string, number> = {}
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request) {
    const url = new URL(request.url)
    const key = `${request.method} ${url.pathname}`
    hits[key] = (hits[key] ?? 0) + 1
    if (url.pathname === "/data")
      return Response.json({ who: url.searchParams.get("who"), count: 3, items: [{ n: 2 }, { n: 1 }] })
    return Response.json({ ok: true })
  },
})
const HOST = `127.0.0.1:${server.port}`
const BASE = `http://${HOST}`
afterAll(() => server.stop(true))
beforeEach(() => {
  for (const key of Object.keys(hits)) delete hits[key]
})

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
const it = testEffect(AppNodeBuilder.build(manualGroup, [Mission.Coordinator.wakerNode.replace(recording)]))

type FixtureResult = {
  readonly id: string
  readonly status: string
  readonly tokens: number
  readonly stepTokens: ReadonlyArray<number>
  readonly gate: "mechanical"
}

const rid = (label: string) => `${label}-${Math.random().toString(36).slice(2, 10)}`

/** Common automation: set → http → if → transform (mechanical, 0 tokens). */
const fetchShape = {
  id: "fetch-shape",
  name: "Fetch and shape",
  permissions: { hosts: [HOST] },
  steps: [
    { id: "start", type: "set", params: { fields: { who: "{{ input.who }}" } } },
    { id: "fetch", type: "http", params: { method: "GET", url: `${BASE}/data`, query: { who: "{{ item.who }}" } } },
    { id: "check", type: "if", params: { condition: { left: "{{ item.body.count }}", op: "gt", right: 0 } } },
    { id: "shape", type: "transform", params: { pick: ["status", "body"] } },
  ],
  connections: [
    { from: "start", to: "fetch" },
    { from: "fetch", to: "check" },
    { from: "check", output: "true", to: "shape" },
  ],
}

/** Pure-only automation: set → if → transform → merge (no HTTP). */
const greetPure = {
  id: "greet",
  name: "Greet pure",
  steps: [
    { id: "start", type: "set", params: { fields: { who: "{{ input.who }}", n: 2 } } },
    { id: "gate", type: "if", params: { condition: { left: "{{ item.n }}", op: "gt", right: 0 } } },
    { id: "shape", type: "transform", params: { pick: ["who"] } },
    { id: "join", type: "merge", params: {} },
  ],
  connections: [
    { from: "start", to: "gate" },
    { from: "gate", output: "true", to: "shape" },
    { from: "shape", to: "join", input: 0 },
    { from: "start", to: "join", input: 1 },
  ],
}

describe("AP-CE-01 0-token mechanical fixtures", () => {
  it.effect("fetch-shape and greet complete with run+step tokens 0; write metrics", () =>
    Effect.gen(function* () {
      const flows = yield* Flow.Flows.Service
      const fixtures: FixtureResult[] = []

      for (const def of [fetchShape, greetPure]) {
        yield* flows.save(def)
        const gate = classifyFlowTrigger(def.id, "manual", { who: "ali" }, [def.id])
        expect(gate.kind).toBe("mechanical")
        expect(isZeroTokenPath(gate)).toBe(true)

        const { runId } = yield* flows.requestRun({
          flowId: def.id,
          requestId: rid(def.id),
          input: { who: "ali" },
          trigger: "manual",
        })
        yield* flows.tick
        const detail = yield* flows.run(runId)
        expect(detail.status).toBe("completed")
        expect(detail.tokens).toBe(0)
        for (const step of detail.steps) expect(step.tokens).toBe(0)

        fixtures.push({
          id: def.id,
          status: detail.status,
          tokens: detail.tokens,
          stepTokens: detail.steps.map((s) => s.tokens),
          gate: "mechanical",
        })
      }

      expect(hits["GET /data"]).toBe(1)

      // Slash path: registered /greet routes mechanical and still 0 tokens when run.
      const slash = classifyComposerText('/greet {"who":"ali"}', ["greet", "fetch-shape"])
      expect(slash.kind).toBe("mechanical")
      if (slash.kind === "mechanical") {
        const { runId } = yield* flows.requestRun({
          flowId: slash.flowId,
          requestId: rid("slash"),
          input: slash.input,
          trigger: "slash",
        })
        yield* flows.tick
        const detail = yield* flows.run(runId)
        expect(detail.status).toBe("completed")
        expect(detail.tokens).toBe(0)
        fixtures.push({
          id: "greet-slash",
          status: detail.status,
          tokens: detail.tokens,
          stepTokens: detail.steps.map((s) => s.tokens),
          gate: "mechanical",
        })
      }

      const metrics = {
        finding: "AP-CE-01",
        measuredAt: new Date().toISOString(),
        scope: "intent-gate + F1 mechanical 0-token fixtures",
        fixtures,
        totals: {
          fixtureCount: fixtures.length,
          allCompleted: fixtures.every((f) => f.status === "completed"),
          allZeroTokens: fixtures.every((f) => f.tokens === 0 && f.stepTokens.every((t) => t === 0)),
          modelTokensSum: fixtures.reduce((n, f) => n + f.tokens, 0),
        },
        residuals: [
          "Intent gate not wired into composer/SessionRunner (FLOW-GENIUS-03 / later)",
          "FLOW-GENIUS-01 Ali confirm still OPEN — Stage 6 lean pack not started",
          "AP-CE-02 browser named steps not started",
        ],
        notClaimed: ["INDEPENDENT PASS product", "Stage 6", "composer wire", "merge", "push", "install"],
      }

      expect(metrics.totals.allCompleted).toBe(true)
      expect(metrics.totals.allZeroTokens).toBe(true)
      expect(metrics.totals.modelTokensSum).toBe(0)

      fs.mkdirSync(path.dirname(EVIDENCE), { recursive: true })
      fs.writeFileSync(EVIDENCE, `${JSON.stringify(metrics, null, 2)}\n`)
      console.log("CE01_METRICS", JSON.stringify(metrics.totals))
    }),
  )
})
