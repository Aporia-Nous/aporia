import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { Effect } from "effect"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { AppNodeBuilder } from "../src/effect/app-node-builder"
import { Database } from "../src/database/database.js"
import { Mission } from "../src/mission.js"
import * as Backfill from "../src/mission/backfill.js"
import { testEffect } from "./lib/effect"

const it = testEffect(AppNodeBuilder.build(LayerNode.group([Database.node, Mission.node])))

const fileLayer = (file: string) =>
  AppNodeBuilder.build(LayerNode.group([Database.node, Mission.node]), [
    Database.node.replace(Database.configured({ path: file })),
  ])

const tempDb = Effect.gen(function* () {
  const directory = yield* Effect.promise(() => fs.mkdtemp(path.join(os.tmpdir(), "aporia-mission-")))
  return { directory, file: path.join(directory, "mission.db") }
})

const cleanup = (directory: string) =>
  Effect.promise(() => fs.rm(directory, { recursive: true, force: true, maxRetries: 5 }))

describe("mission domain", () => {
  it.effect("renaming a bot keeps its tasks resolving by id", () =>
    Effect.gen(function* () {
      const mission = yield* Mission.Service
      const bot = yield* mission.createBot({ name: "Alpha", role: "builder" })
      const unit = yield* mission.createMission({ title: "Ship stage 1" })
      const task = yield* mission.createTask({ missionId: unit.id, title: "write the tables", ownerId: bot.id })

      const renamed = yield* mission.updateBot(bot.id, { name: "Alpha Renamed" })
      expect(renamed.id).toBe(bot.id)
      expect(renamed.slug).toBe(bot.slug)
      expect(renamed.name).toBe("Alpha Renamed")

      // The slug is the immutable natural key, so lookups by slug and by task owner still work.
      const bySlug = yield* mission.getBotBySlug(bot.slug)
      expect(bySlug?.name).toBe("Alpha Renamed")
      const after = yield* mission.getTask(task.id)
      expect(after.ownerId).toBe(bot.id)
      expect(after.missionId).toBe(unit.id)
      expect(after.revision).toBe(1)
    }),
  )

  it.effect("archiving a bot with open work is refused until the work is reassigned", () =>
    Effect.gen(function* () {
      const mission = yield* Mission.Service
      const leaving = yield* mission.createBot({ name: "Leaving" })
      const staying = yield* mission.createBot({ name: "Staying" })
      const unit = yield* mission.createMission({ title: "Hand over" })
      const open = yield* mission.createTask({ missionId: unit.id, title: "pending work", ownerId: leaving.id })
      const reopened = yield* mission.createTask({ missionId: unit.id, title: "pending work, second pass", ownerId: leaving.id })
      // An inherited task can already be past revision 1: reopen this one so the two tasks differ.
      yield* mission.setTaskState(reopened.id, "verified")
      yield* mission.setTaskState(reopened.id, "pending")
      expect((yield* mission.getTask(reopened.id)).revision).toBe(2)

      const refusal = yield* Effect.flip(mission.archiveBot(leaving.id))
      expect(refusal._tag).toBe("Mission.BotHasOpenTasks")
      if (refusal._tag === "Mission.BotHasOpenTasks") {
        expect(refusal.botID).toBe(leaving.id)
        expect([...refusal.taskIDs].sort()).toEqual([open.id, reopened.id].sort())
      }
      // Nothing moved yet: the refusal is not a partial archive.
      const stillThere = yield* mission.getBot(leaving.id)
      expect(stillThere.time.archived).toBeUndefined()
      const untouched = yield* mission.getTask(open.id)
      expect(untouched.ownerId).toBe(leaving.id)
      expect(untouched.revision).toBe(1)
      const untouchedReopened = yield* mission.getTask(reopened.id)
      expect(untouchedReopened.ownerId).toBe(leaving.id)
      expect(untouchedReopened.revision).toBe(2)

      const archived = yield* mission.archiveBot(leaving.id, { reassignTo: staying.id })
      expect(archived.time.archived).toBeDefined()
      expect((yield* mission.listBots()).map((bot) => bot.id)).not.toContain(leaving.id)
      expect((yield* mission.listBots({ archived: true })).map((bot) => bot.id)).toContain(leaving.id)

      const moved = yield* mission.getTask(open.id)
      expect(moved.ownerId).toBe(staying.id)
      expect(moved.revision).toBe(2)
      // Per task, not one number for the set: the already-reopened task goes 2 -> 3, never back to 2.
      const movedReopened = yield* mission.getTask(reopened.id)
      expect(movedReopened.ownerId).toBe(staying.id)
      expect(movedReopened.revision).toBe(3)
      expect((yield* mission.openTasksForBot(leaving.id)).length).toBe(0)

      // A bot whose only work is terminal can be archived without a successor.
      const finished = yield* mission.createBot({ name: "Finished" })
      const done = yield* mission.createTask({ missionId: unit.id, title: "done work", ownerId: finished.id })
      yield* mission.setTaskState(done.id, "verified")
      const archivedFinished = yield* mission.archiveBot(finished.id)
      expect(archivedFinished.time.archived).toBeDefined()
    }),
  )

  it.effect("restarting over the same file restores bots, teams, missions, tasks and ui state", () =>
    Effect.gen(function* () {
      const { directory, file } = yield* tempDb
      try {
        const created = yield* Effect.gen(function* () {
          const mission = yield* Mission.Service
          const alpha = yield* mission.createBot({ name: "Alpha" })
          const beta = yield* mission.createBot({ name: "Beta" })
          const team = yield* mission.createTeam({
            name: "Build",
            members: [alpha.id, beta.id],
            coordinatorId: alpha.id,
          })
          const unit = yield* mission.createMission({ title: "Durable", teamId: team.id })
          const first = yield* mission.createTask({ missionId: unit.id, title: "first", ownerId: alpha.id })
          const second = yield* mission.createTask({ missionId: unit.id, title: "second", ownerId: beta.id })
          yield* mission.setTaskDependencies(second.id, [first.id])
          yield* mission.attachMissionSession(unit.id, "ses_reopen_me_1", alpha.slug)
          yield* mission.saveUIState({ missionId: unit.id, draft: "hello", selectedBotId: beta.id })
          return { alpha, beta, team, unit, first, second }
        }).pipe(Effect.provide(fileLayer(file), { local: true }))

        // A second, independent connection to the same file is the restart: nothing is cached in memory.
        const restored = yield* Effect.gen(function* () {
          const mission = yield* Mission.Service
          return {
            bots: yield* mission.listBots(),
            teams: yield* mission.listTeams(),
            missions: yield* mission.listMissions(),
            tasks: yield* mission.listTasks(),
            ui: yield* mission.getUIState(created.unit.id),
          }
        }).pipe(Effect.provide(fileLayer(file), { local: true }))

        expect(restored.bots.map((bot) => bot.name).sort()).toEqual(["Alpha", "Beta"])
        expect(restored.teams.map((team) => team.id)).toEqual([created.team.id])
        expect(restored.teams[0]!.members).toEqual([created.alpha.id, created.beta.id])
        expect(restored.teams[0]!.coordinatorId).toBe(created.alpha.id)
        expect(restored.missions.map((unit) => unit.id)).toEqual([created.unit.id])
        expect(restored.missions[0]!.sessionIds.join(",")).toBe("ses_reopen_me_1")
        expect(restored.tasks.map((task) => task.id).sort()).toEqual([created.first.id, created.second.id].sort())
        expect(restored.tasks.find((task) => task.id === created.second.id)!.dependsOn).toEqual([created.first.id])
        expect(restored.ui?.draft).toBe("hello")
        expect(restored.ui?.selectedBotId).toBe(created.beta.id)
      } finally {
        yield* cleanup(directory)
      }
    }),
  )

  it.effect("linking a mission to a session writes only the link table", () =>
    Effect.gen(function* () {
      const mission = yield* Mission.Service
      const db = (yield* Database.Service).db
      const count = (table: string) =>
        db.get<{ n: number }>(`SELECT count(*) AS n FROM ${table}`).pipe(Effect.map((row) => row?.n ?? -1))

      const unit = yield* mission.createMission({ title: "Link only" })
      const sessionBefore = yield* count("session_v2")
      const messageBefore = yield* count("session_message")

      yield* mission.attachMissionSession(unit.id, "ses_link_only_1", "alpha")
      // Attaching twice is idempotent, not a duplicate link.
      const twice = yield* mission.attachMissionSession(unit.id, "ses_link_only_1", "alpha")
      expect(twice.sessionIds.join(",")).toBe("ses_link_only_1")

      expect(yield* count("session_v2")).toBe(sessionBefore)
      expect(yield* count("session_message")).toBe(messageBefore)
      const detached = yield* mission.detachMissionSession(unit.id, "ses_link_only_1")
      expect(detached.sessionIds).toEqual([])
    }),
  )

  it.effect("task dependencies refuse cycles and cross-mission links", () =>
    Effect.gen(function* () {
      const mission = yield* Mission.Service
      const one = yield* mission.createMission({ title: "one" })
      const two = yield* mission.createMission({ title: "two" })
      const a = yield* mission.createTask({ missionId: one.id, title: "a" })
      const b = yield* mission.createTask({ missionId: one.id, title: "b" })
      const other = yield* mission.createTask({ missionId: two.id, title: "other" })

      yield* mission.setTaskDependencies(b.id, [a.id])
      const cycle = yield* Effect.flip(mission.setTaskDependencies(a.id, [b.id]))
      expect(cycle._tag).toBe("Mission.Link")
      const crossMission = yield* Effect.flip(mission.setTaskDependencies(a.id, [other.id]))
      expect(crossMission._tag).toBe("Mission.Link")
      const self = yield* Effect.flip(mission.setTaskDependencies(a.id, [a.id]))
      expect(self._tag).toBe("Mission.Link")
      expect((yield* mission.getTask(a.id)).dependsOn).toEqual([])
    }),
  )

  it.effect("reopening a terminal task bumps its revision; ordinary state moves do not", () =>
    Effect.gen(function* () {
      const mission = yield* Mission.Service
      const unit = yield* mission.createMission({ title: "revisions" })
      const task = yield* mission.createTask({ missionId: unit.id, title: "work" })
      expect(task.revision).toBe(1)
      expect((yield* mission.setTaskState(task.id, "in_progress")).revision).toBe(1)
      expect((yield* mission.setTaskState(task.id, "verified")).revision).toBe(1)
      expect((yield* mission.setTaskState(task.id, "in_progress")).revision).toBe(2)
    }),
  )
})

describe("backfill planner", () => {
  const bots: Backfill.BotFile[] = [
    { slug: "alpha", name: "Alpha", role: "builder", model: "deepseek/deepseek-flash", scopes: ["bot", "user"] },
    { slug: "beta", name: "Beta", kind: "expert" },
  ]
  const rooms: Backfill.RoomFile[] = [
    {
      slug: "war-room",
      name: "War Room",
      members: ["alpha", "beta", "ghost"],
      sessions: { alpha: "ses_room_alpha", beta: "ses_room_beta" },
    },
  ]

  test("derives stable ids from the slug so a rerun is a no-op", () => {
    const first = Backfill.plan({ bots, rooms })
    expect(first.bots.map((bot) => bot.id).join(",")).toBe("bot_alpha,bot_beta")
    expect(first.teams.map((team) => team.id).join(",")).toBe("team_war-room")
    expect(first.missions.map((unit) => unit.id).join(",")).toBe("mis_room_war-room")
    // An unknown member is dropped with a warning instead of failing the whole migration.
    expect(first.teams[0]!.members.join(",")).toBe("bot_alpha,bot_beta")
    expect(first.warnings.join("\n")).toContain("ghost")
    expect(first.missions[0]!.sessions).toEqual([
      { sessionId: "ses_room_alpha", participant: "alpha" },
      { sessionId: "ses_room_beta", participant: "beta" },
    ])

    const second = Backfill.plan({
      bots,
      rooms,
      existing: {
        botSlugs: first.bots.map((bot) => bot.slug),
        teamSlugs: first.teams.map((team) => team.slug),
        missionIds: first.missions.map((unit) => unit.id),
      },
    })
    expect(second.bots).toEqual([])
    expect(second.teams).toEqual([])
    expect(second.missions).toEqual([])
    expect(second.skipped).toEqual({ bots: 2, teams: 1, missions: 1 })
  })

  test("skips malformed and duplicate files instead of throwing", () => {
    const plan = Backfill.plan({
      bots: [{ slug: "Alpha Upper" }, { slug: "alpha", name: "Alpha" }, { slug: "alpha", name: "Again" }],
      rooms: [{ slug: "../escape", name: "bad" }],
    })
    expect(plan.bots.map((bot) => bot.slug)).toEqual(["alpha"])
    expect(plan.teams).toEqual([])
    expect(plan.warnings.length).toBeGreaterThanOrEqual(3)
  })

  it.effect("applied twice to a real database inserts rows once", () =>
    Effect.gen(function* () {
      const { directory, file } = yield* tempDb
      try {
        const apply = () =>
          Effect.gen(function* () {
            const mission = yield* Mission.Service
            const plan = Backfill.plan({
              bots,
              rooms,
              existing: {
                botSlugs: (yield* mission.listBots({ archived: true })).map((bot) => bot.slug),
                teamSlugs: (yield* mission.listTeams({ archived: true })).map((team) => team.slug),
                missionIds: (yield* mission.listMissions({ includeArchived: true })).map((unit) => unit.id),
              },
            })
            for (const seed of plan.bots) yield* mission.createBot(seed)
            for (const seed of plan.teams) yield* mission.createTeam(seed)
            for (const seed of plan.missions) {
              const created = yield* mission.createMission({ ...seed, sessionIds: [] })
              for (const session of seed.sessions)
                yield* mission.attachMissionSession(created.id, session.sessionId, session.participant)
            }
            return {
              bots: (yield* mission.listBots({ archived: true })).length,
              teams: (yield* mission.listTeams({ archived: true })).length,
              missions: (yield* mission.listMissions({ includeArchived: true })).length,
            }
          }).pipe(Effect.provide(fileLayer(file), { local: true }))
        expect(yield* apply()).toEqual({ bots: 2, teams: 1, missions: 1 })
        expect(yield* apply()).toEqual({ bots: 2, teams: 1, missions: 1 })
      } finally {
        yield* cleanup(directory)
      }
    }),
  )
})
