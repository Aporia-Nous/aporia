import path from "node:path"
import { expect, test } from "bun:test"
import { Document, Info } from "@opencode/schema/config"
import { ConfigMCP } from "@opencode/schema/config/mcp"
import { Server, WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/server"
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
import { LayerNode } from "@opencode/util/effect/layer-node"
import { tags as appTags } from "@opencode/util/effect/app-node"
import { Context, Effect, Layer, Schedule, Stream } from "effect"
import { ChildProcess } from "effect/process"
import { recordingEnvironmentLayer } from "./fixture/environment"
import { location } from "./fixture/location"
import { registerIntegrationPolicy } from "./fixture/policy"

// A local stdio server whose child process is the thing this task must spawn once per app.
const fixture = path.join(import.meta.dir, "fixture/mcp-output-schema.ts")

const unusedIntegration = () => Effect.die("unused integration service")

const local = () => new ConfigMCP.Local({ type: "local", command: [process.execPath, fixture] })

const busMock = () =>
  Layer.mock(Bus.Service, {
    subscribe: () => Stream.never,
    publish: (definition, data) =>
      Effect.succeed({ id: ID.create(), type: definition.type, data } as Payload<typeof definition>),
  })

const integrationMock = () =>
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
  })

/**
 * One location's MCP service, wired to the shared connection pool so several locations built with the
 * same memo map can reuse a single underlying connection (production wires this through the global node).
 */
const serverLayer = (input: {
  readonly directory: AbsolutePath
  readonly environment: Layer.Layer<Environment.Service>
  readonly pool: Layer.Layer<McpShared.Service>
  readonly server: typeof ConfigMCP.Server.Type
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
            info: new Info({ mcp: new ConfigMCP.Info({ servers: { shared: input.server } }) }),
          }),
        ]),
        Layer.succeed(Location.Service, Location.Service.of(location({ directory: input.directory }))),
        busMock(),
        integrationMock(),
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
const twoLocations = (input: {
  readonly spawns: Array<ChildProcess.Command>
  readonly server: typeof ConfigMCP.Server.Type
}) =>
  Effect.gen(function* () {
    const scope = yield* Effect.scope
    const memo = Layer.makeMemoMapUnsafe()
    const pool: Layer.Layer<McpShared.Service> = McpShared.layer
    const build = (directory: string) =>
      Layer.buildWithMemoMap(
        serverLayer({
          directory: AbsolutePath.make(directory),
          environment: recordingEnvironmentLayer(input.spawns),
          pool,
          server: input.server,
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

/**
 * A remote (HTTP) MCP server whose first session can be forced to answer 404, which is how the client
 * learns a session expired. A reconnect opens a fresh session (no session header), so the next call works.
 */
const remoteServer = () =>
  Effect.acquireRelease(
    Effect.promise(async () => {
      const state = {
        initializations: 0,
        toolCalls: [] as string[],
        firstSession: undefined as string | undefined,
        expired: false,
      }
      // One Server speaks one session, so a reconnect needs a fresh protocol + transport.
      const build = async () => {
        const protocol = new Server({ name: "mcp-scope", version: "1.0.0" }, { capabilities: { tools: {} } })
        protocol.setRequestHandler("tools/list", () =>
          Promise.resolve({ tools: [{ name: "echo", inputSchema: { type: "object" as const, properties: {} } }] }),
        )
        protocol.setRequestHandler("tools/call", (request) => {
          state.toolCalls.push(request.params.name)
          return Promise.resolve({ content: [] })
        })
        const transport = new WebStandardStreamableHTTPServerTransport({
          sessionIdGenerator: () => crypto.randomUUID(),
          enableJsonResponse: true,
        })
        await protocol.connect(transport)
        return { protocol, transport }
      }
      let current = await build()
      const http = Bun.serve({
        port: 0,
        fetch: async (request) => {
          const session = request.headers.get("mcp-session-id")
          if (session && !state.firstSession) state.firstSession = session
          const body: unknown = request.method === "POST" ? await request.clone().json() : undefined
          const initialize =
            typeof body === "object" && body !== null && "method" in body && body.method === "initialize"
          if (initialize) state.initializations += 1
          // The original session is the expired one; a fresh initialize (no session header) rebuilds.
          if (state.expired && session === state.firstSession) return new Response(null, { status: 404 })
          if (initialize && session === null) {
            const previous = current
            current = await build()
            await previous.protocol.close().catch(() => {})
          }
          return current.transport.handleRequest(request)
        },
      })
      return {
        state,
        url: http.url.toString(),
        close: async () => {
          await current.protocol.close().catch(() => {})
          await http.stop(true)
        },
      }
    }),
    (server) => Effect.promise(server.close),
  )

test("connects a shared MCP server exactly once across locations", async () => {
  const spawns: Array<ChildProcess.Command> = []
  const result = await Effect.runPromise(
    withFlag(
      "1",
      Effect.scoped(
        Effect.gen(function* () {
          const { first, second } = yield* twoLocations({ spawns, server: local() })
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
          const { first, second } = yield* twoLocations({ spawns, server: local() })
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

test("rebuilds one shared connection on session expiry at refcount > 1", async () => {
  const outcome = await Effect.runPromise(
    withFlag(
      "1",
      Effect.scoped(
        Effect.gen(function* () {
          const server = yield* remoteServer()
          const { first, second } = yield* twoLocations({
            spawns: [],
            server: new ConfigMCP.Remote({ type: "remote", url: server.url, oauth: false }),
          })
          const serviceA = Context.get(first, Mcp.Service)
          const serviceB = Context.get(second, Mcp.Service)
          yield* settled(serviceA)
          yield* settled(serviceB)

          // The server now rejects the first session; a call from A must reconnect, and B must then
          // use that same fresh connection rather than the dead one.
          server.state.expired = true
          const fromA = yield* serviceA.callTool({ server: "shared", name: "echo" })
          const fromB = yield* serviceB.callTool({ server: "shared", name: "echo" })
          return { fromA, fromB, initializations: server.state.initializations, calls: server.state.toolCalls }
        }),
      ),
    ),
  )

  expect(outcome.fromA.isError).toBe(false)
  expect(outcome.fromB.isError).toBe(false)
  expect(outcome.calls).toEqual(["echo", "echo"])
  // One initial connect plus exactly one shared reconnect — not one per location.
  expect(outcome.initializations).toBe(2)
}, 30_000)

test("wires the shared pool through the production Mcp node", async () => {
  const spawns: Array<ChildProcess.Command> = []
  const count = await Effect.runPromise(
    withFlag(
      "1",
      Effect.scoped(
        Effect.gen(function* () {
          const scope = yield* Effect.scope
          const memo = Layer.makeMemoMapUnsafe()
          // Emulate Instance.layer: location nodes get a fresh memo per location, the global (pool) node
          // is memoized in the shared map. If McpShared.node were dropped from Mcp.configured()'s deps,
          // Mcp.layer would find no pool and fall back to a connection per location (two spawns).
          const build = (directory: string) =>
            Layer.buildWithMemoMap(
              LayerNode.compile(LayerNode.group([Mcp.node]), {
                shared: appTags.values.global,
                replacements: [
                  Bus.node.replace(busMock()),
                  Environment.node.replace(recordingEnvironmentLayer(spawns)),
                  Form.node.replace(Form.layer.pipe(Layer.provide(busMock()))),
                  Integration.node.replace(integrationMock()),
                  Credential.node.replace(Layer.mock(Credential.Service, {})),
                  Location.node.replace(
                    Layer.succeed(
                      Location.Service,
                      Location.Service.of(location({ directory: AbsolutePath.make(directory) })),
                    ),
                  ),
                ],
              }),
              memo,
              scope,
            )
          const first = yield* build(path.join(import.meta.dir, "fixture"))
          const second = yield* build(import.meta.dir)
          const serviceA = Context.get(first, Mcp.Service)
          const serviceB = Context.get(second, Mcp.Service)
          yield* serviceA.add("shared", local())
          yield* serviceB.add("shared", local())
          yield* settled(serviceA)
          yield* settled(serviceB)
          return spawnsFor(spawns).length
        }),
      ),
    ),
  )

  expect(count).toBe(1)
}, 30_000)
