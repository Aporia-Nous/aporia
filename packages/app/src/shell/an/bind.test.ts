import { describe, expect, test } from "bun:test"
import {
  anShellMissionSwitchNote,
  attentionBindResult,
  attentionCardsToItems,
  botsToRoster,
  missionFromSession,
  rosterBindResult,
} from "./bind"

describe("AN shell bind", () => {
  test("roster marks running agents working and others unknown", () => {
    const roster = botsToRoster({
      bots: [
        { slug: "orion", name: "Orion", role: "Lead" },
        { slug: "mira", name: "Mira", role: "Research" },
      ],
      currentAgent: "aporia-orion",
      agentStatus: { "aporia-orion": "running", "aporia-mira": "idle" },
    })
    expect(roster).toHaveLength(2)
    expect(roster[0]?.presence).toBe("working")
    expect(roster[0]?.selected).toBe(true)
    expect(roster[1]?.presence).toBe("unknown")
    expect(roster[1]?.selected).toBe(false)
  })

  test("roster unavailable stays empty with honest reason", () => {
    const result = rosterBindResult({ available: false, bots: [{ slug: "x", name: "X", role: "R" }] })
    expect(result.roster).toEqual([])
    expect(result.emptyReason).toContain("unavailable")
  })

  test("attention maps real cards only", () => {
    const items = attentionCardsToItems([{ id: "c1", title: "Approve deploy", body: "Needs you" }])
    expect(items).toEqual([{ id: "c1", title: "Approve deploy", detail: "Needs you", kind: "approval" }])
  })

  test("attention unavailable and empty messages stay honest", () => {
    expect(attentionBindResult({ available: false, cards: [] }).emptyMessage).toContain("unavailable")
    expect(attentionBindResult({ available: true, error: "timeout", cards: [] }).emptyMessage).toContain("timeout")
    expect(attentionBindResult({ available: true, cards: [] }).emptyMessage).toBe("No blockers right now.")
  })

  test("mission header omits invented progress; chrome pills stay honest", () => {
    const mission = missionFromSession({
      title: "Ship Stage 4",
      agent: "build",
      directory: "C:\\\\work\\\\aporetic",
      working: true,
    })
    expect(mission.title).toBe("Ship Stage 4")
    expect(mission.subtitle).toContain("build")
    expect(mission.progressPercent).toBeUndefined()
    expect(mission.pills?.[0]?.label).toBe("Working")
    expect(mission.pills?.some((p) => p.label === "Local")).toBe(true)
    expect(mission.pills?.filter((p) => p.label.includes("unavailable")).length).toBe(3)
  })

  test("mission-switch survival stays on existing app patterns", () => {
    expect(anShellMissionSwitchNote()).toContain("ComposerPersistenceProvider")
  })
})
