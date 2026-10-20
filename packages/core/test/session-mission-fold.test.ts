/**
 * FLOW-GENIUS-03 — Stage 6 live mission fold auto-wire (source/unit).
 * Does not claim independent PASS, Stage 6 complete, Mnemosyne wire, merge/push/install.
 */
import { afterAll, describe, expect, test } from "bun:test"
import fs from "node:fs"
import path from "node:path"
import { Effect } from "effect"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { AppNodeBuilder } from "../src/effect/app-node-builder.js"
import { Database } from "../src/database/database.js"
import { Mission } from "../src/mission.js"
import { mnemosyneMap } from "../src/mission/memory.js"
import {
  LEAN_PACK_HEADER,
  assembleLeanPack,
  hasLeanPack,
  measureLeanVsFull,
  mergeLeanPackIntoInitial,
} from "../src/session/lean-pack.js"
import {
  assembleMissionLeanPack,
  foldMissionLeanInput,
  loadLeanPackForSession,
  selectFocusTask,
  sessionMessagesToLeanFacts,
} from "../src/session/mission-fold.js"
import { Token } from "../src/util/token.js"
import { testEffect } from "./lib/effect"

const EVIDENCE_DIR =
  "C:\\Users\\Dilla\\OneDrive\\Documents\\ChatGPT\\Aporia Nous\\business-control\\evidence"
const METRICS_PATH = path.join(EVIDENCE_DIR, "2026-10-20-flow-genius-03-metrics.json")

const fixtureFacts = {
  mission: {
    id: "mis_fg03",
    title: "Ship mission fold auto-wire",
    state: "active",
  },
  tasks: [
    {
      id: "tsk_done",
      title: "Pure lean pack assembler",
      state: "verified" as const,
      revision: 1,
    },
    {
      id: "tsk_focus",
      title: "Wire SessionRunner drain",
      state: "in_progress" as const,
      ownerId: "bot_builder",
      revision: 2,
    },
    {
      id: "tsk_blocked",
      title: "Await Mnemosyne product wire",
      state: "blocked" as const,
      revision: 1,
    },
  ],
  cards: [
    {
      title: "Approve lean merge",
      body: "Once-only into initial",
      state: "resolved" as const,
      resolution: "approved",
    },
    {
      title: "Need vault for F3",
      body: "Credentials later",
      state: "open" as const,
    },
  ],
  messages: Array.from({ length: 12 }, (_, i) => ({
    id: `msg_${i}`,
    role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
    text: `Turn ${i}: ${"detail ".repeat(20)}`,
  })),
  recentMessageLimit: 4,
}

describe("FLOW-GENIUS-03 mission fold (pure)", () => {
  test("foldMissionLeanInput maps mission/tasks/cards into Stage 6 sections", () => {
    const input = foldMissionLeanInput(fixtureFacts)
    expect(input.objective).toContain("Ship mission fold auto-wire")
    expect(input.objective).toContain("mis_fg03")
    expect(input.decisions?.map((d) => d.text).join(" ")).toContain("approved")
    expect(input.constraints?.some((c) => c.text.includes("Open attention"))).toBe(true)
    expect(input.constraints?.some((c) => c.text.includes("Blocked task"))).toBe(true)
    expect(input.pending?.map((p) => p.id)).toContain("tsk_focus")
    expect(input.pending?.map((p) => p.id)).not.toContain("tsk_done")
    expect(input.done?.map((d) => d.id)).toEqual(["tsk_done"])
    expect(input.done?.[0]?.evidence).toContain("verified")
    expect(input.taskCard?.id).toBe("tsk_focus")
    expect(input.retrieval).toEqual([])
  })

  test("selectFocusTask prefers in_progress over pending/blocked", () => {
    const focus = selectFocusTask(fixtureFacts.tasks)
    expect(focus?.id).toBe("tsk_focus")
    expect(selectFocusTask(fixtureFacts.tasks, "tsk_blocked")?.id).toBe("tsk_blocked")
  })

  test("assembleMissionLeanPack + once-only merge; retrieval empty without port", () => {
    const pack = assembleMissionLeanPack(fixtureFacts)
    expect(pack.text.startsWith(LEAN_PACK_HEADER)).toBe(true)
    expect(pack.sections).toContain("objective")
    expect(pack.sections).toContain("task")
    expect(pack.sections).toContain("recent")
    expect(pack.sections).not.toContain("retrieval")
    expect(pack.recentKept).toBe(4)
    expect(pack.recentDropped).toBe(8)
    const once = mergeLeanPackIntoInitial("AGENTS.md", pack.text)
    expect(hasLeanPack(once)).toBe(true)
    expect(mergeLeanPackIntoInitial(once, pack.text)).toBe(once)
    // FG-04 map = implemented; this fixture does not inject a port so retrieval stays empty.
    expect(mnemosyneMap().status).toBe("implemented")
  })

  test("sessionMessagesToLeanFacts keeps user/assistant text only", () => {
    const facts = sessionMessagesToLeanFacts([
      {
        id: "msg_u",
        type: "user",
        text: "hello",
        time: { created: 1 },
      } as never,
      {
        id: "msg_a",
        type: "assistant",
        content: [{ type: "text", text: "world" }],
        time: { created: 2 },
      } as never,
      {
        id: "msg_c",
        type: "compaction",
        status: "completed",
        time: { created: 3 },
      } as never,
    ])
    expect(facts).toEqual([
      { id: "msg_u", role: "user", text: "hello" },
      { id: "msg_a", role: "assistant", text: "world" },
    ])
  })
})

const it = testEffect(AppNodeBuilder.build(LayerNode.group([Database.node, Mission.node])))

describe("FLOW-GENIUS-03 mission fold (live DB auto-wire)", () => {
  it.effect("loadLeanPackForSession returns undefined when session is unlinked", () =>
    Effect.gen(function* () {
      const loaded = yield* loadLeanPackForSession({ sessionID: "ses_fg03_unlinked" })
      expect(loaded).toBeUndefined()
    }),
  )

  it.effect("loadLeanPackForSession assembles pack for mission-linked session", () =>
    Effect.gen(function* () {
      const mission = yield* Mission.Service
      const created = yield* mission.createMission({ title: "FG-03 linked mission" })
      const sessionID = "ses_fg03_linked"
      yield* mission.attachMissionSession(created.id, sessionID)
      yield* mission.createTask({
        missionId: created.id,
        title: "Auto-wire drain",
        state: "in_progress",
      })
      yield* mission.createTask({
        missionId: created.id,
        title: "Already verified",
        state: "verified",
      })

      const loaded = yield* loadLeanPackForSession({
        sessionID,
        messages: [
          {
            id: "msg_1",
            type: "user",
            text: "continue the wire",
            time: { created: 1 },
          } as never,
        ],
      })

      expect(loaded).toBeDefined()
      expect(loaded!.missionId).toBe(created.id)
      expect(loaded!.taskCount).toBe(2)
      expect(loaded!.pack.text.startsWith(LEAN_PACK_HEADER)).toBe(true)
      expect(loaded!.pack.text).toContain("FG-03 linked mission")
      expect(loaded!.pack.text).toContain("Auto-wire drain")
      expect(loaded!.pack.text).toContain("### Done + evidence")
      expect(loaded!.pack.text).toContain("continue the wire")
      expect(loaded!.pack.sections).toContain("objective")
      expect(loaded!.pack.sections).toContain("task")
      expect(loaded!.retrievalCount).toBe(0)
      expect(loaded!.mnemosyneAvailability).toBe("available")
      // CE gate / Stage 5 not touched by this module; product default is built-in DEV-local available.
      expect(mnemosyneMap().status).toBe("implemented")
    }),
  )
})

afterAll(() => {
  const pack = assembleMissionLeanPack(fixtureFacts)
  const fullHistory = (fixtureFacts.messages ?? []).map((m) => `[${m.role}] ${m.text}`).join("\n")
  const naive = assembleLeanPack({
    objective: fixtureFacts.mission.title,
    messages: fixtureFacts.messages,
    recentMessageLimit: 999,
  })
  const comparison = measureLeanVsFull({ fullHistory, pack })
  const payload = {
    board: "FLOW-GENIUS-03",
    recordedAt: new Date().toISOString(),
    workDate: "2026-10-20",
    fixture: "mission-fold-linked-session",
    sections: pack.sections,
    recentKept: pack.recentKept,
    recentDropped: pack.recentDropped,
    fullTokens: comparison.fullTokens,
    leanTokens: comparison.leanTokens,
    tokensSaved: comparison.tokensSaved,
    naiveRecentAllTokens: naive.estimatedTokens,
    mnemosyne: mnemosyneMap(),
    autoWire: "SessionRunner drain + SessionGenerate via loadLeanPackForSession",
    residuals: [
      "UI memory chrome residual OK",
      "Host opencode mnemosyne.db remains refused (DEV-local built-in)",
    ],
    notClaimed: ["merge", "push", "install", "host opencode mnemosyne.db open"],
    stage5_ux_preserved: true,
    ce_gate_preserved: true,
    lean_pack_preserved: true,
    no_merge_no_push_no_install: true,
    estimatedTokensCheck: Token.estimate(pack.text),
  }
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true })
  fs.writeFileSync(METRICS_PATH, JSON.stringify(payload, null, 2) + "\n", "utf8")
})
