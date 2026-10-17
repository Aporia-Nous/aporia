#!/usr/bin/env bun
// Backfill the durable domain (bot/team/mission rows) from the file store.
//
//   bun run script/mission-backfill.ts --db C:\path\to\opencode-aporia-dev.db [--home %USERPROFILE%\Aporia] [--dry-run]
//
// Safety: the live store (`opencode-aporia.db`) is refused by name. Point this at a copy, take a
// backup first, and check the session/session_message counts printed before and after: the backfill
// never writes either table, so those two numbers must be identical.

import path from "path"
import fs from "fs/promises"
import os from "os"
import { Database as SQLite } from "bun:sqlite"
import { Effect } from "effect"
import { parseArgs } from "util"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { AppNodeBuilder } from "../src/effect/app-node-builder"
import { Database } from "../src/database/database.js"
import { Mission } from "../src/mission.js"
import * as Backfill from "../src/mission/backfill.js"

const args = parseArgs({
  args: process.argv.slice(2),
  options: {
    db: { type: "string" },
    home: { type: "string" },
    "dry-run": { type: "boolean" },
  },
})

const dbPath = args.values.db
if (!dbPath) {
  console.error("missing --db <path> (the development copy, never the live store)")
  process.exit(2)
}
const resolved = path.resolve(dbPath)
if (path.basename(resolved) === "opencode-aporia.db") {
  console.error(`refusing to backfill the live store: ${resolved}`)
  process.exit(2)
}
if (!(await Bun.file(resolved).exists())) {
  console.error(`no database at ${resolved}`)
  process.exit(2)
}
const home = path.resolve(args.values.home ?? path.join(os.homedir(), "Aporia"))

async function readJsonFiles<T>(directory: string, file: string): Promise<T[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => [])
  const out: T[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const target = path.join(directory, entry.name, file)
    const text = await Bun.file(target).text().catch(() => undefined)
    if (text === undefined) continue
    try {
      out.push(JSON.parse(text) as T)
    } catch (error) {
      console.warn(`skipping unreadable ${target}: ${error}`)
    }
  }
  return out.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
}

function counts() {
  // Read-only, separate from the app's connection: a migration is not allowed to disturb these.
  const db = new SQLite(resolved, { readonly: true })
  try {
    const one = (sql: string) => (db.query(sql).get() as { n: number }).n
    return {
      session: one("SELECT count(*) AS n FROM session_v2"),
      message: one("SELECT count(*) AS n FROM session_message"),
      bot: one("SELECT count(*) AS n FROM bot"),
      team: one("SELECT count(*) AS n FROM team"),
      mission: one("SELECT count(*) AS n FROM mission"),
    }
  } finally {
    db.close()
  }
}

const before = counts()
const bots = await readJsonFiles<Backfill.BotFile>(path.join(home, "bots"), "bot.json")
const rooms = await readJsonFiles<Backfill.RoomFile>(path.join(home, "rooms"), "room.json")
console.log(`files: ${bots.length} bots, ${rooms.length} rooms under ${home}`)

const layer = AppNodeBuilder.build(LayerNode.group([Database.node, Mission.node]), [
  Database.node.replace(Database.configured({ path: resolved })),
])

const program = Effect.gen(function* () {
  const mission = yield* Mission.Service
  const existing = {
    botSlugs: (yield* mission.listBots({ archived: true })).map((bot) => bot.slug),
    teamSlugs: (yield* mission.listTeams({ archived: true })).map((team) => team.slug),
    missionIds: (yield* mission.listMissions({ includeArchived: true })).map((row) => row.id),
  }
  const plan = Backfill.plan({ bots, rooms, existing })
  for (const warning of plan.warnings) console.warn(`warning: ${warning}`)
  console.log(
    `plan: ${plan.bots.length} bots, ${plan.teams.length} teams, ${plan.missions.length} missions, ` +
      `skipped ${plan.skipped.bots}/${plan.skipped.teams}/${plan.skipped.missions} (bot/team/mission)`,
  )
  console.log(
    `plan links ${Backfill.plannedSessionIds(plan).length} distinct sessions at most once each`,
  )
  if (args.values["dry-run"]) return { bots: 0, teams: 0, missions: 0, links: 0 }

  let createdBots = 0
  for (const seed of plan.bots) {
    const result = yield* mission.createBot(seed).pipe(
      Effect.catchTag("Mission.SlugTaken", () => Effect.succeed(undefined)),
    )
    if (result) createdBots += 1
  }

  let createdTeams = 0
  for (const seed of plan.teams) {
    const result = yield* mission.createTeam(seed).pipe(
      Effect.catchTag("Mission.SlugTaken", () => Effect.succeed(undefined)),
      Effect.catchTag("Mission.BotNotFound", (error) => Effect.sync(() => {
        console.warn(`team ${seed.slug} skipped: ${error.botID} is missing`)
        return undefined
      })),
    )
    if (result) createdTeams += 1
  }

  let createdMissions = 0
  let links = 0
  for (const seed of plan.missions) {
    // Sessions are attached one by one so each keeps its participant attribution.
    const created = yield* mission.createMission({ ...seed, sessionIds: [] }).pipe(
      Effect.catchTag("Mission.TeamNotFound", () => Effect.succeed(undefined)),
    )
    if (!created) continue
    createdMissions += 1
    for (const session of seed.sessions) {
      yield* mission.attachMissionSession(created.id, session.sessionId, session.participant)
      links += 1
    }
  }
  return { bots: createdBots, teams: createdTeams, missions: createdMissions, links }
})

const result = await Effect.runPromise(program.pipe(Effect.provide(layer)))
const after = counts()
console.log(`inserted: ${result.bots} bots, ${result.teams} teams, ${result.missions} missions, ${result.links} links`)
console.log(`before: ${JSON.stringify(before)}`)
console.log(`after:  ${JSON.stringify(after)}`)
const preserved = before.session === after.session && before.message === after.message
console.log(preserved ? "session/message counts unchanged" : "WARNING: session tables changed")
process.exit(preserved ? 0 : 3)
