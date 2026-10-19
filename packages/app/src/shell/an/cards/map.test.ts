import { describe, expect, test } from "bun:test"
import type { SessionMessageAssistantTool, SessionMessageInfo } from "@opencode/client/promise"
import {
  attentionToApprovalCards,
  buildStreamCards,
  computerToCard,
  messageProofUnavailableCard,
  messagesToPartCards,
  missionChromePills,
  permissionToApprovalCard,
  questionToDecisionCard,
  rosterToTeamCard,
  sessionToTaskCard,
  toolPartToCard,
} from "./map"
import { AN_CARD_TYPES, isAnCardType } from "./types"

function tool(
  partial: Partial<SessionMessageAssistantTool> & {
    id: string
    name: string
    state: SessionMessageAssistantTool["state"]
  },
): SessionMessageAssistantTool {
  return {
    type: "tool",
    time: { created: 1 },
    ...partial,
  }
}

describe("AN card types", () => {
  test("approved six card types only", () => {
    expect([...AN_CARD_TYPES]).toEqual(["task", "approval", "decision", "proof", "computer", "team"])
    expect(isAnCardType("approval")).toBe(true)
    expect(isAnCardType("status")).toBe(false)
  })
})

describe("AN card mapping", () => {
  test("attention maps to Approval with stub actions", () => {
    const cards = attentionToApprovalCards([{ id: "a1", title: "Approve deploy", detail: "Needs you" }])
    expect(cards).toHaveLength(1)
    expect(cards[0]?.type).toBe("approval")
    expect(cards[0]?.title).toBe("Approve deploy")
    expect(cards[0]?.actions?.some((a) => a.stub)).toBe(true)
  })

  test("permission maps to Approval with live action ids", () => {
    const card = permissionToApprovalCard({
      id: "p1",
      action: "bash",
      resources: ["src/**"],
      description: "Run shell",
    })
    expect(card.type).toBe("approval")
    expect(card.actions?.map((a) => a.id)).toEqual(["reject", "always", "once"])
    expect(card.actions?.every((a) => !a.stub)).toBe(true)
  })

  test("question maps to Decision stub", () => {
    const card = questionToDecisionCard({ id: "q1", title: "Use one browser?" })
    expect(card.type).toBe("decision")
    expect(card.actions?.[0]?.stub).toBe(true)
  })

  test("task only when working; no invented progress", () => {
    expect(sessionToTaskCard({ working: false })).toBeUndefined()
    const task = sessionToTaskCard({ sessionID: "s1", title: "Build", working: true })
    expect(task?.type).toBe("task")
    expect(task?.progress).toBeUndefined()
  })

  test("computer card stays honest unavailable without live feed", () => {
    const idle = computerToCard()
    expect(idle.type).toBe("computer")
    expect(idle.title).toBe("Computer View")
    expect(idle.status).toBe("Unavailable")
    expect(idle.detail?.toLowerCase()).toContain("no live")
    expect(idle.actions?.[0]?.label).toBe("Computer View")
    expect(idle.actions?.[0]?.stub).toBe(true)
  })

  test("computer card reports watch-only feed when Live + feed active (AP-BF-02)", () => {
    const live = computerToCard({ live: true, feedActive: true })
    expect(live.status).toBe("Live")
    expect(live.detail?.toLowerCase()).toContain("watch-only")
    expect(live.detail?.toLowerCase()).toContain("overlay")
    expect(live.actions?.[0]?.stub).toBe(false)
  })

  test("computer card reports You control when Takeover holds lock (AP-BF-03)", () => {
    const takeover = computerToCard({ live: true, feedActive: true, userControl: true })
    expect(takeover.status).toBe("You control")
    expect(takeover.detail?.toLowerCase()).toContain("paused")
    expect(takeover.actions?.[0]?.stub).toBe(false)
  })

  test("team card from roster; empty roster omitted", () => {
    expect(rosterToTeamCard([])).toBeUndefined()
    const team = rosterToTeamCard([{ id: "orion", name: "Orion", role: "Lead", presence: "unknown" }])
    expect(team?.type).toBe("team")
    expect(team?.members).toHaveLength(1)
  })

  test("stream stack includes computer + mapped attention", () => {
    const cards = buildStreamCards({
      attention: [{ id: "a1", title: "Approve" }],
      roster: [{ id: "1", name: "Orion", role: "Lead", presence: "unknown" }],
      session: { working: true, title: "Mission" },
    })
    expect(cards.map((c) => c.type)).toEqual(["task", "approval", "computer", "team"])
  })

  test("mission pills mark Private/Efficient/Verified unavailable", () => {
    const pills = missionChromePills()
    expect(pills.some((p) => p.label === "Local" && p.tone === "ok")).toBe(true)
    expect(pills.filter((p) => p.label.includes("unavailable")).length).toBe(3)
    expect(JSON.stringify(pills)).not.toContain("Verified\"")
  })

  test("running tool maps to Task; completed edit maps to Proof", () => {
    const running = toolPartToCard(
      tool({
        id: "t1",
        name: "bash",
        state: { status: "running", input: { command: "ls" }, metadata: {} },
      }),
    )
    expect(running.type).toBe("task")
    expect(running.source).toBe("tool")
    expect(running.detail).toBe("ls")

    const proof = toolPartToCard(
      tool({
        id: "t2",
        name: "edit",
        state: {
          status: "completed",
          input: { path: "src/a.ts" },
          content: [{ type: "text", text: "ok" }],
        },
      }),
    )
    expect(proof.type).toBe("proof")
    expect(proof.source).toBe("edit")
    expect(proof.title).toContain("src/a.ts")
  })

  test("messagesToPartCards skips quiet completed reads; keeps active + edits", () => {
    const messages = [
      {
        id: "m1",
        type: "assistant",
        agent: "a",
        model: { id: "m", providerID: "p" },
        time: { created: 1 },
        content: [
          tool({
            id: "read1",
            name: "read",
            state: {
              status: "completed",
              input: { path: "x.ts" },
              content: [{ type: "text", text: "…" }],
            },
          }),
          tool({
            id: "edit1",
            name: "write",
            state: {
              status: "completed",
              input: { path: "y.ts" },
              content: [{ type: "text", text: "…" }],
            },
          }),
          tool({
            id: "run1",
            name: "bash",
            state: { status: "running", input: { command: "test" }, metadata: {} },
          }),
        ],
      },
    ] as SessionMessageInfo[]
    const cards = messagesToPartCards(messages)
    expect(cards.map((c) => c.id)).toEqual(["tool:run1", "tool:edit1"])
    expect(cards.find((c) => c.id === "tool:edit1")?.type).toBe("proof")
  })

  test("buildStreamCards can include honest Proof unavailable without inventing edits", () => {
    const stub = messageProofUnavailableCard()
    expect(stub.type).toBe("proof")
    expect(stub.status?.toLowerCase()).toContain("unavailable")
    const cards = buildStreamCards({
      roster: [{ id: "1", name: "Orion", role: "Lead", presence: "unknown" }],
      includeProofUnavailable: true,
    })
    expect(cards.some((c) => c.id === "proof:unavailable")).toBe(true)
    expect(cards.map((c) => c.type)).toContain("computer")
  })
})
