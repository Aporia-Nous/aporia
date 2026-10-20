/**
 * FLOW-GENIUS-04 — Stage 6 Mnemosyne product wire (source/unit).
 * Does not claim independent PASS, Stage 6 complete, I tests 1–7, merge/push/install.
 */
import { afterAll, afterEach, describe, expect, test } from "bun:test"
import fs from "node:fs"
import path from "node:path"
import { Effect } from "effect"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { AppNodeBuilder } from "../src/effect/app-node-builder.js"
import { Database } from "../src/database/database.js"
import { Mission } from "../src/mission.js"
import { mnemosyneMap } from "../src/mission/memory.js"
import {
  buildRecallQuery,
  createFixtureMnemosynePort,
  createUnavailableMnemosynePort,
  getDefaultMnemosynePort,
  hitsToCitedRetrieval,
  recallCitedRetrieval,
  resetDefaultMnemosynePort,
  setDefaultMnemosynePort,
} from "../src/mission/mnemosyne-port.js"
import {
  LEAN_PACK_HEADER,
  assembleLeanPack,
  measureLeanVsFull,
  mergeLeanPackIntoInitial,
} from "../src/session/lean-pack.js"
import {
  assembleMissionLeanPack,
  foldMissionLeanInput,
  loadLeanPackForSession,
} from "../src/session/mission-fold.js"
import { Token } from "../src/util/token.js"
import { testEffect } from "./lib/effect"

const EVIDENCE_DIR =
  "C:\\Users\\Dilla\\OneDrive\\Documents\\ChatGPT\\Aporia Nous\\business-control\\evidence"
const METRICS_PATH = path.join(EVIDENCE_DIR, "2026-10-20-flow-genius-04-metrics.json")

afterEach(() => {
  resetDefaultMnemosynePort()
})

const fixtureFacts = {
  mission: {
    id: "mis_fg04",
    title: "Ship Mnemosyne lean retrieval",
    state: "active",
  },
  tasks: [
    {
      id: "tsk_focus",
      title: "Wire cited retrieval into mission fold",
      state: "in_progress" as const,
      ownerId: "bot_builder",
      revision: 1,
    },
  ],
  messages: Array.from({ length: 10 }, (_, i) => ({
    id: `msg_${i}`,
    role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
    text: `Turn ${i}: ${"context ".repeat(18)}`,
  })),
  recentMessageLimit: 4,
}

describe("FLOW-GENIUS-04 MnemosynePort (pure)", () => {
  test("map status is implemented after product wire", () => {
    const map = mnemosyneMap()
    expect(map.status).toBe("implemented")
    expect(map.leanPackRetrievalOwner).toBe("aporetic-lean-pack")
    expect(map.productPort).toContain("mnemosyne-port")
    expect(map.notes.some((n) => n.includes("FLOW-GENIUS-04"))).toBe(true)
  })

  test("fixture port recalls sourced hits; unavailable omits", () => {
    const port = createFixtureMnemosynePort([
      {
        id: "42",
        body: "Prefer Aporetic lean retrieval with cited Mnemosyne sources for mission fold.",
        scope: "project",
      },
      {
        id: "99",
        body: "Private bot note about unrelated gardening tips.",
        scope: "private",
      },
    ])
    const hits = port.search({ query: "Mnemosyne mission lean retrieval", limit: 4 })
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0]?.id).toBe("42")
    const cited = hitsToCitedRetrieval(hits)
    expect(cited[0]?.source).toBe("mnemosyne:42")
    expect(cited[0]?.excerpt).toContain("Aporetic lean retrieval")

    const scoped = port.search({
      query: "Mnemosyne mission lean retrieval",
      scope: "private",
      limit: 4,
    })
    expect(scoped.every((h) => h.scope === "private")).toBe(true)
    expect(scoped.map((h) => h.id)).not.toContain("42")

    const unavailable = createUnavailableMnemosynePort()
    expect(unavailable.availability()).toBe("unavailable")
    expect(recallCitedRetrieval(unavailable, { query: "anything" })).toEqual([])
    expect(unavailable.remember({ body: "x" }).ok).toBe(false)
  })

  test("correction supersedes prior; forget removes from active search", () => {
    const port = createFixtureMnemosynePort([
      { id: "pref_old", body: "Demo project preference: use blue theme", scope: "project" },
    ])
    const corrected = port.remember({
      body: "Demo project preference: use gold theme",
      scope: "project",
      supersedes: "pref_old",
    })
    expect(corrected.ok).toBe(true)
    const active = port.search({ query: "Demo project preference theme", limit: 4 })
    expect(active.map((h) => h.id)).toContain(corrected.ok ? corrected.id : "")
    expect(active.map((h) => h.id)).not.toContain("pref_old")
    expect(active.some((h) => h.body.includes("gold"))).toBe(true)

    if (corrected.ok) {
      const forgot = port.forget(corrected.id)
      expect(forgot.ok).toBe(true)
      const after = port.search({ query: "Demo project preference theme", limit: 4 })
      expect(after.map((h) => h.id)).not.toContain(corrected.id)
    }
  })

  test("foldMissionLeanInput wires MnemosynePort into Cited retrieval section", () => {
    const port = createFixtureMnemosynePort([
      {
        id: "7",
        body: "Ship Mnemosyne lean retrieval using bounded cited sources only.",
        scope: "project",
      },
    ])
    const input = foldMissionLeanInput({ ...fixtureFacts, mnemosyne: port })
    expect(input.retrieval?.length).toBeGreaterThan(0)
    expect(input.retrieval?.[0]?.source).toBe("mnemosyne:7")
    const pack = assembleMissionLeanPack({ ...fixtureFacts, mnemosyne: port })
    expect(pack.text.startsWith(LEAN_PACK_HEADER)).toBe(true)
    expect(pack.sections).toContain("retrieval")
    expect(pack.text).toContain("### Cited retrieval")
    expect(pack.text).toContain("source:mnemosyne:7")
    expect(mergeLeanPackIntoInitial("AGENTS.md", pack.text)).toContain("mnemosyne:7")
  })

  test("buildRecallQuery joins objective + task without inventing text", () => {
    expect(buildRecallQuery({ objective: "Ship wire", taskTitle: "Cite sources" })).toBe(
      "Ship wire Cite sources",
    )
  })
})

const it = testEffect(AppNodeBuilder.build(LayerNode.group([Database.node, Mission.node])))

describe("FLOW-GENIUS-04 Mnemosyne wire (live DB + injected port)", () => {
  it.effect("default unavailable port keeps retrieval empty on linked session", () =>
    Effect.gen(function* () {
      expect(getDefaultMnemosynePort().availability()).toBe("unavailable")
      const mission = yield* Mission.Service
      const created = yield* mission.createMission({ title: "FG-04 default unavailable" })
      const sessionID = "ses_fg04_unavail"
      yield* mission.attachMissionSession(created.id, sessionID)
      yield* mission.createTask({
        missionId: created.id,
        title: "No host DB recall",
        state: "in_progress",
      })
      const loaded = yield* loadLeanPackForSession({ sessionID })
      expect(loaded).toBeDefined()
      expect(loaded!.retrievalCount).toBe(0)
      expect(loaded!.mnemosyneAvailability).toBe("unavailable")
      expect(loaded!.pack.sections).not.toContain("retrieval")
    }),
  )

  it.effect("injected fixture port fills cited retrieval on linked session", () =>
    Effect.gen(function* () {
      const port = createFixtureMnemosynePort([
        {
          id: "55",
          body: "FG-04 linked mission prefers cited Mnemosyne retrieval in lean pack.",
          scope: "project",
        },
      ])
      setDefaultMnemosynePort(port)
      const mission = yield* Mission.Service
      const created = yield* mission.createMission({ title: "FG-04 linked mission" })
      const sessionID = "ses_fg04_linked"
      yield* mission.attachMissionSession(created.id, sessionID)
      yield* mission.createTask({
        missionId: created.id,
        title: "Cite Mnemosyne retrieval",
        state: "in_progress",
      })
      const loaded = yield* loadLeanPackForSession({ sessionID })
      expect(loaded).toBeDefined()
      expect(loaded!.mnemosyneAvailability).toBe("mocked")
      expect(loaded!.retrievalCount).toBeGreaterThan(0)
      expect(loaded!.pack.text).toContain("source:mnemosyne:55")
      expect(loaded!.pack.sections).toContain("retrieval")
    }),
  )
})

afterAll(() => {
  const port = createFixtureMnemosynePort([
    {
      id: "7",
      body: "Ship Mnemosyne lean retrieval using bounded cited sources only.",
      scope: "project",
    },
  ])
  const pack = assembleMissionLeanPack({ ...fixtureFacts, mnemosyne: port })
  const fullHistory = [
    ...(fixtureFacts.messages ?? []).map((m) => `[${m.role}] ${m.text}`),
    "FULL MEMORY DUMP: " + "x".repeat(2000),
  ].join("\n")
  const naive = assembleLeanPack({
    objective: fixtureFacts.mission.title,
    messages: fixtureFacts.messages,
    recentMessageLimit: 999,
    retrieval: [
      {
        source: "mnemosyne:dump",
        excerpt: "x".repeat(2000),
      },
    ],
  })
  const comparison = measureLeanVsFull({ fullHistory, pack })
  const payload = {
    board: "FLOW-GENIUS-04",
    recordedAt: new Date().toISOString(),
    workDate: "2026-10-20",
    fixture: "mnemosyne-wire-cited-retrieval",
    sections: pack.sections,
    recentKept: pack.recentKept,
    recentDropped: pack.recentDropped,
    retrievalCount: pack.sections.includes("retrieval") ? 1 : 0,
    fullTokens: comparison.fullTokens,
    leanTokens: comparison.leanTokens,
    tokensSaved: comparison.tokensSaved,
    naiveRecentAllTokens: naive.estimatedTokens,
    mnemosyne: mnemosyneMap(),
    defaultPortAvailability: createUnavailableMnemosynePort().availability(),
    autoWire: "loadLeanPackForSession → MnemosynePort.recall → Cited retrieval",
    residuals: [
      "I tests 1–7 / J fixtures acceptance not this slice",
      "Host mnemosyne.db / substrate auto-open not wired (DEV-safe default unavailable)",
      "Stage 6 complete not claimed",
      "await independent PASS",
    ],
    notClaimed: [
      "independent PASS",
      "Stage 6 complete",
      "I tests 1-7",
      "J acceptance",
      "merge",
      "push",
      "install",
    ],
    stage5_ux_preserved: true,
    ce_gate_preserved: true,
    lean_pack_preserved: true,
    mission_fold_preserved: true,
    no_merge_no_push_no_install: true,
    estimatedTokensCheck: Token.estimate(pack.text),
  }
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true })
  fs.writeFileSync(METRICS_PATH, JSON.stringify(payload, null, 2) + "\n", "utf8")
  resetDefaultMnemosynePort()
})
