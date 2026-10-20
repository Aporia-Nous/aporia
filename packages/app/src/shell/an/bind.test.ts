import { describe, expect, test } from "bun:test"
import type { SessionMessageInfo } from "@opencode/client/promise"
import {
  anShellMissionSwitchNote,
  attentionBindResult,
  attentionCardsToItems,
  botsToRoster,
  missionFromSession,
  resolveAnPresence,
  rosterBindResult,
  sessionActivityFromMessages,
} from "./bind"

describe("AN shell bind", () => {
  test("roster marks running agents thinking and known-idle teammates listening", () => {
    const roster = botsToRoster({
      bots: [
        { slug: "orion", name: "Orion", role: "Lead" },
        { slug: "mira", name: "Mira", role: "Research" },
      ],
      currentAgent: "aporia-orion",
      agentStatus: { "aporia-orion": "running", "aporia-mira": "idle" },
    })
    expect(roster).toHaveLength(2)
    expect(roster[0]?.presence).toBe("thinking")
    expect(roster[0]?.selected).toBe(true)
    expect(roster[1]?.presence).toBe("listening")
    expect(roster[1]?.selected).toBe(false)
  })

  test("roster maps tool activity to working and call listening when signaled", () => {
    const roster = botsToRoster({
      bots: [
        { slug: "orion", name: "Orion", role: "Lead" },
        { slug: "mira", name: "Mira", role: "Research" },
      ],
      currentAgent: "aporia-mira",
      agentSignals: {
        "aporia-orion": { sessionStatus: "running", activity: "tool" },
        "aporia-mira": { callState: "listening" },
      },
    })
    expect(roster[0]?.presence).toBe("working")
    expect(roster[1]?.presence).toBe("listening")
  })

  test("listed teammates without session signals are listening, not Unknown", () => {
    const roster = botsToRoster({
      bots: [
        { slug: "grok", name: "Grok", role: "Companion" },
        { slug: "orion", name: "Orion", role: "Lead" },
      ],
      currentAgent: "aporia-grok",
    })
    expect(roster[0]?.presence).toBe("listening")
    expect(roster[1]?.presence).toBe("listening")
  })

  test("resolveAnPresence priority: call > waiting > tool > stream > reasoning > busy > listening > unknown", () => {
    expect(resolveAnPresence({ callState: "speaking", sessionStatus: "running", activity: "tool" })).toBe(
      "speaking",
    )
    expect(resolveAnPresence({ callState: "connecting" })).toBe("thinking")
    expect(resolveAnPresence({ callState: "error" })).toBe("unknown")
    expect(resolveAnPresence({ awaitingUser: true, sessionStatus: "running" })).toBe("waiting")
    expect(resolveAnPresence({ sessionStatus: "running", activity: "tool" })).toBe("working")
    expect(resolveAnPresence({ sessionStatus: "running", activity: "stream" })).toBe("speaking")
    expect(resolveAnPresence({ sessionStatus: "running", activity: "reasoning" })).toBe("thinking")
    expect(resolveAnPresence({ sessionStatus: "running", activity: "none" })).toBe("thinking")
    expect(resolveAnPresence({ sessionStatus: "idle" })).toBe("listening")
    expect(resolveAnPresence({ sessionStatus: "ready" })).toBe("listening")
    expect(resolveAnPresence({ callState: "idle" })).toBe("listening")
    expect(resolveAnPresence({ known: true })).toBe("listening")
    expect(resolveAnPresence({})).toBe("unknown")
  })

  test("sessionActivityFromMessages reads tool/stream/reasoning without inventing", () => {
    const toolMsg = {
      type: "assistant",
      content: [{ type: "tool", id: "t1", name: "bash", state: { status: "running", input: {}, metadata: {} } }],
    } as unknown as SessionMessageInfo
    expect(sessionActivityFromMessages([toolMsg])).toBe("tool")

    const streamMsg = {
      type: "assistant",
      content: [{ type: "text", text: "Hello" }],
    } as unknown as SessionMessageInfo
    expect(sessionActivityFromMessages([streamMsg])).toBe("stream")

    const reasonMsg = {
      type: "assistant",
      content: [{ type: "reasoning", text: "...", time: { created: 1 } }],
    } as unknown as SessionMessageInfo
    expect(sessionActivityFromMessages([reasonMsg])).toBe("reasoning")

    const doneMsg = {
      type: "assistant",
      time: { created: 1, completed: 2 },
      content: [{ type: "text", text: "done" }],
    } as unknown as SessionMessageInfo
    expect(sessionActivityFromMessages([doneMsg])).toBe("none")
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
    expect(anShellMissionSwitchNote()).toContain("AP-STAGE4-B1")
    expect(anShellMissionSwitchNote()).toContain("per-session store")
  })
})
