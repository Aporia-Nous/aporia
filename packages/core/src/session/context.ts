export * as SessionContext from "./context.js"

import { Model } from "../model.js"
import { Permission } from "../permission.js"
import { Context, Effect, Layer, Stream } from "effect"
import { Agent } from "../agent.js"
import { CodeModeInstructions } from "../codemode/instructions.js"
import { Database } from "../database/database.js"
import { makeLocationNode } from "@opencode/util/effect/app-node"
import { InstructionDiscovery } from "../instruction-discovery.js"
import { Instructions } from "../instructions/index.js"
import { InstructionBuiltIns } from "../instructions/builtins.js"
import { Location } from "../location.js"
import { McpInstructions } from "../mcp/instructions.js"
import { McpTool } from "../tool/mcp.js"
import { ReferenceInstructions } from "../reference/instructions.js"
import { SkillInstructions } from "../skill/instructions.js"
import { McpEvent } from "@opencode/schema/mcp-event"
import { Tool } from "../tool.js"
import { AgentNotFoundError } from "./error.js"
import { SessionEvent } from "./event.js"
import { SessionHistory } from "./history.js"
import { SessionProviderContext } from "./provider-context.js"
import { InstructionEntry } from "./instruction-entry.js"
import { SessionMessage } from "./message.js"
import { SessionModelRequest } from "./model-request.js"
import { SessionRunnerModel } from "./runner/model.js"
import { SessionSchema } from "./schema.js"
import { SessionStore } from "./store.js"
import { Bus } from "../bus.js"
import { Skill } from "../skill.js"
import { Reference } from "../reference.js"

export interface Selection {
  readonly session: SessionSchema.Info
  readonly agent: Agent.Selection & { readonly info: Agent.Info }
  readonly instructions: Instructions.List
  readonly tools: Tool.Snapshot
}

export interface Loaded {
  readonly session: SessionSchema.Info
  readonly agent: Agent.Selection & { readonly info: Agent.Info }
  readonly model: SessionRunnerModel.Resolved
  readonly initial: string
  readonly messages: ReadonlyArray<SessionMessage.Info>
  readonly tools: Tool.Snapshot
}

/**
 * Resolves model-request state in two phases: `select` fixes the Session,
 * agent, instruction sources, and tool snapshot; `load` adds the model and
 * active history for that selection. Auxiliary operations resolve only the
 * capabilities they need; request preparation stays separate from selection.
 */
export interface Interface {
  /** Selects the Session, agent, instructions, and tools used by subsequent work. */
  readonly select: (sessionID: SessionSchema.ID) => Effect.Effect<Selection, AgentNotFoundError>
  /** Resolves the model and active history for that selection. */
  readonly load: (selection: Selection) => Effect.Effect<Loaded, SessionRunnerModel.Error>
  readonly resolveModel: (
    session: SessionSchema.Info,
  ) => Effect.Effect<SessionRunnerModel.Resolved, SessionRunnerModel.Error>
  /** Selects auxiliary title capabilities without instruction or tool preflight. */
  readonly selectTitle: (session: SessionSchema.Info) => Effect.Effect<
    | {
        readonly agent: Agent.Info
        readonly primary: SessionRunnerModel.Resolved | undefined
        readonly selected: SessionRunnerModel.Resolved
      }
    | undefined
  >
  /** Opens a drain-scoped selection cache; first select wins until fingerprint changes. */
  readonly beginDrain: Effect.Effect<void>
  /** Drops the drain-scoped selection cache. */
  readonly endDrain: Effect.Effect<void>
  /** Test/observability: hits and misses since the current or last drain. */
  readonly selectionCacheStats: () => { readonly hits: number; readonly misses: number }
  readonly request: SessionModelRequest.Interface
}

/** Location-scoped model-context loader for durable Session Steps. */
export class Service extends Context.Service<Service, Interface>()("@opencode/SessionContext") {}

type DrainCache = {
  mcpFlushed: boolean
  hits: number
  misses: number
  entries: Map<string, { fingerprint: string; selection: Selection }>
}

const fingerprintOf = (input: {
  readonly session: SessionSchema.Info
  readonly toolRevision: number
  readonly catalogGeneration: number
  readonly entriesEpoch: number
}) =>
  [
    input.session.agent ?? "",
    JSON.stringify(input.session.permissions ?? []),
    String(input.toolRevision),
    String(input.catalogGeneration),
    String(input.entriesEpoch),
  ].join("\0")

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const agents = yield* Agent.Service
    const builtins = yield* InstructionBuiltIns.Service
    const model = yield* Model.Service
    const db = (yield* Database.Service).db
    const discovery = yield* InstructionDiscovery.Service
    const entries = yield* InstructionEntry.Service
    const location = yield* Location.Service
    const mcpInstructions = yield* McpInstructions.Service
    const mcpTools = yield* McpTool.Service
    const models = yield* SessionRunnerModel.Service
    const request = yield* SessionModelRequest.Service
    const referenceInstructions = yield* ReferenceInstructions.Service
    const skillInstructions = yield* SkillInstructions.Service
    const store = yield* SessionStore.Service
    const registry = yield* Tool.Service
    const bus = yield* Bus.Service

    let drain: DrainCache | undefined
    let lastStats = { hits: 0, misses: 0 }
    let catalogGeneration = 0
    const entriesEpoch = new Map<string, number>()

    const bumpCatalog = Effect.sync(() => {
      catalogGeneration++
      if (drain) drain.entries.clear()
    })
    const bumpEntries = (sessionID: string) => {
      entriesEpoch.set(sessionID, (entriesEpoch.get(sessionID) ?? 0) + 1)
      if (drain) drain.entries.delete(sessionID)
    }

    yield* bus.subscribe(SessionEvent.InstructionsUpdated).pipe(
      Stream.runForEach((event) => Effect.sync(() => bumpEntries(event.data.sessionID))),
      Effect.forkScoped({ startImmediately: true }),
    )
    for (const definition of [
      Agent.Event.Updated,
      InstructionDiscovery.Event.Updated,
      Skill.Event.Updated,
      Reference.Event.Updated,
      McpEvent.ToolsChanged,
    ] as const) {
      yield* bus.subscribe(definition).pipe(
        Stream.runForEach(() => bumpCatalog),
        Effect.forkScoped({ startImmediately: true }),
      )
    }

    const resolveModel = (session: SessionSchema.Info) => models.resolve(session, model.available)

    const selectTitle = Effect.fn("SessionContext.selectTitle")(function* (session: SessionSchema.Info) {
      const agent = yield* agents.get(Agent.ID.make("title"))
      if (!agent) return
      const primary = yield* resolveModel(session).pipe(Effect.orElseSucceed(() => undefined))
      const info = yield* Effect.gen(function* () {
        if (agent.model) return yield* model.get(agent.model.providerID, agent.model.id)
        if (!primary) return
        return yield* model.small(primary.ref.providerID)
      })
      const variant =
        agent.model?.variant ?? MINIMAL_REASONING_VARIANTS.find((id) => info?.variants.some((item) => item.id === id))
      const preferred =
        info &&
        (yield* resolveModel({
          ...session,
          model: Model.Ref.make({
            providerID: info.providerID,
            id: info.id,
            ...(variant ? { variant } : {}),
          }),
        }).pipe(Effect.orElseSucceed(() => undefined)))
      const selected = preferred ?? primary
      if (!selected) return
      return { agent, primary, selected }
    })

    const selectFresh = Effect.fn("SessionContext.selectFresh")(function* (session: SessionSchema.Info) {
      const agent = yield* agents.select(session.agent)
      if (!agent.info) return yield* new AgentNotFoundError({ sessionID: session.id, agent: session.agent ?? agent.id })
      // Session permissions narrow discovery the same way they narrow the tool snapshot.
      const permissions = Permission.merge(agent.info.permissions, session.permissions ?? [])
      const loaded = yield* Effect.all(
        {
          tools: registry.snapshot(permissions),
          builtins: builtins.load(),
          discovery: discovery.load(),
          skills: skillInstructions.load(permissions),
          references: referenceInstructions.load(),
          mcp: mcpInstructions.load(permissions),
          entries: entries.load(session.id),
        },
        { concurrency: "unbounded" },
      )
      return {
        session,
        agent: { ...agent, info: agent.info },
        // Ordered from most to least shared across sessions so the baseline stays a reusable
        // prompt-cache prefix: user-level catalog and guidance, then project instructions, then
        // the date and environment, which vary by day and directory.
        instructions: Instructions.combine([
          CodeModeInstructions.make(loaded.tools.codeModeCatalog),
          loaded.mcp,
          loaded.references,
          loaded.skills,
          loaded.discovery,
          loaded.builtins,
          loaded.entries,
        ]),
        tools: loaded.tools,
      } satisfies Selection
    })

    const select = Effect.fn("SessionContext.select")(function* (sessionID: SessionSchema.ID) {
      const session = yield* store.get(sessionID)
      if (!session) return yield* Effect.die(new Error(`Session not found: ${sessionID}`))
      if (session.location.directory !== location.directory || session.location.workspaceID !== location.workspaceID)
        return yield* Effect.interrupt

      const cache = drain
      if (cache && !cache.mcpFlushed) {
        yield* mcpTools.flush
        cache.mcpFlushed = true
      } else if (!cache) {
        yield* mcpTools.flush
      }

      const fingerprint = fingerprintOf({
        session,
        toolRevision: registry.revision(),
        catalogGeneration,
        entriesEpoch: entriesEpoch.get(sessionID) ?? 0,
      })

      if (cache) {
        const hit = cache.entries.get(sessionID)
        if (hit && hit.fingerprint === fingerprint) {
          cache.hits++
          // Refresh the session row on a hit so title/directory metadata stay current; agent/tools
          // stay pinned to the fingerprint that proved them stable.
          return { ...hit.selection, session }
        }
      }

      const selected = yield* selectFresh(session)
      if (cache) {
        cache.misses++
        cache.entries.set(sessionID, { fingerprint, selection: selected })
      }
      return selected
    })

    const load = Effect.fn("SessionContext.load")(function* (selection: Selection) {
      const model = yield* resolveModel(selection.session)
      const history = yield* SessionHistory.entriesForRunner(
        db,
        selection.session.id,
        selection.instructions,
        SessionProviderContext.provenance(model) ?? "local",
      )
      return {
        session: selection.session,
        agent: selection.agent,
        model,
        initial: history.initial,
        messages: history.entries.map((entry) => entry.message),
        tools: selection.tools,
      }
    })

    const beginDrain = Effect.sync(() => {
      drain = { mcpFlushed: false, hits: 0, misses: 0, entries: new Map() }
    })

    const endDrain = Effect.sync(() => {
      if (drain) lastStats = { hits: drain.hits, misses: drain.misses }
      drain = undefined
    })

    return Service.of({
      select,
      load,
      resolveModel,
      selectTitle,
      beginDrain,
      endDrain,
      selectionCacheStats: () => (drain ? { hits: drain.hits, misses: drain.misses } : lastStats),
      request,
    })
  }),
)

/** Variant IDs that minimize reasoning output, in preference order. */
const MINIMAL_REASONING_VARIANTS = ["none", "minimal", "low"].map((id) => Model.VariantID.make(id))

export const node = makeLocationNode({
  service: Service,
  layer,
  deps: [
    Agent.node,
    Model.node,
    Database.node,
    InstructionBuiltIns.node,
    InstructionDiscovery.node,
    InstructionEntry.node,
    Location.node,
    McpInstructions.node,
    McpTool.node,
    ReferenceInstructions.node,
    SessionRunnerModel.node,
    SessionModelRequest.node,
    SessionStore.node,
    SkillInstructions.node,
    Tool.node,
    Bus.node,
  ],
})
