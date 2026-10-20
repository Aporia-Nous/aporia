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
  resolveComputerCardDensity,
  rosterToTeamCard,
  sessionToTaskCard,
  shouldIncludeComputerStreamCard,
  shouldIncludeTeamStreamCard,
  isQuietComputerEntry,
  isBotUsingComputer,
  userAskedComputerFromMessages,
  detectTeamHandoff,
  teamHandoffToCard,
  shouldSurfaceToolCard,
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

  test("computer card titled Computer — never Computer View (AP-STAGE5-01)", () => {
    const idle = computerToCard()
    expect(idle.type).toBe("computer")
    expect(idle.title).toBe("Computer")
    expect(idle.title).not.toBe("Computer View")
    expect(idle.status).toBe("Unavailable")
    expect(idle.detail?.toLowerCase()).toContain("no live")
    expect(idle.eventDensity).toBe("status")
    expect(idle.actions?.[0]?.label).toBe("Open in Computer View")
    expect(idle.actions?.[0]?.stub).toBeFalsy()
    expect(idle.actions?.some((a) => a.id === "take-control")).toBe(false)
  })

  test("computer card reports watch-only feed when Live + feed active (AP-BF-02 / STAGE5-03 Inline)", () => {
    const live = computerToCard({ live: true, feedActive: true, feedUrl: "https://example.test/" })
    expect(live.status).toBe("Live")
    expect(live.eventDensity).toBe("inline")
    expect(live.detail?.toLowerCase()).toContain("inline")
    expect(live.previewKind).toBe("url")
    expect(live.previewUrl).toBe("https://example.test/")
    expect(live.actions?.[0]?.stub).toBeFalsy()
    expect(live.actions?.find((a) => a.id === "take-control")?.label).toBe("Take control")
    expect(live.actions?.find((a) => a.id === "take-control")?.stub).toBeFalsy()
  })

  test("computer card reports You control when Takeover holds lock (AP-BF-03)", () => {
    const takeover = computerToCard({ live: true, feedActive: true, userControl: true })
    expect(takeover.status).toBe("You control")
    expect(takeover.detail?.toLowerCase()).toContain("paused")
    expect(takeover.actions?.[0]?.stub).toBeFalsy()
    expect(takeover.actions?.find((a) => a.id === "take-control")?.stub).toBe(true)
  })

  test("Status vs Inline densities (AP-STAGE5-03)", () => {
    expect(resolveComputerCardDensity()).toBe("status")
    expect(resolveComputerCardDensity({ live: true })).toBe("status")
    expect(resolveComputerCardDensity({ live: true, feedActive: true })).toBe("inline")

    const statusOffer = computerToCard({ attachPhase: "consenting" })
    expect(statusOffer.eventDensity).toBe("status")
    expect(statusOffer.id).toBe("computer:status")
    expect(statusOffer.meta).toBe("Status")
    expect(statusOffer.previewKind).toBe("none")

    const statusLive = computerToCard({ live: true, feedActive: false })
    expect(statusLive.eventDensity).toBe("status")

    const inlineSrcdoc = computerToCard({ live: true, feedActive: true, feedSrcdoc: "<html></html>" })
    expect(inlineSrcdoc.eventDensity).toBe("inline")
    expect(inlineSrcdoc.id).toBe("computer:inline")
    expect(inlineSrcdoc.previewKind).toBe("srcdoc")
    expect(inlineSrcdoc.actions?.map((a) => a.id)).toEqual(["view", "take-control"])

    const stream = buildStreamCards({
      shellMode: "conversation",
      computerLive: true,
      computerFeedActive: true,
      computerFeedUrl: "https://example.test/app",
    })
    const computer = stream.find((c) => c.type === "computer")
    expect(computer?.eventDensity).toBe("inline")
    expect(computer?.previewUrl).toBe("https://example.test/app")
  })

  test("team card from roster; empty roster omitted", () => {
    expect(rosterToTeamCard([])).toBeUndefined()
    const team = rosterToTeamCard([{ id: "orion", name: "Orion", role: "Lead", presence: "unknown" }])
    expect(team?.type).toBe("team")
    expect(team?.members).toHaveLength(1)
  })

  test("stream stack omits wallpaper computer+team; includes relevant computer", () => {
    const idle = buildStreamCards({
      attention: [{ id: "a1", title: "Approve" }],
      roster: [{ id: "1", name: "Orion", role: "Lead", presence: "unknown" }],
      session: { working: true, title: "Mission" },
      shellMode: "conversation",
    })
    expect(idle.map((c) => c.type)).toEqual(["task", "approval"])

    const live = buildStreamCards({
      attention: [{ id: "a1", title: "Approve" }],
      roster: [{ id: "1", name: "Orion", role: "Lead", presence: "unknown" }],
      session: { working: true, title: "Mission" },
      shellMode: "conversation",
      computerLive: true,
      computerFeedActive: true,
    })
    expect(live.map((c) => c.type)).toEqual(["task", "approval", "computer"])
    expect(live.find((c) => c.type === "computer")?.title).toBe("Computer")

    const view = buildStreamCards({
      shellMode: "view",
      computerLive: true,
      computerFeedActive: true,
      includeTeam: true,
      roster: [{ id: "1", name: "Orion", role: "Lead", presence: "unknown" }],
    })
    expect(view.map((c) => c.type)).toEqual(["team"])
  })

  test("shouldIncludeComputerStreamCard follows Option C residency", () => {
    expect(shouldIncludeComputerStreamCard({ shellMode: "conversation" })).toBe(false)
    expect(shouldIncludeComputerStreamCard({ shellMode: "conversation", live: true })).toBe(true)
    expect(shouldIncludeComputerStreamCard({ shellMode: "view", live: true })).toBe(false)
    expect(shouldIncludeComputerStreamCard({ shellMode: "takeover", live: true })).toBe(false)
    expect(shouldIncludeComputerStreamCard({ shellMode: "conversation", quietEntry: true })).toBe(true)
  })

  test("quietEntry covers attach offer / bot using / user asked (AP-STAGE5-02)", () => {
    expect(isQuietComputerEntry()).toBe(false)
    expect(isQuietComputerEntry({ attachPhase: "disconnected" })).toBe(false)
    expect(isQuietComputerEntry({ attachPhase: "consenting" })).toBe(true)
    expect(isQuietComputerEntry({ botUsingComputer: true })).toBe(true)
    expect(isQuietComputerEntry({ userAskedComputer: true })).toBe(true)

    expect(isBotUsingComputer({ live: true, controller: "bot" })).toBe(true)
    expect(isBotUsingComputer({ live: true, controller: "user" })).toBe(false)
    expect(isBotUsingComputer({ live: false, controller: "bot" })).toBe(false)

    const asked = [
      { id: "u1", type: "user", time: { created: 1 }, text: "Please open Computer View and watch the browser" },
    ] as SessionMessageInfo[]
    expect(userAskedComputerFromMessages(asked)).toBe(true)
    expect(userAskedComputerFromMessages([{ id: "u2", type: "user", time: { created: 1 }, text: "hello" }] as SessionMessageInfo[])).toBe(
      false,
    )

    const offer = buildStreamCards({
      shellMode: "conversation",
      computerAttachPhase: "consenting",
    })
    expect(offer.map((c) => c.type)).toEqual(["computer"])
    expect(offer[0]?.status).toBe("Attach offer")
    expect(offer[0]?.title).toBe("Computer")

    const askedCards = buildStreamCards({
      shellMode: "conversation",
      messages: asked,
    })
    expect(askedCards.some((c) => c.type === "computer")).toBe(true)

    const viewOffer = buildStreamCards({
      shellMode: "view",
      computerAttachPhase: "consenting",
    })
    expect(viewOffer.some((c) => c.type === "computer")).toBe(false)
  })

  test("Team card only on real agent handoff (AP-STAGE5-02)", () => {
    expect(shouldIncludeTeamStreamCard()).toBe(false)
    expect(shouldIncludeTeamStreamCard({ includeTeam: true })).toBe(true)
    expect(shouldIncludeTeamStreamCard({ teamHandoff: true })).toBe(true)

    const noSwitch = [
      { id: "a1", type: "assistant", time: { created: 1, completed: 2 }, agent: "orion", model: { providerID: "t", modelID: "t" }, content: [{ type: "text", text: "hi" }] },
      { id: "a2", type: "assistant", time: { created: 3, completed: 4 }, agent: "orion", model: { providerID: "t", modelID: "t" }, content: [{ type: "text", text: "still me" }] },
    ] as SessionMessageInfo[]
    expect(detectTeamHandoff(noSwitch)).toBeUndefined()

    const switched = [
      { id: "a1", type: "assistant", time: { created: 1, completed: 2 }, agent: "orion", model: { providerID: "t", modelID: "t" }, content: [{ type: "text", text: "hi" }] },
      { id: "a2", type: "assistant", time: { created: 3, completed: 4 }, agent: "nova", model: { providerID: "t", modelID: "t" }, content: [{ type: "text", text: "taking over" }] },
    ] as SessionMessageInfo[]
    const handoff = detectTeamHandoff(switched)
    expect(handoff).toEqual({ fromAgent: "orion", toAgent: "nova" })

    const roster = [
      { id: "orion", name: "Orion", role: "Lead", presence: "listening" as const },
      { id: "nova", name: "Nova", role: "Dev", presence: "thinking" as const },
    ]
    const card = teamHandoffToCard(handoff!, roster)
    expect(card.title).toBe("Team handoff")
    expect(card.detail).toBe("Orion → Nova")
    expect(card.status).toBe("Handoff")

    const idle = buildStreamCards({
      shellMode: "conversation",
      roster,
      messages: noSwitch,
    })
    expect(idle.some((c) => c.type === "team")).toBe(false)

    const withHandoff = buildStreamCards({
      shellMode: "conversation",
      roster,
      messages: switched,
    })
    expect(withHandoff.some((c) => c.type === "team")).toBe(true)
    expect(withHandoff.find((c) => c.type === "team")?.title).toBe("Team handoff")
  })

  test("mission pills mark Private/Efficient/Verified unavailable", () => {
    const pills = missionChromePills()
    expect(pills.some((p) => p.label === "Local" && p.tone === "ok")).toBe(true)
    expect(pills.filter((p) => p.label.includes("unavailable")).length).toBe(3)
    expect(JSON.stringify(pills)).not.toContain("Verified\"")
  })

  test("shouldSurfaceToolCard keeps active tools and edits; skips quiet reads", () => {
    expect(
      shouldSurfaceToolCard(
        tool({
          id: "r1",
          name: "read",
          state: {
            status: "completed",
            input: { path: "x" },
            content: [{ type: "text", text: "…" }],
          },
        }),
      ),
    ).toBe(false)
    expect(
      shouldSurfaceToolCard(
        tool({
          id: "b1",
          name: "bash",
          state: { status: "running", input: {}, metadata: {} },
        }),
      ),
    ).toBe(true)
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
      shellMode: "conversation",
      computerLive: true,
    })
    expect(cards.some((c) => c.id === "proof:unavailable")).toBe(true)
    expect(cards.map((c) => c.type)).toContain("computer")
    expect(cards.find((c) => c.type === "computer")?.title).toBe("Computer")
  })
})
