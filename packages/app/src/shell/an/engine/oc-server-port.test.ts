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
}): { data: OcServerData; promptCalls: PromptAdmission[] } {
  const promptCalls: PromptAdmission[] = []
  const sessions = opts?.sessions ?? []
  const messages = opts?.messages ?? {}
  const status = opts?.status ?? {}
  const permissions = opts?.permissions ?? {}

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
  } as unknown as OcServerData

  return { data, promptCalls }
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
    const unsub = engine.subscribe?.((e) => events.push(e.type))
    await engine.prompt({ sessionID: "ses_1", text: "x", id: "m1" })
    unsub?.()
    expect(events).toContain("messages.changed")
    expect(events).toContain("status.changed")
  })
})
