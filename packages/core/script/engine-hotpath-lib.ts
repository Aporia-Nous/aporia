/**
 * AP-ENGINE-E26 — engine hot-path wall-clock measurements (not test-suite speed).
 * Used by benchmark-engine-hotpath.ts and engine-hotpath-bench.test.ts.
 */
import { ToolDefinition } from "@opencode/ai"
import { Agent } from "@opencode/core/agent"
import { Database } from "@opencode/core/database/database"
import { AppNodeBuilder } from "@opencode/core/effect/app-node-builder"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { Bus } from "@opencode/core/bus"
import { Event } from "@opencode/schema/event"
import { InstructionDiscovery } from "@opencode/core/instruction-discovery"
import { Instructions } from "@opencode/core/instructions/index"
import { InstructionBuiltIns } from "@opencode/core/instructions/builtins"
import { Location } from "@opencode/core/location"
import { McpInstructions } from "@opencode/core/mcp/instructions"
import { McpTool } from "@opencode/core/tool/mcp"
import { Project } from "@opencode/core/project"
import { ReferenceInstructions } from "@opencode/core/reference/instructions"
import { AbsolutePath } from "@opencode/core/schema"
import { SessionCompaction } from "@opencode/core/session/compaction"
import { SessionContext } from "@opencode/core/session/context"
import { SessionProjector } from "@opencode/core/session/projector"
import { SessionRunnerModel } from "@opencode/core/session/runner/model"
import { SessionSchema } from "@opencode/core/session/schema"
import { SessionTable } from "@opencode/core/session/sql"
import { SessionStore } from "@opencode/core/session/store"
import { SessionMessage } from "@opencode/core/session/message"
import { SkillInstructions } from "@opencode/core/skill/instructions"
import { PluginHooks } from "@opencode/core/plugin/hooks"
import { PluginSupervisor } from "@opencode/core/plugin/supervisor"
import { Tool } from "@opencode/core/tool"
import { LanguageModel } from "@opencode/ai"
import { OpenAIChat } from "@opencode/ai/protocols"
import { DateTime, Effect, Fiber, Layer, Schema, Stream } from "effect"
import fs from "node:fs"
import path from "node:path"

export type HotpathOptions = {
  readonly steps: number
  readonly selectsPerStep: number
  readonly dueIters: number
  readonly publishes: number
  readonly sseEvents: number
  readonly evidencePath?: string
}

export type HotpathMetrics = {
  readonly finding: "E26"
  readonly steps: number
  readonly selectsPerStep: number
  readonly select: {
    readonly samples: number
    readonly snapshotCalls: number
    readonly hits: number
    readonly misses: number
    readonly p50Ms: number
    readonly p95Ms: number
    readonly maxMs: number
  }
  readonly due: {
    readonly iters: number
    readonly messageCount: number
    readonly cheapP50Ms: number
    readonly cheapP95Ms: number
    readonly preciseP50Ms: number
    readonly preciseP95Ms: number
    readonly lastCheapTokens: number
    readonly lastPreciseTokens: number
  }
  readonly publish: {
    readonly samples: number
    readonly p50Ms: number
    readonly p95Ms: number
    readonly maxMs: number
  }
  readonly sse?: {
    readonly events: number
    readonly subscribers: number
    readonly offers: number
    readonly encodeMicros: number
    readonly offerP50Ms: number
    readonly offerP95Ms: number
    readonly overflowDrops: number
  }
  readonly measuredAt: string
}

export function percentile(sorted: readonly number[], p: number) {
  if (sorted.length === 0) return 0
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[idx]!
}

export function round3(n: number) {
  return Number(n.toFixed(3))
}

const defaultEvidence =
  "C:\\Users\\Dilla\\OneDrive\\Documents\\ChatGPT\\Aporia Nous\\business-control\\evidence\\2026-10-19-ap-engine-e26-metrics.json"

export function writeEvidence(metrics: HotpathMetrics, evidencePath = defaultEvidence) {
  try {
    fs.mkdirSync(path.dirname(evidencePath), { recursive: true })
    fs.writeFileSync(evidencePath, `${JSON.stringify(metrics, null, 2)}\n`)
    return evidencePath
  } catch (err) {
    console.warn("E26 metrics write failed", err)
    return undefined
  }
}

const SyncMessage = Bus.durable({
  type: "test.e26.sync",
  durable: {
    version: 1,
    aggregate: "id",
  },
  schema: {
    id: Schema.String,
    text: Schema.String,
  },
})

export function runEngineHotpath(options: HotpathOptions): Effect.Effect<HotpathMetrics> {
  const sessionID = SessionSchema.ID.make("ses_e26_hotpath")
  let snapshotCalls = 0

  const model = LanguageModel.make({ id: "e26-model", provider: "test", route: OpenAIChat.route })
  const models = Layer.mock(SessionRunnerModel.Service)({
    resolve: () =>
      Effect.succeed(
        SessionRunnerModel.resolved(model, {
          capabilities: { tools: true, input: ["text"], output: ["text"] },
          cost: [],
          limit: { context: 200_000, output: 32_000 },
        }),
      ),
  })
  const builtins = Layer.mock(InstructionBuiltIns.Service, {
    load: () => Effect.succeed(Instructions.empty),
  })
  const discovery = Layer.mock(InstructionDiscovery.Service, {
    project: true,
    global: true,
    load: () => Effect.succeed(Instructions.empty),
  })
  const skills = Layer.mock(SkillInstructions.Service, { load: () => Effect.succeed(Instructions.empty) })
  const references = Layer.mock(ReferenceInstructions.Service, { load: () => Effect.succeed(Instructions.empty) })
  const mcp = Layer.mock(McpInstructions.Service, { load: () => Effect.succeed(Instructions.empty) })
  const mcpTools = Layer.mock(McpTool.Service, { flush: Effect.void })
  const tools = Layer.mock(Tool.Service, {
    snapshot: () =>
      Effect.sync(() => {
        snapshotCalls++
        return {
          definitions: [
            ToolDefinition.make({ name: "lookup", description: "Lookup", inputSchema: { type: "object" } }),
          ],
          definitionTokens: 4,
          execute: () => Effect.die(new Error("unused")),
        }
      }),
    revision: () => 0,
    transform: () => Effect.die(new Error("unused")),
    reload: () => Effect.void,
    list: () => Effect.succeed([]),
  })

  const layer = AppNodeBuilder.build(
    LayerNode.group([
      Database.node,
      Bus.node,
      Project.node,
      SessionProjector.node,
      SessionStore.node,
      Agent.node,
      InstructionBuiltIns.node,
      SessionContext.node,
      PluginHooks.node,
    ]),
    [
      Bus.node.replace(Bus.configured({ persist: true })),
      SessionRunnerModel.node.replace(models),
      InstructionBuiltIns.node.replace(builtins),
      InstructionDiscovery.node.replace(discovery),
      SkillInstructions.node.replace(skills),
      ReferenceInstructions.node.replace(references),
      McpInstructions.node.replace(mcp),
      McpTool.node.replace(mcpTools),
      PluginSupervisor.node.replace(Layer.empty),
      Tool.node.replace(tools),
      Location.node.replace(Location.boundNode({ directory: AbsolutePath.make("/project") })),
    ],
  )

  return Effect.gen(function* () {
    const { db } = yield* Database.Service
    const agents = yield* Agent.Service
    const projects = yield* Project.Service
    const context = yield* SessionContext.Service
    const bus = yield* Bus.Service

    yield* agents.transform((editor) =>
      editor.update(Agent.ID.make("build"), (agent) => {
        agent.mode = "primary"
      }),
    )
    yield* db
      .insert(SessionTable)
      .values({
        id: sessionID,
        project_id: (yield* projects.resolve(AbsolutePath.make("/project"))).id,
        slug: "e26-hotpath",
        directory: "/project",
        title: "E26 hotpath",
        version: "test",
        agent: Agent.ID.make("build"),
      })
      .run()
      .pipe(Effect.orDie)

    // --- select (drain-scoped) ---
    const selectLatencies: number[] = []
    snapshotCalls = 0
    let selectHits = 0
    let selectMisses = 0
    for (let step = 0; step < options.steps; step++) {
      yield* context.beginDrain
      for (let i = 0; i < options.selectsPerStep; i++) {
        const t0 = performance.now()
        yield* context.select(sessionID)
        selectLatencies.push(performance.now() - t0)
      }
      const stepStats = context.selectionCacheStats()
      selectHits += stepStats.hits
      selectMisses += stepStats.misses
      yield* context.endDrain
    }
    const selectSnapshotCalls = snapshotCalls
    const selectSorted = [...selectLatencies].sort((a, b) => a - b)

    // --- due / estimate (synthetic Loaded; no history/instruction assembly) ---
    const selection = yield* context.select(sessionID)
    const resolvedModel = yield* context.resolveModel(selection.session)
    const messages: SessionMessage.Info[] = []
    for (let i = 0; i < 24; i++) {
      messages.push(
        SessionMessage.User.make({
          id: SessionMessage.ID.make(`msg_e26_u_${String(i).padStart(4, "0")}`),
          type: "user",
          text: `user turn ${i} ` + "x".repeat(120),
          time: { created: DateTime.makeUnsafe(i) },
        }),
      )
      messages.push(
        Schema.decodeUnknownSync(SessionMessage.Assistant)({
          id: SessionMessage.ID.make(`msg_e26_a_${String(i).padStart(4, "0")}`),
          type: "assistant",
          agent: Agent.defaultID,
          model: { id: "e26-model", providerID: "test" },
          content: [{ type: "text", text: `assistant turn ${i} ` + "y".repeat(80) }],
          tokens: {
            input: 800 + i * 40,
            output: 120,
            reasoning: 0,
            cache: { read: 0, write: 0 },
          },
          time: { created: i, completed: i },
        }),
      )
    }
    const dueContext: SessionContext.Loaded = {
      session: selection.session,
      agent: selection.agent,
      model: resolvedModel,
      initial: "E26 synthetic instructions",
      messages,
      tools: {
        definitions: [
          ToolDefinition.make({ name: "lookup", description: "Lookup", inputSchema: { type: "object" } }),
        ],
        definitionTokens: 4,
        execute: () => Effect.die(new Error("unused")),
      },
    }
    const cheapSamples: number[] = []
    const preciseSamples: number[] = []
    let lastCheap = 0
    let lastPrecise = 0
    for (let i = 0; i < options.dueIters; i++) {
      const c0 = performance.now()
      lastCheap = SessionCompaction.estimateContextCheap(dueContext)
      cheapSamples.push(performance.now() - c0)
      const p0 = performance.now()
      lastPrecise = SessionCompaction.estimateContext(dueContext)
      preciseSamples.push(performance.now() - p0)
    }
    const cheapSorted = [...cheapSamples].sort((a, b) => a - b)
    const preciseSorted = [...preciseSamples].sort((a, b) => a - b)

    // --- durable publish ---
    const publishLatencies: number[] = []
    const aggregateID = Event.ID.create()
    for (let i = 0; i < options.publishes; i++) {
      const t0 = performance.now()
      yield* bus.publish(SyncMessage, { id: aggregateID, text: `e26-${i}` })
      publishLatencies.push(performance.now() - t0)
    }
    const publishSorted = [...publishLatencies].sort((a, b) => a - b)

    // --- optional SSE (EventFeed) via relative import; skip if unavailable ---
    let sse: HotpathMetrics["sse"]
    if (options.sseEvents > 0) {
      try {
        const { EventFeed } = yield* Effect.promise(() => import("../../server/src/event-feed.ts"))
        let subscriber: Bus.Subscriber | undefined
        const source = {
          observe: (next: Bus.Subscriber) =>
            Effect.sync(() => {
              subscriber = next
              return Effect.sync(() => {
                if (subscriber === next) subscriber = undefined
              })
            }),
          publish: (event: Event.Payload) => Effect.suspend(() => (subscriber ? subscriber(event) : Effect.void)),
        }
        const feed = yield* EventFeed.make(source.observe, {
          encode: (event: { type: string }) => event.type,
        })
        const left = yield* feed.subscribe()
        const right = yield* feed.subscribe()
        const leftFiber = yield* left.pipe(Stream.take(options.sseEvents), Stream.runDrain, Effect.forkScoped)
        const rightFiber = yield* right.pipe(Stream.take(options.sseEvents), Stream.runDrain, Effect.forkScoped)
        const offerLatencies: number[] = []
        for (let i = 0; i < options.sseEvents; i++) {
          const payload = {
            id: Event.ID.create(),
            created: Date.now(),
            type: Agent.Event.Updated.type,
            data: {},
          }
          const t0 = performance.now()
          yield* source.publish(payload)
          offerLatencies.push(performance.now() - t0)
        }
        yield* Fiber.join(leftFiber)
        yield* Fiber.join(rightFiber)
        const feedMetrics = yield* feed.metrics
        const offerSorted = [...offerLatencies].sort((a, b) => a - b)
        sse = {
          events: options.sseEvents,
          subscribers: 2,
          offers: feedMetrics.offers,
          encodeMicros: round3(feedMetrics.encodeMicros),
          offerP50Ms: round3(percentile(offerSorted, 50)),
          offerP95Ms: round3(percentile(offerSorted, 95)),
          overflowDrops: feedMetrics.overflowDrops,
        }
      } catch (err) {
        console.warn("E26 SSE measure skipped", err instanceof Error ? err.message : err)
      }
    }

    const metrics: HotpathMetrics = {
      finding: "E26",
      steps: options.steps,
      selectsPerStep: options.selectsPerStep,
      select: {
        samples: selectLatencies.length,
        snapshotCalls: selectSnapshotCalls,
        hits: selectHits,
        misses: selectMisses,
        p50Ms: round3(percentile(selectSorted, 50)),
        p95Ms: round3(percentile(selectSorted, 95)),
        maxMs: round3(selectSorted[selectSorted.length - 1] ?? 0),
      },
      due: {
        iters: options.dueIters,
        messageCount: messages.length,
        cheapP50Ms: round3(percentile(cheapSorted, 50)),
        cheapP95Ms: round3(percentile(cheapSorted, 95)),
        preciseP50Ms: round3(percentile(preciseSorted, 50)),
        preciseP95Ms: round3(percentile(preciseSorted, 95)),
        lastCheapTokens: lastCheap,
        lastPreciseTokens: lastPrecise,
      },
      publish: {
        samples: publishLatencies.length,
        p50Ms: round3(percentile(publishSorted, 50)),
        p95Ms: round3(percentile(publishSorted, 95)),
        maxMs: round3(publishSorted[publishSorted.length - 1] ?? 0),
      },
      ...(sse ? { sse } : {}),
      measuredAt: new Date().toISOString(),
    }

    if (options.evidencePath !== "") {
      writeEvidence(metrics, options.evidencePath ?? defaultEvidence)
    }

    return metrics
  }).pipe(Effect.scoped, Effect.provide(Layer.fresh(layer)))
}
