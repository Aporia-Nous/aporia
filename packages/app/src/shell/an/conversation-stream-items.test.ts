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

  test("context cards include computer + team without inventing tools", () => {
    const cards = buildContextCards({
      roster: [{ id: "1", name: "Orion", role: "Lead", presence: "listening" }],
      session: { working: true, title: "Build", sessionID: "s1" },
      attention: [{ id: "a1", title: "Approve deploy" }],
    })
    expect(cards.map((c) => c.type)).toEqual(["task", "approval", "computer", "team"])
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
    })
    const items = buildConversationStreamItems({ messages, contextCards: context })
    const kinds = items.map((i) => (i.kind === "turn" ? `turn:${i.turn.role}` : `card:${i.card.type}`))
    expect(kinds).toEqual([
      "turn:user",
      "turn:assistant",
      "card:proof",
      "card:computer",
      "card:team",
    ])
    expect(items.find((i) => i.kind === "card" && i.card.type === "proof")?.card.title).toContain(
      "src/a.ts",
    )
    const flat = flattenStreamItems(items)
    expect(flat.turns).toHaveLength(2)
    expect(flat.cards.some((c) => c.type === "proof")).toBe(true)
    expect(flat.cards.some((c) => c.type === "computer")).toBe(true)
  })

  test("empty session still places ambient computer+team in Conversation items", () => {
    const items = buildConversationStreamItems({
      messages: [],
      turns: [],
      contextCards: buildContextCards({
        roster: [{ id: "1", name: "Orion", role: "Lead", presence: "listening" }],
      }),
    })
    expect(items.every((i) => i.kind === "card")).toBe(true)
    expect(items.map((i) => (i.kind === "card" ? i.card.type : ""))).toEqual(["computer", "team"])
  })
})
