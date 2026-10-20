// Adapter from the file store (bots/<slug>/bot.json, rooms/<slug>/room.json) to the durable
// domain rows. The planner is pure: it reads parsed files and a snapshot of what the database
// already holds, and returns the rows to insert. The runner (script/mission-backfill.ts) owns I/O.
//
// Two properties matter more than completeness:
//   * Idempotent. Ids derive from the slug (`bot_<slug>`, `team_<slug>`, `mis_room_<slug>`) and the
//     runner inserts with ON CONFLICT DO NOTHING, so running the backfill twice adds no rows and
//     never overwrites an edit made in the app.
//   * Lossless where it counts. A room's per-member session map is preserved as one mission per
//     room, with each member's session attached and attributed. Per-bot chat sessions are left
//     alone: they stay reachable as sessions, they are simply not promoted to missions yet.

import { MissionSchema } from "./schema.js"
import { DEFAULT_BOT_MODEL } from "./service.js"

type BotID = MissionSchema.BotID
type TeamID = MissionSchema.TeamID
type MissionID = MissionSchema.MissionID

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/u

/** The fields of a `bot.json` the backfill understands. Unknown fields are ignored. */
export interface BotFile {
  readonly slug?: string
  readonly name?: string
  readonly role?: string
  readonly avatar?: string
  readonly instructions?: string
  readonly model?: string
  readonly tools?: ReadonlyArray<string>
  readonly mcps?: ReadonlyArray<string>
  readonly skills?: ReadonlyArray<string>
  readonly voice?: string
  readonly scopes?: ReadonlyArray<string>
  readonly kind?: string
}

/** The fields of a `room.json` the backfill understands. */
export interface RoomFile {
  readonly slug?: string
  readonly name?: string
  readonly members?: ReadonlyArray<string>
  readonly sessions?: Readonly<Record<string, string>>
}

/** What the database already holds, so a rerun can report skips instead of failing on conflicts. */
export interface Existing {
  readonly botSlugs?: ReadonlyArray<string>
  readonly teamSlugs?: ReadonlyArray<string>
  readonly missionIds?: ReadonlyArray<string>
}

export interface BotSeed extends MissionSchema.CreateBotInput {
  readonly id: BotID
  readonly slug: string
}

export interface TeamSeed extends MissionSchema.CreateTeamInput {
  readonly id: TeamID
  readonly slug: string
  readonly members: ReadonlyArray<BotID>
}

export interface MissionSeed extends MissionSchema.CreateMissionInput {
  readonly id: MissionID
  readonly sessions: ReadonlyArray<{ readonly sessionId: string; readonly participant?: string }>
}

export interface BackfillPlan {
  readonly bots: ReadonlyArray<BotSeed>
  readonly teams: ReadonlyArray<TeamSeed>
  readonly missions: ReadonlyArray<MissionSeed>
  readonly skipped: { readonly bots: number; readonly teams: number; readonly missions: number }
  readonly warnings: ReadonlyArray<string>
}

const slugOf = (value: string | undefined) => (value !== undefined && SLUG.test(value) ? value : undefined)

/**
 * Map parsed files to rows. Pure and total: malformed entries become warnings, never throws, so a
 * single bad `bot.json` cannot stop the migration of everything else.
 */
export function plan(input: {
  readonly bots?: ReadonlyArray<BotFile>
  readonly rooms?: ReadonlyArray<RoomFile>
  readonly existing?: Existing
}): BackfillPlan {
  const warnings: string[] = []
  const existingBots = new Set(input.existing?.botSlugs ?? [])
  const existingTeams = new Set(input.existing?.teamSlugs ?? [])
  const existingMissions = new Set(input.existing?.missionIds ?? [])

  const botSeeds: BotSeed[] = []
  const seenBots = new Set<string>()
  let skippedBots = 0
  for (const file of input.bots ?? []) {
    const slug = slugOf(file.slug)
    if (slug === undefined) {
      warnings.push(`bot skipped: unusable slug ${JSON.stringify(file.slug)}`)
      skippedBots += 1
      continue
    }
    if (seenBots.has(slug)) {
      warnings.push(`bot ${slug}: duplicate file, kept the first`)
      skippedBots += 1
      continue
    }
    seenBots.add(slug)
    if (existingBots.has(slug)) {
      skippedBots += 1
      continue
    }
    const name = file.name?.trim()
    if (!name) warnings.push(`bot ${slug}: no name, used the slug`)
    const kind =
      file.kind === "expert" || file.kind === "worker" ? file.kind : (undefined as MissionSchema.BotKind | undefined)
    botSeeds.push({
      id: MissionSchema.BotID.ascending(`bot_${slug}`),
      slug,
      name: name || slug,
      role: file.role ?? "",
      avatar: file.avatar,
      instructions: file.instructions ?? "",
      model: file.model ?? DEFAULT_BOT_MODEL,
      tools: file.tools ?? [],
      mcps: file.mcps ?? [],
      skills: file.skills ?? [],
      voice: file.voice,
      memoryScope: file.scopes ?? ["bot"],
      permissions: {},
      kind,
    })
  }

  const botSlugs = new Set([...existingBots, ...botSeeds.map((bot) => bot.slug)])
  const teamSeeds: TeamSeed[] = []
  const missionSeeds: MissionSeed[] = []
  const seenTeams = new Set<string>()
  let skippedTeams = 0
  let skippedMissions = 0
  for (const file of input.rooms ?? []) {
    const slug = slugOf(file.slug)
    if (slug === undefined) {
      warnings.push(`room skipped: unusable slug ${JSON.stringify(file.slug)}`)
      skippedTeams += 1
      continue
    }
    if (seenTeams.has(slug)) {
      warnings.push(`room ${slug}: duplicate file, kept the first`)
      skippedTeams += 1
      continue
    }
    seenTeams.add(slug)
    const name = file.name?.trim() || slug
    const members = (file.members ?? []).filter((member) => {
      if (botSlugs.has(member)) return true
      warnings.push(`room ${slug}: member ${member} is not a known bot, left out`)
      return false
    })

    if (existingTeams.has(slug)) skippedTeams += 1
    else
      teamSeeds.push({
        id: MissionSchema.TeamID.ascending(`team_${slug}`),
        slug,
        name,
        members: members.map((member) => MissionSchema.BotID.ascending(`bot_${member}`)),
      })

    const missionId = `mis_room_${slug}`
    if (existingMissions.has(missionId)) {
      skippedMissions += 1
      continue
    }
    // `sessions` maps bot slug -> session id; the link keeps both so attribution survives.
    const sessions = Object.entries(file.sessions ?? {})
      .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0)
      .map(([member, sessionId]) => ({ sessionId, participant: member }))
    missionSeeds.push({
      id: MissionSchema.MissionID.ascending(missionId),
      title: `Room: ${name}`,
      state: "active",
      origin: "room",
      teamId: MissionSchema.TeamID.ascending(`team_${slug}`),
      sessionIds: [],
      sessions,
    })
  }

  return {
    bots: botSeeds,
    teams: teamSeeds,
    missions: missionSeeds,
    skipped: { bots: skippedBots, teams: skippedTeams, missions: skippedMissions },
    warnings,
  }
}

/** Every linked session id in the plan, in plan order and without duplicates. */
export function plannedSessionIds(plan: BackfillPlan): ReadonlyArray<string> {
  return [...new Set(plan.missions.flatMap((mission) => mission.sessions.map((session) => session.sessionId)))]
}
