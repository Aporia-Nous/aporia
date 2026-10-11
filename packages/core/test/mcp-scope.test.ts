import path from "node:path"
import { expect, test } from "bun:test"
import { Document, Info } from "@opencode/schema/config"
import { ConfigMCP } from "@opencode/schema/config/mcp"
import { Config } from "@opencode/core/config"
import { ConfigMcpPlugin } from "@opencode/core/config/plugin/mcp"
import { Credential } from "@opencode/core/credential"
import { Bus } from "@opencode/core/bus"
import { ID, type Payload } from "@opencode/schema/event"
import { Form } from "@opencode/core/form"
import { Integration } from "@opencode/core/integration"
import { Environment } from "@opencode/core/environment/index"
import { Location } from "@opencode/core/location"
import { ManagedPolicy } from "@opencode/core/managed-policy"
import { Mcp } from "@opencode/core/mcp/index"
import { McpShared } from "@opencode/core/mcp/shared"
import { AbsolutePath } from "@opencode/core/schema"
import { State } from "@opencode/core/state"
import { Context, Effect, Layer, Schedule, Stream } from "effect"
import { ChildProcess } from "effect/process"
import { recordingEnvironmentLayer } from "./fixture/environment"
import { location } from "./fixture/location"
import { registerIntegrationPolicy } from "./fixture/policy"

// A local stdio server whose child process is the thing this task must spawn once per app.
const fixture = path.join(import.meta.dir, "fixture/mcp-output-schema.ts")

const unusedIntegration = () => Effect.die("unused integration service")

const register = () => new ConfigMCP.Local({ type: "local", command: [process.execPath, fixture] })

/**
 * One location's MCP service, wired to the shared connection pool so several locations built with the
 * same memo map can reuse a single underlying connection (production wires this through the global node).
 */
const serverLayer = (input: {
  readonly directory: AbsolutePath
  readonly environment: Layer.Layer<Environment.Service>
  readonly pool: Layer.Layer<McpShared.Service>
}): Layer.Layer<Mcp.Service> =>
  Layer.effectDiscard(
    Effect.gen(function* () {
      const bus = yield* Bus.Service
      const mcp = yield* Mcp.Service
      yield* State.batch(
        Effect.gen(function* () {
          yield* ConfigMcpPlugin.register(bus.subscribe())
          yield* registerIntegrationPolicy({ mcp, events: bus.subscribe() })
        }),
      )
    }),
  ).pipe(
    Layer.provideMerge(Mcp.layer()),
    Layer.provideMerge(Form.layer),
    Layer.provide(
      Layer.mergeAll(
        ManagedPolicy.layer,
        Config.testLayer([
          new Document({
            type: "document",
            info: new Info({ mcp: new ConfigMCP.Info({ servers: { shared: register() } }) }),
          }),
        ]),
        Layer.succeed(Location.Service, Location.Service.of(location({ directory: input.directory }))),
        Layer.mock(Bus.Service, {
          subscribe: () => Stream.never,
          publish: (definition, data) =>
            Effect.succeed({ id: ID.create(), type: definition.type, data } as Payload<typeof definition>),
        }),
        Layer.mock(Integration.Service, {
          revision: () => 0,
          connection: {
            active: unusedIntegration,
            resolve: unusedIntegration,
            key: unusedIntegration,
            external: unusedIntegration,
            activate: unusedIntegration,
            update: unusedIntegration,
            remove: unusedIntegration,
            status: unusedIntegration,
          },
          oauth: {
            connect: unusedIntegration,
            status: unusedIntegration,
            complete: unusedIntegration,
            cancel: unusedIntegration,
          },
          command: {
            connect: unusedIntegration,
            status: unusedIntegration,
            cancel: unusedIntegration,
          },
        }),
        Layer.mock(Credential.Service, {}),
        input.environment,
        input.pool,
      ),
    ),
  )

const spawnsFor = (spawns: ReadonlyArray<ChildProcess.Command>) =>
  spawns.filter(
    (command) =>
      ChildProcess.isStandardCommand(command) &&
      command.args.some((arg) => typeof arg === "string" && arg.includes("mcp-output-schema")),
  )

const settled = (service: Mcp.Interface, name = "shared") =>
  Effect.gen(function* () {
    const status = (yield* service.servers()).find((server) => server.name === name)?.status
    if (!status || status.status === "pending") return yield* Effect.fail("pending")
    return status
  }).pipe(Effect.retry({ times: 750, schedule: Schedule.spaced("20 millis") }))

/** Builds two locations that share one memo map, so their global (pool) node is acquired once. */
const twoLocations = (spawns: Array<ChildProcess.Command>) =>
  Effect.gen(function* () {
    const scope = yield* Effect.scope
    const memo = Layer.makeMemoMapUnsafe()
    const pool: Layer.Layer<McpShared.Service> = McpShared.layer
    const build = (directory: string) =>
      Layer.buildWithMemoMap(
        serverLayer({
          directory: AbsolutePath.make(directory),
          environment: recordingEnvironmentLayer(spawns),
          pool,
        }),
        memo,
        scope,
      )
    const first = yield* build(path.join(import.meta.dir, "fixture"))
    const second = yield* build(import.meta.dir)
    return { first, second }
  })

const withFlag = <A, E, R>(value: string | undefined, effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const previous = process.env.APORIA_GLOBAL_MCP
    if (value === undefined) delete process.env.APORIA_GLOBAL_MCP
    else process.env.APORIA_GLOBAL_MCP = value
    const exit = yield* effect.pipe(Effect.exit)
    if (previous === undefined) delete process.env.APORIA_GLOBAL_MCP
    else process.env.APORIA_GLOBAL_MCP = previous
    return yield* exit
  })

test("connects a shared MCP server exactly once across locations", async () => {
  const spawns: Array<ChildProcess.Command> = []
  const result = await Effect.runPromise(
    withFlag(
      "1",
      Effect.scoped(
        Effect.gen(function* () {
          const { first, second } = yield* twoLocations(spawns)
          const serviceA = Context.get(first, Mcp.Service)
          const serviceB = Context.get(second, Mcp.Service)
          const a = yield* settled(serviceA)
          const b = yield* settled(serviceB)
          const toolsA = yield* serviceA.tools()
          const toolsB = yield* serviceB.tools()
          return { a, b, toolsA, toolsB }
        }),
      ),
    ),
  )

  expect([result.a, result.b]).toEqual([{ status: "connected" }, { status: "connected" }])
  expect(result.toolsA.map((tool) => tool.name)).toEqual(["first", "second"])
  expect(result.toolsB.map((tool) => tool.name)).toEqual(["first", "second"])
  expect(spawnsFor(spawns)).toHaveLength(1)
}, 30_000)

test("falls back to one connection per location when APORIA_GLOBAL_MCP=0", async () => {
  const spawns: Array<ChildProcess.Command> = []
  const statuses = await Effect.runPromise(
    withFlag(
      "0",
      Effect.scoped(
        Effect.gen(function* () {
          const { first, second } = yield* twoLocations(spawns)
          const a = yield* settled(Context.get(first, Mcp.Service))
          const b = yield* settled(Context.get(second, Mcp.Service))
          return [a, b]
        }),
      ),
    ),
  )

  expect(statuses).toEqual([{ status: "connected" }, { status: "connected" }])
  expect(spawnsFor(spawns)).toHaveLength(2)
}, 30_000)
