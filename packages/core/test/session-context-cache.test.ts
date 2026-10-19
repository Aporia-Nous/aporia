import { expect } from "bun:test"
import { ToolDefinition } from "@opencode/ai"
import { Agent } from "@opencode/core/agent"
import { Database } from "@opencode/core/database/database"
import { AppNodeBuilder } from "@opencode/core/effect/app-node-builder"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { Bus } from "@opencode/core/bus"
import { InstructionDiscovery } from "@opencode/core/instruction-discovery"
import { Instructions } from "@opencode/core/instructions/index"
import { InstructionBuiltIns } from "@opencode/core/instructions/builtins"
import { Location } from "@opencode/core/location"
import { McpInstructions } from "@opencode/core/mcp/instructions"
import { McpTool } from "@opencode/core/tool/mcp"
import { Project } from "@opencode/core/project"
import { ReferenceInstructions } from "@opencode/core/reference/instructions"
import { AbsolutePath } from "@opencode/core/schema"
import { SessionContext } from "@opencode/core/session/context"
import { SessionProjector } from "@opencode/core/session/projector"
import { SessionRunnerModel } from "@opencode/core/session/runner/model"
import { SessionSchema } from "@opencode/core/session/schema"
import { SessionTable } from "@opencode/core/session/sql"
import { SessionStore } from "@opencode/core/session/store"
import { SkillInstructions } from "@opencode/core/skill/instructions"
import { PluginHooks } from "@opencode/core/plugin/hooks"
import { PluginSupervisor } from "@opencode/core/plugin/supervisor"
import { Tool } from "@opencode/core/tool"
import { LanguageModel } from "@opencode/ai"
import { OpenAIChat } from "@opencode/ai/protocols"
import { Effect, Layer } from "effect"
import { testEffect } from "./lib/effect"

const sessionID = SessionSchema.ID.make("ses_context_cache")
let snapshotCalls = 0

const model = LanguageModel.make({ id: "cache-model", provider: "test", route: OpenAIChat.route })
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
        definitions: [ToolDefinition.make({ name: "lookup", description: "Lookup", inputSchema: { type: "object" } })],
        definitionTokens: 4,
        execute: () => Effect.die(new Error("unused")),
      }
    }),
  revision: () => 0,
  transform: () => Effect.die(new Error("unused")),
  reload: () => Effect.void,
  list: () => Effect.succeed([]),
})

const it = testEffect(
  AppNodeBuilder.build(
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
  ),
)

const setup = Effect.gen(function* () {
  const { db } = yield* Database.Service
  const agents = yield* Agent.Service
  const projects = yield* Project.Service
  const context = yield* SessionContext.Service
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
      slug: "context-cache",
      directory: "/project",
      title: "Context cache",
      version: "test",
      agent: Agent.ID.make("build"),
    })
    .run()
    .pipe(Effect.orDie)
  return context
})

it.effect("AP-ENGINE-E01: drain-scoped select reuses snapshot across stable steps", () =>
  Effect.gen(function* () {
    snapshotCalls = 0
    const context = yield* setup
    yield* context.beginDrain
    const first = yield* context.select(sessionID)
    const second = yield* context.select(sessionID)
    const third = yield* context.select(sessionID)
    const stats = context.selectionCacheStats()
    yield* context.endDrain

    expect(first.tools.definitions).toEqual(second.tools.definitions)
    expect(second.agent.id).toEqual(third.agent.id)
    expect(snapshotCalls).toBe(1)
    expect(stats.misses).toBe(1)
    expect(stats.hits).toBe(2)
  }),
)

it.effect("AP-ENGINE-E01: select outside drain always rebuilds", () =>
  Effect.gen(function* () {
    snapshotCalls = 0
    const context = yield* setup
    yield* context.select(sessionID)
    yield* context.select(sessionID)
    expect(snapshotCalls).toBe(2)
  }),
)

it.effect("AP-ENGINE-E10: instructionDirtyEpoch stays stable until catalog invalidation", () =>
  Effect.gen(function* () {
    const context = yield* setup
    const bus = yield* Bus.Service
    yield* context.beginDrain
    const first = context.instructionDirtyEpoch(sessionID)
    const second = context.instructionDirtyEpoch(sessionID)
    expect(second).toBe(first)
    yield* bus.publish(InstructionDiscovery.Event.Updated, {})
    // PubSub delivery is async; poll briefly for the catalog bump.
    let bumped = first
    for (let i = 0; i < 40; i++) {
      bumped = context.instructionDirtyEpoch(sessionID)
      if (bumped !== first) break
      yield* Effect.sleep("25 millis")
    }
    yield* context.endDrain
    expect(bumped).not.toBe(first)
  }),
)
