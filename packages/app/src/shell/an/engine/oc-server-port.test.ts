import { describe, expect, test } from "bun:test"
import type { SessionInfo, SessionMessageInfo } from "@opencode/client/promise"
import { buildConversationStreamItems } from "../conversation-stream-items"
import { messagesToConversationTurns } from "../conversation-turns"
import { createOcServerEnginePort, type OcServerData } from "./oc-server-port"
import type { PromptAdmission } from "./types"

function mockData(opts?: {
  sessions?: SessionInfo[]
  messages?: Record<string, SessionMessageInfo[]>
  status?: Record<string, string>
  permissions?: Record<string, unknown[]>
  providers?: Array<{ id: string; name: string; integrationID?: string }>
  models?: Array<{
    id: string
    name: string
    providerID: string
    status?: string
    cost?: Array<{ input?: number; output?: number }>
  }>
}): {
  data: OcServerData
  promptCalls: PromptAdmission[]
  syncCalls: string[]
} {
  const promptCalls: PromptAdmission[] = []
  const syncCalls: string[] = []
  const sessions = opts?.sessions ?? []
  const messages = opts?.messages ?? {}
  const status = opts?.status ?? {}
  const permissions = opts?.permissions ?? {}
  const providers = opts?.providers ?? []
  const models = opts?.models ?? []

  const data = {
    session: {
      list: () => sessions,
      status: (id: string) => status[id],
      create: (input: { id?: string; agent?: string; location?: { directory: string } }) => {
        const id = input.id ?? "ses_new"
        const info = {
          id,
          agent: input.agent,
          location: input.location ?? { directory: "/tmp" },
          time: { created: 1, updated: 1 },
        } as SessionInfo
        sessions.push(info)
        return { id, request: Promise.resolve(info) }
      },
      prompt: async (admission: PromptAdmission) => {
        promptCalls.push(admission)
        const list = messages[admission.sessionID] ?? (messages[admission.sessionID] = [])
        list.push({
          id: String(admission.id ?? `msg_${list.length}`),
          type: "user",
          time: { created: Date.now() },
          text: admission.text,
        } as SessionMessageInfo)
        return { ok: true }
      },
      message: {
        list: (sessionID: string) => messages[sessionID] ?? [],
      },
      permission: {
        list: (sessionID: string) => permissions[sessionID] ?? [],
      },
    },
    location: {
      provider: {
        list: () => providers,
        sync: async () => {
          syncCalls.push("provider")
        },
        invalidate: () => undefined,
      },
      model: {
        list: () => models,
        sync: async () => {
          syncCalls.push("model")
        },
        invalidate: () => undefined,
      },
    },
  } as unknown as OcServerData

  return { data, promptCalls, syncCalls }
}

describe("AP-ENGINE-PORT-01 OcServerEnginePort", () => {
  test("prompt delegates once to data.session.prompt", async () => {
    const { data, promptCalls } = mockData()
    const engine = createOcServerEnginePort(data)
    const admission = {
      sessionID: "ses_1",
      id: "msg_a",
      text: "hello from AnShell",
      delivery: "steer" as const,
    }

    await engine.prompt(admission)

    expect(promptCalls).toHaveLength(1)
    expect(promptCalls[0]).toMatchObject({ sessionID: "ses_1", text: "hello from AnShell", id: "msg_a" })
  })

  test("AP-CE-02 gated slash skips session.prompt (modelTokens 0)", async () => {
    const { data, promptCalls } = mockData()
    const starts: Array<{ flowId: string; trigger: string }> = []
    const engine = createOcServerEnginePort(data, {
      contraptions: {
        registeredIds: () => ["greet", "fetch-shape"],
        start: async (start) => {
          starts.push({ flowId: start.flowId, trigger: start.trigger })
          expect(start.expectedModelTokens).toBe(0)
          return { runId: "cor_test_1", created: true }
        },
      },
    })

    const result = (await engine.prompt({
      sessionID: "ses_1",
      id: "msg_gate",
      text: '/greet {"who":"ali"}',
    })) as { mechanical?: boolean; modelTokens?: number; flowId?: string }

    expect(promptCalls).toHaveLength(0)
    expect(starts).toEqual([{ flowId: "greet", trigger: "slash" }])
    expect(result).toMatchObject({ mechanical: true, modelTokens: 0, flowId: "greet", runId: "cor_test_1" })
  })

  test("AP-CE-02 chat still hits session.prompt when gate present", async () => {
    const { data, promptCalls } = mockData()
    let flowCalls = 0
    const engine = createOcServerEnginePort(data, {
      contraptions: {
        registeredIds: () => ["greet"],
        start: async () => {
          flowCalls += 1
          return { runId: "x", created: true }
        },
      },
    })
    await engine.prompt({ sessionID: "ses_1", id: "msg_chat", text: "refactor the auth module" })
    expect(promptCalls).toHaveLength(1)
    expect(flowCalls).toBe(0)
  })

  test("listMessages + stream items build from port messages (YOU turn)", () => {
    const { data } = mockData({
      messages: {
        ses_1: [
          {
            id: "msg_u",
            type: "user",
            time: { created: 1 },
            text: "ping",
          } as SessionMessageInfo,
          {
            id: "msg_a",
            type: "assistant",
            time: { created: 2, completed: 3 },
            agent: "an",
            model: { providerID: "test", modelID: "test" },
            content: [{ type: "text", text: "pong" }],
          } as SessionMessageInfo,
        ],
      },
    })
    const engine = createOcServerEnginePort(data)
    const msgs = engine.listMessages("ses_1")
    expect(msgs).toHaveLength(2)

    const turns = messagesToConversationTurns(msgs)
    expect(turns.some((t) => t.role === "user" && t.text.includes("ping"))).toBe(true)

    const items = buildConversationStreamItems({
      messages: msgs,
      turns,
      contextCards: [],
    })
    const roles = items.filter((i) => i.kind === "turn").map((i) => i.turn.role)
    expect(roles).toContain("user")
    expect(roles).toContain("assistant")
  })

  test("listSessions / createSession / sessionStatus / listPermissions delegate", async () => {
    const existing = {
      id: "ses_old",
      agent: "build",
      location: { directory: "/a" },
      time: { created: 1, updated: 1 },
    } as SessionInfo
    const { data } = mockData({
      sessions: [existing],
      status: { ses_old: "running" },
      permissions: { ses_old: [{ id: "p1" }] },
    })
    const engine = createOcServerEnginePort(data)

    expect(engine.listSessions().map((s) => s.id)).toEqual(["ses_old"])
    expect(engine.sessionStatus("ses_old")).toBe("running")
    expect(engine.listPermissions("ses_old")).toEqual([{ id: "p1" }])

    const created = engine.createSession({ agent: "an", directory: "/bots/orion", id: "ses_new" })
    expect(created.id).toBe("ses_new")
    await created.request
    expect(engine.listSessions().map((s) => s.id)).toContain("ses_new")
  })

  test("subscribe receives messages.changed after prompt", async () => {
    const { data } = mockData()
    const engine = createOcServerEnginePort(data)
    const events: string[] = []
    const unsub = engine.subscribe((e) => events.push(e.type))
    await engine.prompt({ sessionID: "ses_1", text: "x", id: "m1" })
    unsub()
    expect(events).toContain("messages.changed")
    expect(events).toContain("status.changed")
  })
})

describe("AP-ENGINE-PORT-03 OcServerEnginePort event shrink", () => {
  test("observeServerEvent forwards coarse session events; skips deltas", () => {
    const { data } = mockData()
    const engine = createOcServerEnginePort(data)
    const events: Array<{ type: string; sessionID?: string }> = []
    const unsub = engine.subscribe((e) =>
      events.push({ type: e.type, sessionID: "sessionID" in e ? e.sessionID : undefined }),
    )
    engine.observeServerEvent?.({ type: "session.text.delta", data: { sessionID: "ses_1" } })
    engine.observeServerEvent?.({ type: "session.text.ended", data: { sessionID: "ses_1" } })
    engine.observeServerEvent?.({ type: "session.execution.started", data: { sessionID: "ses_1" } })
    engine.observeServerEvent?.({ type: "project.updated", data: {} })
    unsub()
    expect(events.filter((e) => e.type === "messages.changed").map((e) => e.sessionID)).toEqual(["ses_1"])
    expect(events.filter((e) => e.type === "status.changed").map((e) => e.sessionID)).toEqual(["ses_1"])
  })
})

describe("AP-ENGINE-PORT-02 OcServerEnginePort settings", () => {
  test("listProviders / listModels classify free vs BYOK and count models", () => {
    const { data } = mockData({
      providers: [
        { id: "opencode", name: "OpenCode" },
        { id: "openai", name: "OpenAI" },
        { id: "ollama", name: "Ollama" },
      ],
      models: [
        { id: "free-1", name: "Free One", providerID: "opencode", cost: [{ input: 0, output: 0 }] },
        { id: "gpt", name: "GPT", providerID: "openai", cost: [{ input: 1, output: 2 }] },
        { id: "local", name: "Local", providerID: "ollama", cost: [{ input: 0, output: 0 }] },
        { id: "old", name: "Old", providerID: "openai", status: "deprecated" },
      ],
    })
    const engine = createOcServerEnginePort(data)
    const providers = engine.listProviders()
    expect(providers.find((p) => p.id === "opencode")?.path).toBe("free")
    expect(providers.find((p) => p.id === "openai")?.path).toBe("byok")
    expect(providers.find((p) => p.id === "ollama")?.path).toBe("local")
    expect(providers.find((p) => p.id === "openai")?.modelCount).toBe(1)

    const openaiModels = engine.listModels({ providerID: "openai" })
    expect(openaiModels).toHaveLength(1)
    expect(openaiModels[0]?.free).toBe(false)

    const freeModels = engine.listModels({ providerID: "opencode" })
    expect(freeModels[0]?.free).toBe(true)
  })

  test("connectByok requires key + wired connectKey; syncCatalog refreshes", async () => {
    const { data, syncCalls } = mockData({
      providers: [{ id: "openai", name: "OpenAI" }],
      models: [],
    })
    const connects: Array<{ providerID: string; key: string }> = []
    const engine = createOcServerEnginePort(data, {
      connectKey: async (input) => {
        connects.push({ providerID: input.providerID, key: input.key })
      },
    })

    await expect(engine.connectByok!({ providerID: "openai", key: "  " })).rejects.toThrow(/API key/)
    await engine.connectByok!({ providerID: "openai", key: " sk-test " })
    expect(connects).toEqual([{ providerID: "openai", key: "sk-test" }])
    expect(syncCalls).toContain("provider")
    expect(syncCalls).toContain("model")

    const bare = createOcServerEnginePort(data)
    await expect(bare.connectByok!({ providerID: "openai", key: "x" })).rejects.toThrow(/unavailable/)
  })
})
