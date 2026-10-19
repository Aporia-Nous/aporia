import { describe, expect, test } from "bun:test"
import {
  attentionToApprovalCards,
  buildStreamCards,
  computerToCard,
  missionChromePills,
  permissionToApprovalCard,
  questionToDecisionCard,
  rosterToTeamCard,
  sessionToTaskCard,
} from "./map"
import { AN_CARD_TYPES, isAnCardType } from "./types"

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

  test("computer card stays honest idle without live feed", () => {
    const idle = computerToCard()
    expect(idle.type).toBe("computer")
    expect(idle.status).toBe("Idle")
    expect(idle.detail?.toLowerCase()).toContain("no live")
    expect(idle.actions?.[0]?.stub).toBe(true)
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
})
