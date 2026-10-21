/**
 * AP-CE-02 — Wire FlowIntentGate into composer→FlowRunner route (skip SessionRunner when gated).
 * Proves modelTokensSum=0 on mechanical paths; sessionPrompt never called when gated.
 * Does not start FLOW-GENIUS-01 / Stage 6. Browser named steps = residual (board title).
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
  mechanicalStartFromDecision,
  routeComposerAdmission,
} from "../src/flow/intent-gate.js"
import { testEffect } from "./lib/effect"

const EVIDENCE =
  "C:\\Users\\Dilla\\OneDrive\\Documents\\ChatGPT\\Aporia Nous\\business-control\\evidence\\2026-10-20-ap-ce-02-metrics.json"

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

const rid = (label: string) => `${label}-${Math.random().toString(36).slice(2, 10)}`

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

describe("AP-CE-02 routeComposerAdmission (composer wire)", () => {
  test("gated slash skips sessionPrompt; modelTokens 0", async () => {
    let sessionCalls = 0
    const routed = await routeComposerAdmission({
      text: '/greet {"who":"ali"}',
      registered: ["greet", "fetch-shape"],
      sessionPrompt: async () => {
        sessionCalls += 1
        return { kind: "session" as const }
      },
      startFlow: async (start) => {
        expect(start.expectedModelTokens).toBe(0)
        expect(start.flowId).toBe("greet")
        expect(start.trigger).toBe("slash")
        return { kind: "flow" as const, flowId: start.flowId }
      },
    })
    expect(routed.path).toBe("mechanical")
    if (routed.path === "mechanical") {
      expect(routed.modelTokens).toBe(0)
      expect(routed.result).toEqual({ kind: "flow", flowId: "greet" })
    }
    expect(sessionCalls).toBe(0)
  })

  test("chat and unregistered slash stay on sessionPrompt", async () => {
    let sessionCalls = 0
    let flowCalls = 0
    for (const text of ["refactor auth", "/nope x", "   "]) {
      const routed = await routeComposerAdmission({
        text,
        registered: ["greet"],
        sessionPrompt: async () => {
          sessionCalls += 1
          return { ok: true }
        },
        startFlow: async () => {
          flowCalls += 1
          return { ok: false }
        },
      })
      expect(routed.path).toBe("session")
    }
    expect(sessionCalls).toBe(3)
    expect(flowCalls).toBe(0)
  })

  test("attachments force session even for registered slash", async () => {
    let sessionCalls = 0
    const routed = await routeComposerAdmission({
      text: "/greet",
      registered: ["greet"],
      hasAttachments: true,
      sessionPrompt: async () => {
        sessionCalls += 1
        return { session: true }
      },
      startFlow: async () => ({ flow: true }),
    })
    expect(routed.path).toBe("session")
    expect(sessionCalls).toBe(1)
  })

  test("classifyFlowTrigger + mechanicalStartFromDecision for manual/subflow", () => {
    const manual = classifyFlowTrigger("fetch-shape", "manual", { n: 1 }, ["fetch-shape"])
    expect(isZeroTokenPath(manual)).toBe(true)
    expect(mechanicalStartFromDecision(manual)).toMatchObject({
      flowId: "fetch-shape",
      trigger: "manual",
      expectedModelTokens: 0,
    })
    expect(mechanicalStartFromDecision(classifyComposerText("hi", ["greet"]))).toBeUndefined()
  })
})

describe("AP-CE-02 gated FlowRunner fixtures (modelTokensSum=0)", () => {
  it.effect("composer-routed slash + manual triggers complete with 0 tokens; write metrics", () =>
    Effect.gen(function* () {
      const flows = yield* Flow.Flows.Service
      yield* flows.save(fetchShape)
      yield* flows.save(greetPure)
      const registered = ["greet", "fetch-shape"]
      const fixtures: Array<{
        id: string
        path: "mechanical"
        status: string
        tokens: number
        stepTokens: number[]
        sessionPromptCalls: number
      }> = []

      // Composer wire: classify → requestRun (SessionRunner mock never called).
      let sessionPromptCalls = 0
      const slashText = '/greet {"who":"ali"}'
      const decision = classifyComposerText(slashText, registered)
      expect(decision.kind).toBe("mechanical")
      const start = mechanicalStartFromDecision(decision)
      expect(start).toBeDefined()
      if (!start) return

      const routed = yield* Effect.promise(() =>
        routeComposerAdmission({
          text: slashText,
          registered,
          sessionPrompt: async () => {
            sessionPromptCalls += 1
            return { leaked: true }
          },
          startFlow: async (s) =>
            Effect.runPromise(
              flows.requestRun({
                flowId: s.flowId,
                requestId: rid("ce02-slash"),
                input: s.input as import("../src/flow/expr.js").Item,
                trigger: s.trigger === "slash" ? "slash" : "manual",
              }),
            ),
        }),
      )
      expect(routed.path).toBe("mechanical")
      expect(sessionPromptCalls).toBe(0)
      if (routed.path !== "mechanical") return

      yield* flows.tick
      const slashDetail = yield* flows.run(routed.result.runId)
      expect(slashDetail.status).toBe("completed")
      expect(slashDetail.tokens).toBe(0)
      fixtures.push({
        id: "greet-composer-wire",
        path: "mechanical",
        status: slashDetail.status,
        tokens: slashDetail.tokens,
        stepTokens: slashDetail.steps.map((s) => s.tokens),
        sessionPromptCalls,
      })

      // Manual trigger via classifyFlowTrigger (Contraptions Run button / flow.start).
      const gate = classifyFlowTrigger("fetch-shape", "manual", { who: "ali" }, registered)
      expect(isZeroTokenPath(gate)).toBe(true)
      const { runId } = yield* flows.requestRun({
        flowId: "fetch-shape",
        requestId: rid("ce02-manual"),
        input: { who: "ali" },
        trigger: "manual",
      })
      yield* flows.tick
      const detail = yield* flows.run(runId)
      expect(detail.status).toBe("completed")
      expect(detail.tokens).toBe(0)
      fixtures.push({
        id: "fetch-shape-manual-wire",
        path: "mechanical",
        status: detail.status,
        tokens: detail.tokens,
        stepTokens: detail.steps.map((s) => s.tokens),
        sessionPromptCalls: 0,
      })

      expect(hits["GET /data"]).toBe(1)

      const metrics = {
        finding: "AP-CE-02",
        measuredAt: new Date().toISOString(),
        scope: "composer/SessionRunner wire via routeComposerAdmission + classifyFlowTrigger; gated paths skip model",
        fixtures,
        totals: {
          fixtureCount: fixtures.length,
          allCompleted: fixtures.every((f) => f.status === "completed"),
          allZeroTokens: fixtures.every((f) => f.tokens === 0 && f.stepTokens.every((t) => t === 0)),
          modelTokensSum: fixtures.reduce((n, f) => n + f.tokens, 0),
          sessionPromptCallsOnGated: fixtures.reduce((n, f) => n + f.sessionPromptCalls, 0),
        },
        residuals: [
          "Browser named Contraption/tool steps (board title) not shipped — residual",
          "FLOW-GENIUS-01 Ali confirm OPEN; Stage 6 not started",
          "Server session.prompt HTTP schema unchanged (EnginePort + FlowCommands divert client-side)",
        ],
        notClaimed: [
          "INDEPENDENT PASS product live",
          "Stage 6",
          "FLOW-GENIUS-01 confirm",
          "browser step types in FlowDefinition",
          "merge",
          "push",
          "install",
        ],
      }

      expect(metrics.totals.allCompleted).toBe(true)
      expect(metrics.totals.allZeroTokens).toBe(true)
      expect(metrics.totals.modelTokensSum).toBe(0)
      expect(metrics.totals.sessionPromptCallsOnGated).toBe(0)

      fs.mkdirSync(path.dirname(EVIDENCE), { recursive: true })
      fs.writeFileSync(EVIDENCE, `${JSON.stringify(metrics, null, 2)}\n`)
      console.log("CE02_METRICS", JSON.stringify(metrics.totals))
    }),
  )
})
