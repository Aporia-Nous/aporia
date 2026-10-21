import { describe, expect, test } from "bun:test"
import type { SessionMessageInfo } from "@opencode/client/promise"
import { messagesToConversationTurns } from "./conversation-turns"

describe("messagesToConversationTurns", () => {
  test("maps user text and assistant text parts; skips empty and tools-only", () => {
    const messages = [
      {
        id: "usr_1",
        type: "user",
        time: { created: 1 },
        text: "  hello from Ali  ",
      },
      {
        id: "asst_1",
        type: "assistant",
        time: { created: 2 },
        agent: "build",
        model: { id: "test", providerID: "test" },
        content: [
          { type: "tool", id: "t1", name: "read", time: { created: 2 }, state: { status: "completed", input: {}, content: [{ type: "text", text: "ok" }] } },
          { type: "text", text: "Hi Ali — I see you." },
        ],
      },
      {
        id: "usr_empty",
        type: "user",
        time: { created: 3 },
        text: "   ",
      },
      {
        id: "asst_tools_only",
        type: "assistant",
        time: { created: 4, completed: 5 },
        agent: "build",
        model: { id: "test", providerID: "test" },
        content: [
          {
            type: "tool",
            id: "t2",
            name: "bash",
            time: { created: 4 },
            state: { status: "completed", input: { command: "ls" }, content: [{ type: "text", text: "." }] },
          },
        ],
      },
    ] as SessionMessageInfo[]

    const turns = messagesToConversationTurns(messages)
    expect(turns).toEqual([
      { id: "usr_1", role: "user", text: "hello from Ali" },
      {
        id: "asst_1",
        role: "assistant",
        text: "Hi Ali — I see you.",
        agent: "build",
        streaming: true,
      },
    ])
  })

  test("marks completed assistant as not streaming", () => {
    const messages = [
      {
        id: "asst_done",
        type: "assistant",
        time: { created: 1, completed: 2 },
        agent: "orion",
        model: { id: "test", providerID: "test" },
        content: [{ type: "text", text: "Done." }],
      },
    ] as SessionMessageInfo[]
    const turns = messagesToConversationTurns(messages)
    expect(turns[0]?.streaming).toBe(false)
    expect(turns[0]?.text).toBe("Done.")
  })
})
