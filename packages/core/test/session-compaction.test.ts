import { expect, test } from "bun:test"
import { GenerationOptions, LLMClient, LLMEvent, LanguageModel, ToolDefinition, type LLMRequest } from "@opencode/ai"
import { OpenAIChat } from "@opencode/ai/protocols"
import { Database } from "@opencode/core/database/database"
import { AppNodeBuilder } from "@opencode/core/effect/app-node-builder"
import { llmClient } from "@opencode/core/effect/app-node-platform"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { Bus } from "@opencode/core/bus"
import { EventTable } from "@opencode/core/event/sql"
import { SessionCompaction } from "@opencode/core/session/compaction"
import type { SessionContext } from "@opencode/core/session/context"
import { SessionEvent } from "@opencode/core/session/event"
import { SessionMessage } from "@opencode/core/session/message"
import { SessionModelRequest } from "@opencode/core/session/model-request"
import { PluginHooks } from "@opencode/core/plugin/hooks"
import { SessionProjector } from "@opencode/core/session/projector"
import { SessionRunnerModel } from "@opencode/core/session/runner/model"
import { SessionTable } from "@opencode/core/session/sql"
import { SessionStore } from "@opencode/core/session/store"
import { Token } from "@opencode/core/util/token"
import { Session } from "@opencode/core/session"
import { Location } from "@opencode/core/location"
import { Project } from "@opencode/core/project"
import { ProjectTable } from "@opencode/core/project/sql"
import { App } from "@opencode/core/app"
import { Agent } from "@opencode/core/agent"
import { Provider } from "@opencode/core/provider"
import { AbsolutePath } from "@opencode/core/schema"
import { Money } from "@opencode/schema/money"
import { Skill } from "@opencode/schema/skill"
import { Shell } from "@opencode/schema/shell"
import { DateTime, Effect, Fiber, Layer, Schema, Stream } from "effect"
import { asc, eq } from "drizzle-orm"
import { testEffect } from "./lib/effect"

let requests: LLMRequest[] = []
const model = LanguageModel.make({
  id: "summary-model",
  provider: "test",
  route: OpenAIChat.route,
})
const cost = [
  {
    input: Money.USDPerMillionTokens.make(1),
    output: Money.USDPerMillionTokens.make(2),
    cache: {
      read: Money.USDPerMillionTokens.make(0.1),
      write: Money.USDPerMillionTokens.make(0.5),
    },
  },
]
const client = Layer.mock(LLMClient.Service)({
  stream: (request: LLMRequest) => {
    requests.push(request)
    return Stream.make(
      LLMEvent.textDelta({ id: "summary", text: "## Objective\n- manual summary" }),
      LLMEvent.stepFinish({
        index: 0,
        reason: { normalized: "stop" },
        usage: {
          inputTokens: 15,
          outputTokens: 6,
          nonCachedInputTokens: 10,
          cacheReadInputTokens: 3,
          cacheWriteInputTokens: 2,
          reasoningTokens: 2,
        },
      }),
      LLMEvent.finish({
        reason: { normalized: "stop" },
      }),
    )
  },
  generate: () => Effect.die("unused"),
})
const resolved = SessionRunnerModel.resolved(model, {
  capabilities: { tools: true, input: ["text", "image"], output: ["text"] },
  cost,
  limit: { context: 200_000, output: 32_000 },
})
const it = testEffect(
  AppNodeBuilder.build(
    LayerNode.group([
      Database.node,
      Bus.node,
      SessionProjector.node,
      SessionStore.node,
      SessionCompaction.node,
      SessionModelRequest.node,
      PluginHooks.node,
    ]),
    [
      Bus.node.replace(Bus.configured({ persist: true })),
      llmClient.replace(client),
      Location.node.replace(Location.boundNode({ directory: AbsolutePath.make("/project") })),
    ],
  ),
)

test("compaction prompt preserves detailed work state and relevant files", () => {
  const prompt = SessionCompaction.buildPrompt(false)

  expect(prompt).toContain("## Work State")
  expect(prompt).toContain("### Completed")
  expect(prompt).toContain("### Active")
  expect(prompt).toContain("### Blocked")
  expect(prompt).toContain("## Relevant Files")
})

it.effect("compaction describes tool media without embedding base64", () =>
  Effect.gen(function* () {
    const base64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB"
    const recent = yield* recentWithToolOutput(Session.ID.make("ses_tool_media"), [
      { type: "text", text: "Image read successfully" },
      {
        type: "file",
        uri: `data:image/png;base64,${base64}`,
        mime: "image/png",
        name: "pixel.png",
      },
    ])

    expect(recent).toContain("[Tool result]: Image read successfully\n[Attached image/png: pixel.png]")
    expect(recent).not.toContain(base64)
  }),
)

it.effect("compaction truncation does not split surrogate pairs", () =>
  Effect.gen(function* () {
    const prefix = "a".repeat(1_249)
    const split = yield* recentWithToolOutput(Session.ID.make("ses_truncate_split"), [
      { type: "text", text: `${prefix}😀suffix` },
    ])
    const whole = yield* recentWithToolOutput(Session.ID.make("ses_truncate_whole"), [
      { type: "text", text: "😀".repeat(1_250) },
    ])

    expect(split).toEndWith(`[Tool result]: ${prefix}😀\n[truncated]`)
    expect(whole).toEndWith(`[Tool result]: ${"😀".repeat(1_250)}`)
  }),
)

test("compaction prompt requires the checkpoint headings in order", () => {
  const prompt = SessionCompaction.buildPrompt(false)
  expect(prompt.match(/^#{2,3} .+$/gm)).toEqual([
    "## Objective",
    "## Requirements",
    "## Decisions",
    "## Work State",
    "### Completed",
    "### Active",
    "### Blocked",
    "## Next Move",
    "## Relevant Files",
    "## Important Context",
  ])
})

test("compaction update prompt rewrites legacy checkpoints only when asked", () => {
  const rewrite = "The existing checkpoint was written with an earlier format"
  expect(SessionCompaction.buildPrompt(true, true)).toContain(rewrite)
  expect(SessionCompaction.buildPrompt(true)).not.toContain(rewrite)
  expect(SessionCompaction.buildPrompt(false, true)).not.toContain(rewrite)
})

test("compaction prompts prohibit task execution", () => {
  for (const update of [false, true])
    expect(SessionCompaction.buildPrompt(update)).toContain("Do not continue the task or call tools")
})

it.effect("auto compaction estimates current content against the buffered prompt ceiling", () =>
  Effect.gen(function* () {
    const compaction = yield* SessionCompaction.Service
    const session = yield* insertSession(Session.ID.make("ses_input_limit"))
    const input = (tokens: number, limit: { context: number; input?: number; output: number }) => ({
      session,
      model: SessionRunnerModel.resolved(model, {
        capabilities: { tools: true, input: ["text", "image", "pdf"], output: ["text"] },
        cost: [],
        limit,
      }),
      messages: [
        Schema.decodeUnknownSync(SessionMessage.Assistant)({
          id: SessionMessage.ID.make("msg_assistant"),
          type: "assistant",
          agent: Agent.defaultID,
          model: { id: "summary-model", providerID: "test" },
          content: [{ type: "text", text: "Done" }],
          tokens: { input: tokens, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
          time: { created: 0, completed: 0 },
        }),
      ],
      agent: {
        id: Agent.defaultID,
        info: { ...Agent.Info.default(Agent.defaultID), system: "You are a helpful assistant." },
      },
      initial: "Project instructions.",
      tools: {
        definitions: [
          ToolDefinition.make({ name: "read", description: "Read files", inputSchema: { type: "object" } }),
        ],
        execute: () => Effect.die("unused"),
      },
    })
    // An automatic compaction that is not due is skipped.
    const due = (context: SessionContext.Loaded) =>
      compaction.compact({ reason: "auto", context }).pipe(Effect.map((outcome) => outcome.status !== "skipped"))

    // The input limit takes precedence over the larger context window: 110k less the 16k reserve.
    const inputLimited = { context: 400_000, input: 110_000, output: 128_000 }
    expect(yield* due(input(93_999, inputLimited))).toBe(false)
    expect(yield* due(input(94_000, inputLimited))).toBe(true)
    const native = (tokens: number, limit: { context: number; input?: number; output: number } = inputLimited) => {
      const selected = input(tokens, limit)
      return { ...selected, model: { ...selected.model, compaction: { type: "native" as const } } }
    }
    expect(yield* due(native(93_999))).toBe(false)
    expect(yield* due(native(94_000))).toBe(true)
    // A window far above the working context does not raise the ceiling: a session resting at 900k pays for 900k on
    // every request, so automatic compaction aims at `max_context` instead of following the window.
    const hugeWindow = { context: 1_000_000, output: 384_000 }
    expect(yield* due(native(99_999, hugeWindow))).toBe(false)
    expect(yield* due(native(100_000, hugeWindow))).toBe(true)
    // A window with no known limit is bounded the same way, so it cannot run unbounded.
    expect(yield* due(native(99_999, { context: 0, input: undefined, output: 0 }))).toBe(false)
    expect(yield* due(native(100_000, { context: 0, input: undefined, output: 0 }))).toBe(true)
    // A system prompt that reaches the ceiling on its own cannot be compacted away, so the session is left alone
    // rather than summarized on every step.
    const plain = input(0, hugeWindow)
    const verbose = {
      ...plain,
      agent: { ...plain.agent, info: { ...plain.agent.info, system: "x".repeat(1_000_000) } },
    }
    expect(SessionCompaction.estimateContext(verbose)).toBeGreaterThanOrEqual(100_000)
    expect(yield* due(verbose)).toBe(false)
    // With the model's own window as the binding limit, compaction stays available even though the system prompt
    // cannot fit it: nothing else could bring the request under that window.
    expect(yield* due({ ...verbose, model: input(0, { context: 500, output: 100 }).model })).toBe(true)

    // The summary's 16k output limit is more than 10% of a 100k window, so it sets the ceiling.
    const contextLimited = { context: 100_000, output: 10_000 }
    expect(yield* due(input(83_999, contextLimited))).toBe(false)
    expect(yield* due(input(84_000, contextLimited))).toBe(true)

    // The reply limit does not lower the ceiling.
    const outputLimited = { context: 100_000, output: 30_000 }
    expect(yield* due(input(83_999, outputLimited))).toBe(false)
    expect(yield* due(input(84_000, outputLimited))).toBe(true)

    const assistant = input(89_000, contextLimited).messages[0]
    const tool = SessionMessage.AssistantTool.make({
      type: "tool",
      id: "call_read",
      name: "read",
      state: { status: "completed", input: {}, content: [{ type: "text", text: "x".repeat(4_000) }] },
      time: { created: DateTime.makeUnsafe(0) },
    })
    const grown = { ...input(89_000, contextLimited), messages: [{ ...assistant, content: [tool] }] }
    expect(SessionCompaction.estimateContext(grown)).toBe(90_000)
    expect(yield* due(grown)).toBe(true)

    const interrupted = { ...assistant, id: SessionMessage.ID.create(), tokens: undefined }
    expect(SessionCompaction.estimateContext({ ...grown, messages: [...grown.messages, interrupted] })).toBe(90_001)
    // Without provider usage, include 20 tokens for the system prompt, instructions, and tool definition.
    expect(SessionCompaction.estimateContext({ ...grown, messages: [interrupted] })).toBe(21)
    // Another provider's usage is not trusted either.
    const foreign = { ...assistant, model: { ...assistant.model, providerID: Provider.ID.make("other") } }
    expect(SessionCompaction.estimateContext({ ...grown, messages: [foreign] })).toBe(21)
    expect(
      SessionCompaction.estimateContext({
        ...grown,
        messages: [{ ...interrupted, tokens: input(0, contextLimited).messages[0].tokens }],
      }),
    ).toBe(21)

    const media = [
      { type: "file", mime: "image/png", uri: `data:image/png;base64,${"a".repeat(100_000)}` },
      { type: "file", mime: "application/pdf", uri: `data:application/pdf;base64,${"a".repeat(100_000)}` },
    ] as const
    const messages = [
      { ...assistant, content: [{ ...tool, state: { status: "completed" as const, input: {}, content: media } }] },
    ]
    expect(SessionCompaction.estimateContext({ ...grown, messages })).toBe(92_500)
    const user = Schema.decodeUnknownSync(SessionMessage.User)({
      id: SessionMessage.ID.create(),
      type: "user",
      text: "",
      files: media.map((file) => ({ mime: file.mime, data: "a".repeat(100_000), source: { type: "inline" } })),
      time: { created: 0 },
    })
    expect(SessionCompaction.estimateContext({ ...grown, messages: [...messages, user] })).toBe(96_000)
    for (const [modalities, tokens, fallback] of [
      [["text", "image"], 92_040, 1_520],
      [["text", "pdf"], 93_042, 2_021],
      [["text"], 89_082, 41],
    ] as const) {
      const selected = {
        ...grown,
        model: { ...grown.model, capabilities: { ...grown.model.capabilities, input: modalities } },
      }
      expect(SessionCompaction.estimateContext({ ...selected, messages: [...messages, user] })).toBe(tokens)
      expect(SessionCompaction.estimateContext({ ...selected, messages: [user] })).toBe(fallback + 20)
    }

    const checkpoint = Schema.decodeUnknownSync(SessionMessage.CompactionCompleted)({
      id: SessionMessage.ID.create(),
      type: "compaction",
      status: "completed",
      reason: "auto",
      summary: "x".repeat(400_000),
      recent: "",
      time: { created: 0, completed: 0 },
    })
    expect(yield* due({ ...grown, messages: [checkpoint] })).toBe(false)
  }),
)

/** Seeds the global project plus one session row, returning the projected session. */
const insertSession = (id: Session.ID, overrides?: Partial<typeof SessionTable.$inferInsert>) =>
  Effect.gen(function* () {
    const db = (yield* Database.Service).db
    yield* db
      .insert(ProjectTable)
      .values({ id: Project.ID.global, worktree: AbsolutePath.make("/project"), sandboxes: [] })
      .onConflictDoNothing()
      .run()
      .pipe(Effect.orDie)
    yield* db
      .insert(SessionTable)
      .values({
        id,
        project_id: Project.ID.global,
        slug: id,
        directory: "/project",
        title: id,
        version: "test",
        ...overrides,
      })
      .run()
      .pipe(Effect.orDie)
    const store = yield* SessionStore.Service
    return yield* store
      .get(id)
      .pipe(Effect.flatMap((session) => (session ? Effect.succeed(session) : Effect.die(`session missing: ${id}`))))
  })

const loaded = (session: Session.Info, messages: readonly SessionMessage.Info[]) => ({
  session,
  messages,
  model: resolved,
  agent: { id: Agent.defaultID, info: Agent.Info.default(Agent.defaultID) },
  initial: "Session instructions",
  tools: { definitions: [], execute: () => Effect.die("Compaction must not execute tools") },
})

/** Opens the compaction's message as the runner does when it delivers `/compact`, then compacts. */
const compactManually = (
  session: Session.Info,
  messages: readonly SessionMessage.Info[],
  inputID = SessionMessage.ID.create(),
) =>
  Effect.gen(function* () {
    const bus = yield* Bus.Service
    const compaction = yield* SessionCompaction.Service
    yield* bus.publish(SessionEvent.Compaction.Started, {
      sessionID: session.id,
      reason: "manual",
      recent: "",
      inputID,
    })
    return yield* compaction.compact({ reason: "manual", context: loaded(session, messages), inputID })
  })

/** The recent text a manual compaction keeps when the latest exchange is one tool call with this output. */
const recentWithToolOutput = (id: Session.ID, content: SessionMessage.ToolStateCompleted["content"]) =>
  Effect.gen(function* () {
    const session = yield* insertSession(id)
    const user = (text: string) =>
      SessionMessage.User.make({
        id: SessionMessage.ID.create(),
        type: "user",
        text,
        time: { created: DateTime.makeUnsafe(0) },
      })
    const assistant = Schema.decodeUnknownSync(SessionMessage.Assistant)({
      id: SessionMessage.ID.create(),
      type: "assistant",
      agent: Agent.defaultID,
      model: { id: "summary-model", providerID: "test" },
      content: [
        {
          type: "tool",
          id: "call_read",
          name: "read",
          state: { status: "completed", input: {}, content },
          time: { created: 0 },
        },
      ],
      time: { created: 0, completed: 0 },
    })
    expect(yield* compactManually(session, [user("Earlier question"), user("Read it"), assistant])).toEqual({
      status: "completed",
    })
    const store = yield* SessionStore.Service
    const stored = (yield* store.context(id))[0]
    return stored?.type === "compaction" && stored.status === "completed" ? stored.recent : ""
  })

/**
 * Two user messages, then one long stretch of assistant tool results that together exceed the configured `keep`
 * (15,000 tokens). The last user message sits far earlier than the first message that fits the allowance, so a
 * boundary snap that ignores the budget keeps the whole stretch verbatim.
 */
it.effect("recent text fits keep even when the last user message is far behind the budget", () =>
  Effect.gen(function* () {
    requests = []
    const sessionID = Session.ID.make("ses_keep_budget")
    const session = yield* insertSession(sessionID)
    const user = (text: string) =>
      SessionMessage.User.make({
        id: SessionMessage.ID.create(),
        type: "user",
        text,
        time: { created: DateTime.makeUnsafe(0) },
      })
    const assistant = (call: string) =>
      Schema.decodeUnknownSync(SessionMessage.Assistant)({
        id: SessionMessage.ID.create(),
        type: "assistant",
        agent: Agent.defaultID,
        model: { id: "summary-model", providerID: "test" },
        content: [
          {
            type: "tool",
            id: call,
            name: "read",
            state: {
              status: "completed",
              input: { filePath: `${call}.txt` },
              // The largest a single tool output survives the transcript's own truncation at.
              content: [{ type: "text", text: "x".repeat(1_250) }],
            },
            time: { created: 0 },
          },
        ],
        time: { created: 0, completed: 0 },
      })
    const messages = [
      user("Earlier question"),
      user("Read every file"),
      ...Array.from({ length: 60 }, (_, index) => assistant(`call_read_${index}`)),
    ]

    expect(yield* compactManually(session, messages)).toEqual({ status: "completed" })

    const store = yield* SessionStore.Service
    const stored = (yield* store.context(sessionID))[0]
    const recent = stored?.type === "compaction" && stored.status === "completed" ? stored.recent : ""

    // 60 results of ~330 tokens each: keeping all of them is ~20k tokens, well past the 15,000 default `keep`.
    expect(Token.estimate(recent)).toBeLessThanOrEqual(15_000)
    expect(recent).toContain("call_read_59")
    expect(recent).not.toContain("call_read_0.txt")
    // The cut lands inside one exchange, so the retained text says so instead of looking like a whole turn.
    expect(recent).toContain("summarized above")
  }))

it.effect("manual compaction summarizes short context instead of no-op", () =>
  Effect.gen(function* () {
    requests = []
    const db = (yield* Database.Service).db
    const bus = yield* Bus.Service
    const store = yield* SessionStore.Service
    const sessionID = Session.ID.make("ses_manual_compaction")
    const parentID = Session.ID.make("ses_manual_compaction_parent")
    const userMessage = {
      id: SessionMessage.ID.create(),
      type: "user" as const,
      text: "Manual compaction should include this short conversation.",
      skills: [
        {
          id: Skill.ID.make("effect"),
          name: Skill.Name.make("Effect"),
          text: "Use Effect services and generators.",
        },
      ],
      time: { created: DateTime.makeUnsafe(0) },
    }
    const session = yield* insertSession(sessionID, { parent_id: parentID })
    const hooks = yield* PluginHooks.Service
    let hooked = 0
    yield* hooks.register("session", "compaction", (event) =>
      Effect.sync(() => {
        hooked = event.messages.length
        expect(JSON.stringify(event.messages)).not.toContain("Summarize only what")
      }),
    )
    const messages = [
      userMessage,
      SessionMessage.Shell.make({
        id: SessionMessage.ID.create(),
        type: "shell",
        shellID: Shell.ID.make("sh_background"),
        status: "exited",
        command: "pwd",
        metadata: { background: true },
        output: { output: "display-only-output", cursor: 19, size: 19, truncated: false },
        time: { created: DateTime.makeUnsafe(0), completed: DateTime.makeUnsafe(1) },
      }),
      SessionMessage.Synthetic.make({
        id: SessionMessage.ID.create(),
        type: "synthetic",
        text: "User shell pwd completed: /project",
        time: { created: DateTime.makeUnsafe(2) },
      }),
    ]

    const delta = yield* bus
      .subscribe(SessionEvent.Compaction.Delta)
      .pipe(Stream.take(1), Stream.runCollect, Effect.forkScoped)
    yield* Effect.yieldNow
    expect(yield* compactManually(session, messages, SessionMessage.ID.make("msg_manual_compaction"))).toEqual({
      status: "completed",
    })
    expect(Array.from(yield* Fiber.join(delta)).map((event) => event.data.text)).toEqual([
      "## Objective\n- manual summary",
    ])

    expect(requests).toHaveLength(1)
    expect(requests[0]?.promptCacheKey).toBe(parentID)
    expect(requests[0]?.http?.headers).toEqual({
      "x-opencode-session-id": session.id,
      "x-opencode-parent-session-id": parentID,
      "x-session-affinity": parentID,
      "X-Session-Id": parentID,
      "x-parent-session-id": parentID,
      "User-Agent": App.useragent(App.make()),
      "x-opencode-project": Project.ID.global,
      "x-opencode-session": parentID,
      "x-opencode-client": "opencode",
    })
    expect(requests[0]?.generation).toEqual(GenerationOptions.make({ maxTokens: 20_000 }))
    expect(JSON.stringify(requests[0]?.messages)).toContain("Manual compaction should include this short conversation.")
    expect(JSON.stringify(requests[0]?.messages)).toContain("Use Effect services and generators.")
    expect(JSON.stringify(requests[0]?.messages)).toContain("User shell pwd completed: /project")
    expect(requests[0]?.messages).toHaveLength(hooked + 1)
    expect(JSON.stringify(requests[0]?.messages.at(-1))).toContain("Summarize only what")
    expect(JSON.stringify(requests[0]?.messages)).not.toContain("display-only-output")
    // The compaction message carries its own request usage so clients can show what compacting cost.
    expect(yield* store.context(sessionID)).toMatchObject([
      {
        type: "compaction",
        reason: "manual",
        summary: "## Objective\n- manual summary",
        recent: "",
        cost: 0.0000233,
        tokens: { input: 10, output: 4, reasoning: 2, cache: { read: 3, write: 2 } },
      },
    ])
    expect(yield* store.get(sessionID)).toMatchObject({
      cost: 0.0000233,
      tokens: { input: 10, output: 4, reasoning: 2, cache: { read: 3, write: 2 } },
    })
    expect(
      yield* db
        .select({ type: EventTable.type })
        .from(EventTable)
        .where(eq(EventTable.aggregate_id, sessionID))
        .orderBy(asc(EventTable.seq))
        .all()
        .pipe(Effect.orDie),
    ).toEqual([
      { type: Bus.versionedType(SessionEvent.Compaction.Started.type, 1) },
      { type: Bus.versionedType(SessionEvent.UsageRecorded.type, 1) },
      { type: Bus.versionedType(SessionEvent.Compaction.Ended.type, 1) },
    ])
  }),
)

it.effect("compaction hooks can supply the summary instead of the model", () =>
  Effect.gen(function* () {
    requests = []
    const db = (yield* Database.Service).db
    const hooks = yield* PluginHooks.Service
    const store = yield* SessionStore.Service
    const sessionID = Session.ID.make("ses_hooked_compaction")
    const session = yield* insertSession(sessionID)
    const messages = [
      {
        id: SessionMessage.ID.create(),
        type: "user" as const,
        text: "Hooked compaction should see this conversation.",
        time: { created: DateTime.makeUnsafe(0) },
      },
    ]
    let contexts = 0
    yield* hooks.register("session", "context", () => Effect.sync(() => contexts++))
    yield* hooks.register("session", "compaction", (event) =>
      Effect.sync(() => {
        expect(event.sessionID).toBe(sessionID)
        expect(event.agent).toBe(Agent.defaultID)
        expect(JSON.stringify(event.messages)).toContain("Hooked compaction should see this conversation.")
        event.result = { summary: "## Objective\n- hooked summary" }
      }),
    )

    expect(yield* compactManually(session, messages, SessionMessage.ID.make("msg_hooked_compaction"))).toEqual({
      status: "completed",
    })

    expect(contexts).toBe(0)
    expect(requests).toEqual([])
    expect(yield* store.context(sessionID)).toMatchObject([
      { type: "compaction", reason: "manual", summary: "## Objective\n- hooked summary", recent: "" },
    ])
    expect(
      yield* db
        .select({ type: EventTable.type })
        .from(EventTable)
        .where(eq(EventTable.aggregate_id, sessionID))
        .orderBy(asc(EventTable.seq))
        .all()
        .pipe(Effect.orDie),
    ).toEqual([
      { type: Bus.versionedType(SessionEvent.Compaction.Started.type, 1) },
      { type: Bus.versionedType(SessionEvent.Compaction.Ended.type, 1) },
    ])
  }),
)

it.effect("native compaction fails without a model call on a route that cannot compact", () =>
  Effect.gen(function* () {
    requests = []
    const compaction = yield* SessionCompaction.Service
    const session = yield* insertSession(Session.ID.make("ses_native_unsupported"))
    const messages = [
      SessionMessage.User.make({
        id: SessionMessage.ID.create(),
        type: "user",
        text: "Compact this natively.",
        time: { created: DateTime.makeUnsafe(0) },
      }),
    ]
    expect(
      yield* compaction.compact({
        reason: "manual",
        context: { ...loaded(session, messages), model: { ...resolved, compaction: { type: "native" } } },
        inputID: SessionMessage.ID.create(),
      }),
    ).toEqual({
      status: "failed",
      error: {
        type: "provider.unsupported-operation",
        message: "Native compaction is not supported for test/openai-chat",
      },
    })
    expect(requests).toHaveLength(0)
  }),
)

it.effect("forked session compaction reuses the fork root prompt cache key", () =>
  Effect.gen(function* () {
    requests = []
    const sessionID = Session.ID.make("ses_fork_compaction")
    const rootID = Session.ID.make("ses_fork_compaction_root")
    const session = yield* insertSession(sessionID, {
      fork_session_id: rootID,
      fork_boundary: { type: "before", messageID: SessionMessage.ID.create() },
    })
    const messages = [
      SessionMessage.User.make({
        id: SessionMessage.ID.create(),
        type: "user",
        text: "Summarize the forked conversation.",
        time: { created: DateTime.makeUnsafe(0) },
      }),
    ]
    expect(yield* compactManually(session, messages, SessionMessage.ID.make("msg_fork_compaction"))).toEqual({
      status: "completed",
    })

    expect(requests).toHaveLength(1)
    expect(requests[0]?.promptCacheKey).toBe(rootID)
  }),
)

/** A user message with the given text. */
const turn = (text: string) =>
  SessionMessage.User.make({
    id: SessionMessage.ID.create(),
    type: "user",
    text,
    time: { created: DateTime.makeUnsafe(0) },
  })

/** An assistant text reply, optionally carrying the provider's own measurement of the request that produced it. */
const reply = (text: string, input?: number) =>
  Schema.decodeUnknownSync(SessionMessage.Assistant)({
    id: SessionMessage.ID.create(),
    type: "assistant",
    agent: Agent.defaultID,
    model: { id: "summary-model", providerID: "test" },
    content: [{ type: "text", text }],
    ...(input === undefined ? {} : { tokens: { input, output: 0, reasoning: 0, cache: { read: 0, write: 0 } } }),
    time: { created: 0, completed: 0 },
  })

/** An assistant reply whose one tool call completed with this result. */
const toolReply = (call: string, name: string, fileName: string, result: string) =>
  Schema.decodeUnknownSync(SessionMessage.Assistant)({
    id: SessionMessage.ID.create(),
    type: "assistant",
    agent: Agent.defaultID,
    model: { id: "summary-model", providerID: "test" },
    content: [
      {
        type: "tool",
        id: call,
        name,
        state: { status: "completed", input: { filePath: fileName }, content: [{ type: "text", text: result }] },
        time: { created: 0 },
      },
    ],
    time: { created: 0, completed: 0 },
  })

/**
 * J fixture 1. A long synthetic session crossing the automatic threshold: a design decision, the correction that
 * supersedes it, the reference path, an approval restriction, one completed local action and a pending task. The
 * summarizer is handed every one of them (nothing is dropped silently), the prompt says how to treat them, and the
 * newest user messages stay verbatim in the retained window.
 *
 * What this fixture does not prove: the wording a real summarizer model writes. The summary text here is the mock's,
 * so preservation is verified at the summarizer's input, the prompt's rules and the retention boundary.
 */
it.effect("J fixture 1: a session crossing the threshold keeps the correction, reference, restriction and pending work", () =>
  Effect.gen(function* () {
    requests = []
    const sessionID = Session.ID.make("ses_j1_long_session")
    const session = yield* insertSession(sessionID)
    const compaction = yield* SessionCompaction.Service
    const store = yield* SessionStore.Service
    const messages = [
      turn("Objective: rebuild the Aporetic shell as the real AN design."),
      reply("Decision: build the shell from the recovered design mockup.", 101_000),
      turn("Correction: use aporetic-an-exact-flow-v11-selfcontained.html, not replacement-concept-NOT-APPROVED.png."),
      toolReply("call_write_status", "write", "docs/an-rewrite/STATUS.md", "Wrote 42 lines to STATUS.md"),
      turn("Restriction: do not push to the remote and do not run aporia-update."),
      reply("Pending: add the J fixtures 1, 4 and 5."),
    ]
    const before = SessionCompaction.estimateContext(loaded(session, messages))
    expect(before).toBeGreaterThanOrEqual(100_000)

    expect(yield* compaction.compact({ reason: "auto", context: loaded(session, messages) })).toEqual({
      status: "completed",
    })

    expect(requests).toHaveLength(1)
    const sent = JSON.stringify(requests[0]?.messages)
    // The older part reaches the summarizer whole, with the completed action's own evidence.
    expect(sent).toContain("Decision: build the shell from the recovered design mockup.")
    expect(sent).toContain("use aporetic-an-exact-flow-v11-selfcontained.html")
    expect(sent).toContain("Wrote 42 lines to STATUS.md")
    // The prompt carries the two rules that keep a correction and a finished action from being lost or redone.
    expect(sent).toContain("superseded")
    expect(sent).toContain("does not repeat a completed action")
    // The newest exchange is not summarized: it is kept verbatim beside the summary, exactly once.
    expect(sent).not.toContain("do not push to the remote")

    const context = yield* store.context(sessionID)
    expect(context.filter((message) => message.type === "compaction")).toHaveLength(1)
    const after = SessionCompaction.estimateContext(loaded(session, context))
    expect(after).toBeLessThan(before)
    // The compacted context fits the working budget with the reply reserve held back.
    expect(after).toBeLessThanOrEqual(100_000)
    const checkpoint = context[0]
    if (checkpoint?.type !== "compaction" || checkpoint.status !== "completed")
      throw new Error("expected a completed checkpoint")
    expect(checkpoint.recent).toContain("Restriction: do not push to the remote and do not run aporia-update.")
    expect(checkpoint.recent).toContain("Pending: add the J fixtures 1, 4 and 5.")
    expect(checkpoint.recent).not.toContain("Decision: build the shell from the recovered design mockup.")
  }),
)

/**
 * J fixture 4. Accounting: provider tool schemas are part of the prompt size, the provider's own measurement and the
 * estimated tail are separate quantities, a large tool result plus an attached reference are counted, the compacted
 * context actually fits the budget, and the session's lifetime token total is a different number from the active
 * context (so it must never be printed as the current context size).
 */
it.effect("J fixture 4: tool schemas, tool output and attachments are accounted for and the compacted context fits", () =>
  Effect.gen(function* () {
    requests = []
    const sessionID = Session.ID.make("ses_j4_accounting")
    const session = yield* insertSession(sessionID)
    const compaction = yield* SessionCompaction.Service
    const store = yield* SessionStore.Service

    const description = "Read a file from disk."
    const inputSchema = {
      type: "object",
      properties: { filePath: { type: "string", description: "Absolute path to read." } },
      required: ["filePath"],
    }
    const definitions = [ToolDefinition.make({ name: "read", description, inputSchema })]
    const schemas = { definitions, execute: () => Effect.die("Compaction must not execute tools") }
    const overhead = Token.estimate("read" + description + JSON.stringify(inputSchema))
    expect(overhead).toBeGreaterThan(0)
    const withoutSchemas = SessionCompaction.estimateContext(loaded(session, []))
    expect(SessionCompaction.estimateContext({ ...loaded(session, []), tools: schemas }) - withoutSchemas).toBe(overhead)

    const attachment = Schema.decodeUnknownSync(SessionMessage.User)({
      id: SessionMessage.ID.create(),
      type: "user",
      text: "",
      files: [{ mime: "image/png", data: "a".repeat(2_000), source: { type: "inline" } }],
      time: { created: 0 },
    })
    const messages = [
      turn("Objective: rebuild the shell."),
      reply("Decision: keep the v11 mockup.", 101_000),
      toolReply("call_read_big", "read", "aporetic-an-exact-flow-v11-selfcontained.html", "x".repeat(1_250)),
      attachment,
    ]
    const context = { ...loaded(session, messages), tools: schemas }
    // The provider's count is the measurement; everything after it is estimated on top.
    expect(SessionCompaction.estimatePrompt(context).measured).toBe(101_000)
    expect(SessionCompaction.estimatePrompt(context).estimated).toBeGreaterThan(0)
    const before = SessionCompaction.estimateContext(context)
    expect(before).toBeGreaterThan(101_000)

    expect(yield* compaction.compact({ reason: "auto", context })).toEqual({ status: "completed" })
    const after = SessionCompaction.estimateContext({
      ...loaded(session, yield* store.context(sessionID)),
      tools: schemas,
    })
    expect(after).toBeLessThan(before)
    expect(after).toBeLessThanOrEqual(100_000)

    // The session row holds lifetime usage recorded from responses. It is not the active context, and the two must
    // not be confused when the UI prints a size.
    const spent = (yield* store.get(sessionID))?.tokens?.input ?? 0
    expect(spent).toBeGreaterThan(0)
    expect(spent).not.toBe(after)
  }),
)

/**
 * J fixture 5. Two successive compactions: the second update carries the first checkpoint once, does not re-send the
 * raw tool results that checkpoint already covers (no redundant retrieval), leaves exactly one checkpoint (no
 * exponential growth) and reclaims room both times without a storm of extra requests.
 */
it.effect("J fixture 5: successive compactions keep one checkpoint, drop covered history and stay in budget", () =>
  Effect.gen(function* () {
    requests = []
    const sessionID = Session.ID.make("ses_j5_successive")
    const session = yield* insertSession(sessionID)
    const compaction = yield* SessionCompaction.Service
    const store = yield* SessionStore.Service
    const first = [
      turn("Task A: rebuild the shell."),
      reply("Decision: keep the v11 mockup as the design reference.", 101_000),
      ...Array.from({ length: 60 }, (_, index) =>
        toolReply(`call_read_${index}`, "read", `call_read_${index}.txt`, "x".repeat(1_250)),
      ),
      turn("Keep the v11 mockup as the design reference."),
      reply("Pending: the fixtures."),
    ]
    const before1 = SessionCompaction.estimateContext(loaded(session, first))
    expect(before1).toBeGreaterThanOrEqual(100_000)
    expect(yield* compaction.compact({ reason: "auto", context: loaded(session, first) })).toEqual({
      status: "completed",
    })
    expect(requests).toHaveLength(1)

    const context1 = yield* store.context(sessionID)
    const after1 = SessionCompaction.estimateContext(loaded(session, context1))
    expect(after1).toBeLessThan(before1)
    // keep (15,000) plus the checkpoint's own summary and prompt overhead.
    expect(after1).toBeLessThanOrEqual(20_000)

    const second = [
      ...context1,
      turn("Also record the threshold and its units in STATUS."),
      reply("Progress: the fixtures are written.", 101_000),
    ]
    const before2 = SessionCompaction.estimateContext(loaded(session, second))
    expect(before2).toBeGreaterThanOrEqual(100_000)
    expect(yield* compaction.compact({ reason: "auto", context: loaded(session, second) })).toEqual({
      status: "completed",
    })
    expect(requests).toHaveLength(2)

    const update = JSON.stringify(requests[1]?.messages)
    // The previous checkpoint is the single record of the older work, and the raw results it covers are gone.
    expect(update.split("manual summary").length - 1).toBe(1)
    expect(update).not.toContain("call_read_0.txt")

    const context2 = yield* store.context(sessionID)
    expect(context2.filter((message) => message.type === "compaction")).toHaveLength(1)
    const after2 = SessionCompaction.estimateContext(loaded(session, context2))
    expect(after2).toBeLessThan(before2)
    expect(after2).toBeLessThanOrEqual(20_000)
  }),
)
