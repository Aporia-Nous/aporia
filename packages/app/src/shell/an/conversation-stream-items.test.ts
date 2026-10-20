import { describe, expect, test } from "bun:test"
import type { SessionMessageInfo } from "@opencode/client/promise"
import {
  buildContextCards,
  buildConversationStreamItems,
  buildMissionStackCards,
  flattenStreamItems,
} from "./conversation-stream-items"

describe("AP-STAGE4-15 conversation stream items", () => {
  test("mission stack collapses empty when Conversation owns cards", () => {
    expect(buildMissionStackCards({ conversationOwnsCards: true })).toEqual([])
    expect(buildMissionStackCards()).toEqual([])
  })

  test("context cards omit wallpaper; include computer when relevant (AP-STAGE5-01)", () => {
    const idle = buildContextCards({
      roster: [{ id: "1", name: "Orion", role: "Lead", presence: "listening" }],
      session: { working: true, title: "Build", sessionID: "s1" },
      attention: [{ id: "a1", title: "Approve deploy" }],
      shellMode: "conversation",
    })
    expect(idle.map((c) => c.type)).toEqual(["task", "approval"])

    const live = buildContextCards({
      roster: [{ id: "1", name: "Orion", role: "Lead", presence: "listening" }],
      session: { working: true, title: "Build", sessionID: "s1" },
      attention: [{ id: "a1", title: "Approve deploy" }],
      shellMode: "conversation",
      computerLive: true,
      includeTeam: true,
    })
    expect(live.map((c) => c.type)).toEqual(["task", "approval", "computer", "team"])
    expect(live.find((c) => c.type === "computer")?.title).toBe("Computer")
  })

  test("interleaves turns with tool Task/Proof then context cards", () => {
    const messages = [
      {
        id: "usr_1",
        type: "user",
        time: { created: 1 },
        text: "edit the file",
      },
      {
        id: "asst_1",
        type: "assistant",
        time: { created: 2, completed: 3 },
        agent: "orion",
        model: { providerID: "test", modelID: "test" },
        content: [
          { type: "text", text: "Working on it." },
          {
            type: "tool",
            id: "edit1",
            name: "edit",
            time: { created: 2 },
            state: {
              status: "completed",
              input: { path: "src/a.ts" },
              content: [{ type: "text", text: "ok" }],
            },
          },
          {
            type: "tool",
            id: "read1",
            name: "read",
            time: { created: 2 },
            state: {
              status: "completed",
              input: { path: "x.ts" },
              content: [{ type: "text", text: "…" }],
            },
          },
        ],
      },
    ] as SessionMessageInfo[]

    const context = buildContextCards({
      roster: [{ id: "1", name: "Orion", role: "Lead", presence: "listening" }],
      computerLive: false,
      shellMode: "conversation",
    })
    const items = buildConversationStreamItems({ messages, contextCards: context })
    const kinds = items.map((i) => (i.kind === "turn" ? `turn:${i.turn.role}` : `card:${i.card.type}`))
    expect(kinds).toEqual(["turn:user", "turn:assistant", "card:proof"])
    expect(items.find((i) => i.kind === "card" && i.card.type === "proof")?.card.title).toContain(
      "src/a.ts",
    )
    const flat = flattenStreamItems(items)
    expect(flat.turns).toHaveLength(2)
    expect(flat.cards.some((c) => c.type === "proof")).toBe(true)
    expect(flat.cards.some((c) => c.type === "computer")).toBe(false)
  })

  test("empty idle session has no wallpaper computer+team cards (AP-STAGE5-01)", () => {
    const items = buildConversationStreamItems({
      messages: [],
      turns: [],
      contextCards: buildContextCards({
        roster: [{ id: "1", name: "Orion", role: "Lead", presence: "listening" }],
        shellMode: "conversation",
      }),
    })
    expect(items).toEqual([])
  })
})
