import { and, asc, eq, inArray, isNull, notInArray } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"
import { makeGlobalNode } from "@opencode/util/effect/app-node"
import { Database } from "../database/database.js"
import { MissionSchema } from "./schema.js"
import {
  BotTable,
  MissionSessionTable,
  MissionTable,
  MissionUIStateTable,
  TaskDependencyTable,
  TaskTable,
  TeamMemberTable,
  TeamTable,
} from "./sql.js"

type Bot = MissionSchema.Bot
type Team = MissionSchema.Team
type Mission = MissionSchema.Mission
type Task = MissionSchema.Task
type UIState = MissionSchema.UIState
type BotID = MissionSchema.BotID
type TeamID = MissionSchema.TeamID
type MissionID = MissionSchema.MissionID
type TaskID = MissionSchema.TaskID
type TaskState = MissionSchema.TaskState

export const DEFAULT_BOT_MODEL = "deepseek/deepseek-flash"
const DEFAULT_MEMORY_SCOPE = ["bot"]

export interface Interface {
  // Bots
  readonly listBots: (input?: { archived?: boolean }) => Effect.Effect<ReadonlyArray<Bot>>
  readonly getBot: (botID: BotID) => Effect.Effect<Bot, MissionSchema.BotNotFoundError>
  readonly getBotBySlug: (slug: string) => Effect.Effect<Bot | undefined>
  readonly createBot: (
    input: MissionSchema.CreateBotInput,
  ) => Effect.Effect<Bot, MissionSchema.SlugTakenError>
  readonly updateBot: (
    botID: BotID,
    input: MissionSchema.UpdateBotInput,
  ) => Effect.Effect<Bot, MissionSchema.BotNotFoundError>
  /**
   * Archiving keeps every row and every task link. Open work is never silently moved: without
   * `reassignTo` the call fails with the task ids, and with it the tasks move in the same transaction.
   */
  readonly archiveBot: (
    botID: BotID,
    input?: MissionSchema.ArchiveBotInput,
  ) => Effect.Effect<Bot, MissionSchema.BotNotFoundError | MissionSchema.BotHasOpenTasksError>
  readonly restoreBot: (botID: BotID) => Effect.Effect<Bot, MissionSchema.BotNotFoundError>
  /** Non-terminal tasks owned by a bot, in creation order. */
  readonly openTasksForBot: (botID: BotID) => Effect.Effect<ReadonlyArray<Task>>

  // Teams
  readonly listTeams: (input?: { archived?: boolean }) => Effect.Effect<ReadonlyArray<Team>>
  readonly getTeam: (teamID: TeamID) => Effect.Effect<Team, MissionSchema.TeamNotFoundError>
  readonly createTeam: (
    input: MissionSchema.CreateTeamInput,
  ) => Effect.Effect<Team, MissionSchema.SlugTakenError | MissionSchema.BotNotFoundError>
  readonly addTeamMember: (
    teamID: TeamID,
    botID: BotID,
  ) => Effect.Effect<Team, MissionSchema.TeamNotFoundError | MissionSchema.BotNotFoundError>
  readonly removeTeamMember: (
    teamID: TeamID,
    botID: BotID,
  ) => Effect.Effect<Team, MissionSchema.TeamNotFoundError | MissionSchema.TeamCoordinatorError>
  readonly setTeamCoordinator: (
    teamID: TeamID,
    botID: BotID | null,
  ) => Effect.Effect<Team, MissionSchema.TeamNotFoundError | MissionSchema.BotNotFoundError>

  // Missions
  readonly listMissions: (input?: {
    state?: MissionSchema.MissionState
    teamID?: TeamID
    includeArchived?: boolean
  }) => Effect.Effect<ReadonlyArray<Mission>>
  readonly getMission: (missionID: MissionID) => Effect.Effect<Mission, MissionSchema.MissionNotFoundError>
  readonly createMission: (
    input: MissionSchema.CreateMissionInput,
  ) => Effect.Effect<Mission, MissionSchema.TeamNotFoundError>
  readonly attachMissionSession: (
    missionID: MissionID,
    sessionID: string,
    participant?: string,
  ) => Effect.Effect<Mission, MissionSchema.MissionNotFoundError>
  readonly detachMissionSession: (
    missionID: MissionID,
    sessionID: string,
  ) => Effect.Effect<Mission, MissionSchema.MissionNotFoundError>
  readonly setMissionState: (
    missionID: MissionID,
    state: MissionSchema.MissionState,
  ) => Effect.Effect<Mission, MissionSchema.MissionNotFoundError>

  // Tasks
  readonly listTasks: (input?: {
    missionID?: MissionID
    ownerID?: BotID
    state?: TaskState
    openOnly?: boolean
  }) => Effect.Effect<ReadonlyArray<Task>>
  readonly getTask: (taskID: TaskID) => Effect.Effect<Task, MissionSchema.TaskNotFoundError>
  readonly createTask: (
    input: MissionSchema.CreateTaskInput,
  ) => Effect.Effect<
    Task,
    MissionSchema.MissionNotFoundError | MissionSchema.BotNotFoundError | MissionSchema.TaskNotFoundError
  >
  readonly setTaskState: (
    taskID: TaskID,
    state: TaskState,
  ) => Effect.Effect<Task, MissionSchema.TaskNotFoundError>
  readonly reassignTask: (
    taskID: TaskID,
    botID: BotID,
  ) => Effect.Effect<Task, MissionSchema.TaskNotFoundError | MissionSchema.BotNotFoundError>
  readonly setTaskDependencies: (
    taskID: TaskID,
    dependsOn: ReadonlyArray<TaskID>,
  ) => Effect.Effect<Task, MissionSchema.TaskNotFoundError | MissionSchema.MissionLinkError>

  // Per-mission UI state
  readonly getUIState: (missionID: MissionID) => Effect.Effect<UIState | undefined>
  readonly saveUIState: (input: MissionSchema.SaveUIStateInput) => Effect.Effect<UIState>
  readonly clearUIState: (missionID: MissionID) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/Mission") {}

export function slugify(input: string) {
  return (
    input
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "bot"
  )
}

type BotRow = typeof BotTable.$inferSelect
type TeamRow = typeof TeamTable.$inferSelect
type MissionRow = typeof MissionTable.$inferSelect
type TaskRow = typeof TaskTable.$inferSelect
type UIStateRow = typeof MissionUIStateTable.$inferSelect

function botFromRow(row: BotRow): Bot {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    role: row.role,
    avatar: row.avatar ?? undefined,
    instructions: row.instructions,
    model: row.model,
    tools: row.tools,
    mcps: row.mcps,
    skills: row.skills,
    voice: row.voice ?? undefined,
    memoryScope: row.memory_scope,
    permissions: row.permissions,
    kind: row.kind ?? undefined,
    time: { created: row.time_created, updated: row.time_updated, archived: row.time_archived ?? undefined },
  }
}

function missionFromRow(row: MissionRow, sessionIds: readonly string[]): Mission {
  return {
    id: row.id,
    title: row.title,
    state: row.state,
    origin: row.origin,
    teamId: row.team_id ?? undefined,
    sessionIds: sessionIds as Mission["sessionIds"],
    time: { created: row.time_created, updated: row.time_updated, archived: row.time_archived ?? undefined },
  }
}

function taskFromRow(row: TaskRow, dependsOn: readonly string[]): Task {
  return {
    id: row.id,
    missionId: row.mission_id,
    title: row.title,
    state: row.state,
    ownerId: row.owner_id ?? undefined,
    dependsOn: dependsOn as Task["dependsOn"],
    revision: row.revision,
    time: { created: row.time_created, updated: row.time_updated, archived: undefined },
  }
}

function teamFromRow(row: TeamRow, members: readonly string[]): Team {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    coordinatorId: row.coordinator_id ?? undefined,
    members: members as Team["members"],
    time: { created: row.time_created, updated: row.time_updated, archived: row.time_archived ?? undefined },
  }
}

function uiStateFromRow(row: UIStateRow): UIState {
  return {
    missionId: row.mission_id,
    draft: row.draft ?? undefined,
    scroll: (row.scroll ?? undefined) as UIState["scroll"],
    selectedArtifact: row.selected_artifact ?? undefined,
    selectedBotId: row.selected_bot_id ?? undefined,
    time: { created: row.time_created, updated: row.time_updated, archived: undefined },
  }
}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const db = (yield* Database.Service).db

    // ---- bots ---------------------------------------------------------------------------------

    const loadBot = Effect.fn("Mission.loadBot")(function* (botID: BotID) {
      const row = yield* db.select().from(BotTable).where(eq(BotTable.id, botID)).get().pipe(Effect.orDie)
      if (!row) return undefined
      return botFromRow(row as BotRow)
    })

    const getBot = Effect.fn("Mission.getBot")(function* (botID: BotID) {
      const bot = yield* loadBot(botID)
      if (!bot) return yield* new MissionSchema.BotNotFoundError({ botID })
      return bot
    })

    const requireBot = Effect.fnUntraced(function* (botID: BotID | undefined) {
      if (!botID) return undefined
      return yield* getBot(botID)
    })

    const listBots = Effect.fn("Mission.listBots")(function* (input?: { archived?: boolean }) {
      const rows = yield* db
        .select()
        .from(BotTable)
        .where(input?.archived ? undefined : isNull(BotTable.time_archived))
        .orderBy(asc(BotTable.time_created))
        .all()
        .pipe(Effect.orDie)
      return rows.map((row) => botFromRow(row as BotRow))
    })

    const getBotBySlug = Effect.fn("Mission.getBotBySlug")(function* (slug: string) {
      const row = yield* db.select().from(BotTable).where(eq(BotTable.slug, slug)).get().pipe(Effect.orDie)
      return row ? botFromRow(row as BotRow) : undefined
    })

    const createBot = Effect.fn("Mission.createBot")(function* (input: MissionSchema.CreateBotInput) {
      const slug = input.slug ?? slugify(input.name)
      const existing = yield* db.select({ id: BotTable.id }).from(BotTable).where(eq(BotTable.slug, slug)).get().pipe(
        Effect.orDie,
      )
      if (existing) return yield* new MissionSchema.SlugTakenError({ kind: "bot", slug })
      const now = Date.now()
      const row: typeof BotTable.$inferInsert = {
        id: input.id ?? MissionSchema.BotID.create(),
        slug,
        name: input.name,
        role: input.role ?? "",
        avatar: input.avatar,
        instructions: input.instructions ?? "",
        model: input.model ?? DEFAULT_BOT_MODEL,
        tools: input.tools ?? [],
        mcps: input.mcps ?? [],
        skills: input.skills ?? [],
        voice: input.voice,
        memory_scope: input.memoryScope ?? [...DEFAULT_MEMORY_SCOPE],
        permissions: input.permissions ?? {},
        kind: input.kind,
        time_created: now,
        time_updated: now,
      }
      yield* db.insert(BotTable).values(row).run().pipe(Effect.orDie)
      return (yield* loadBot(row.id))!
    })

    const updateBot = Effect.fn("Mission.updateBot")(function* (
      botID: BotID,
      input: MissionSchema.UpdateBotInput,
    ) {
      yield* getBot(botID)
      const set: Partial<typeof BotTable.$inferInsert> = { time_updated: Date.now() }
      if (input.name !== undefined) set.name = input.name
      if (input.role !== undefined) set.role = input.role
      if (input.avatar !== undefined) set.avatar = input.avatar
      if (input.instructions !== undefined) set.instructions = input.instructions
      if (input.model !== undefined) set.model = input.model
      if (input.tools !== undefined) set.tools = [...input.tools]
      if (input.mcps !== undefined) set.mcps = [...input.mcps]
      if (input.skills !== undefined) set.skills = [...input.skills]
      if (input.voice !== undefined) set.voice = input.voice
      if (input.memoryScope !== undefined) set.memory_scope = [...input.memoryScope]
      if (input.permissions !== undefined) set.permissions = input.permissions
      if (input.kind !== undefined) set.kind = input.kind
      yield* db.update(BotTable).set(set).where(eq(BotTable.id, botID)).run().pipe(Effect.orDie)
      return (yield* loadBot(botID))!
    })

    const openTasksForBot = Effect.fn("Mission.openTasksForBot")(function* (botID: BotID) {
      const rows = yield* db
        .select()
        .from(TaskTable)
        .where(and(eq(TaskTable.owner_id, botID), notInArray(TaskTable.state, [...MissionSchema.TERMINAL_TASK_STATES])))
        .orderBy(asc(TaskTable.time_created))
        .all()
        .pipe(Effect.orDie)
      return rows.map((row) => taskFromRow(row as TaskRow, []))
    })

    const archiveBot = Effect.fn("Mission.archiveBot")(function* (
      botID: BotID,
      input?: MissionSchema.ArchiveBotInput,
    ) {
      yield* getBot(botID)
      const open = yield* openTasksForBot(botID)
      const reassignTo = input?.reassignTo
      if (open.length > 0 && !reassignTo)
        return yield* new MissionSchema.BotHasOpenTasksError({ botID, taskIDs: open.map((task) => task.id) })
      if (reassignTo) {
        const target = yield* getBot(reassignTo)
        if (target.id === botID)
          return yield* new MissionSchema.BotHasOpenTasksError({ botID, taskIDs: open.map((task) => task.id) })
      }
      const now = Date.now()
      yield* db
        .transaction((tx) =>
          Effect.gen(function* () {
            if (reassignTo && open.length > 0) {
              // One row at a time: each task's revision is its own, so an inherited task that was already at
              // revision 3 must move to 4, never back to 2. Same rule as reassignTask below.
              for (const task of open) {
                yield* tx
                  .update(TaskTable)
                  .set({ owner_id: reassignTo, revision: task.revision + 1, time_updated: now })
                  .where(
                    and(
                      eq(TaskTable.id, task.id),
                      eq(TaskTable.owner_id, botID),
                      notInArray(TaskTable.state, [...MissionSchema.TERMINAL_TASK_STATES]),
                    ),
                  )
                  .run()
              }
            }
            yield* tx
              .update(BotTable)
              .set({ time_archived: now, time_updated: now })
              .where(eq(BotTable.id, botID))
              .run()
          }),
        )
        .pipe(Effect.orDie)
      return (yield* loadBot(botID))!
    })

    const restoreBot = Effect.fn("Mission.restoreBot")(function* (botID: BotID) {
      yield* getBot(botID)
      yield* db
        .update(BotTable)
        .set({ time_archived: null, time_updated: Date.now() })
        .where(eq(BotTable.id, botID))
        .run()
        .pipe(Effect.orDie)
      return (yield* loadBot(botID))!
    })

    // ---- teams --------------------------------------------------------------------------------

    const membersOf = Effect.fnUntraced(function* (teamIDs: ReadonlyArray<TeamID>) {
      if (teamIDs.length === 0) return new Map<TeamID, string[]>()
      const rows = yield* db
        .select({ team_id: TeamMemberTable.team_id, bot_id: TeamMemberTable.bot_id })
        .from(TeamMemberTable)
        .where(inArray(TeamMemberTable.team_id, [...teamIDs]))
        .orderBy(asc(TeamMemberTable.time_created))
        .all()
        .pipe(Effect.orDie)
      const grouped = new Map<TeamID, string[]>()
      for (const row of rows) {
        const list = grouped.get(row.team_id)
        if (list) list.push(row.bot_id)
        else grouped.set(row.team_id, [row.bot_id])
      }
      return grouped
    })

    const loadTeam = Effect.fn("Mission.loadTeam")(function* (teamID: TeamID) {
      const row = yield* db.select().from(TeamTable).where(eq(TeamTable.id, teamID)).get().pipe(Effect.orDie)
      if (!row) return undefined
      const members = (yield* membersOf([teamID])).get(teamID) ?? []
      return teamFromRow(row as TeamRow, members)
    })

    const getTeam = Effect.fn("Mission.getTeam")(function* (teamID: TeamID) {
      const team = yield* loadTeam(teamID)
      if (!team) return yield* new MissionSchema.TeamNotFoundError({ teamID })
      return team
    })

    const listTeams = Effect.fn("Mission.listTeams")(function* (input?: { archived?: boolean }) {
      const rows = yield* db
        .select()
        .from(TeamTable)
        .where(input?.archived ? undefined : isNull(TeamTable.time_archived))
        .orderBy(asc(TeamTable.time_created))
        .all()
        .pipe(Effect.orDie)
      const members = yield* membersOf(rows.map((row) => row.id))
      return rows.map((row) => teamFromRow(row as TeamRow, members.get(row.id) ?? []))
    })

    const createTeam = Effect.fn("Mission.createTeam")(function* (input: MissionSchema.CreateTeamInput) {
      const slug = input.slug ?? slugify(input.name)
      const existing = yield* db.select({ id: TeamTable.id }).from(TeamTable).where(eq(TeamTable.slug, slug)).get().pipe(
        Effect.orDie,
      )
      if (existing) return yield* new MissionSchema.SlugTakenError({ kind: "team", slug })
      const coordinator = yield* requireBot(input.coordinatorId)
      const members = [...new Set(input.members ?? [])]
      for (const member of members) yield* getBot(member)
      const now = Date.now()
      const row: typeof TeamTable.$inferInsert = {
        id: input.id ?? MissionSchema.TeamID.create(),
        slug,
        name: input.name,
        coordinator_id: coordinator?.id,
        time_created: now,
        time_updated: now,
      }
      yield* db
        .transaction((tx) =>
          Effect.gen(function* () {
            yield* tx.insert(TeamTable).values(row).run()
            const seeds = [...new Set([...(coordinator ? [coordinator.id] : []), ...members])]
            if (seeds.length > 0)
              yield* tx
                .insert(TeamMemberTable)
                .values(seeds.map((botID) => ({ team_id: row.id, bot_id: botID, time_created: now })))
                .onConflictDoNothing()
                .run()
          }),
        )
        .pipe(Effect.orDie)
      return (yield* loadTeam(row.id))!
    })

    const addTeamMember = Effect.fn("Mission.addTeamMember")(function* (teamID: TeamID, botID: BotID) {
      yield* getTeam(teamID)
      yield* getBot(botID)
      yield* db
        .insert(TeamMemberTable)
        .values({ team_id: teamID, bot_id: botID })
        .onConflictDoNothing()
        .run()
        .pipe(Effect.orDie)
      yield* db.update(TeamTable).set({ time_updated: Date.now() }).where(eq(TeamTable.id, teamID)).run().pipe(
        Effect.orDie,
      )
      return (yield* loadTeam(teamID))!
    })

    const removeTeamMember = Effect.fn("Mission.removeTeamMember")(function* (teamID: TeamID, botID: BotID) {
      const team = yield* getTeam(teamID)
      if (team.coordinatorId === botID) return yield* new MissionSchema.TeamCoordinatorError({ teamID, botID })
      yield* db
        .delete(TeamMemberTable)
        .where(and(eq(TeamMemberTable.team_id, teamID), eq(TeamMemberTable.bot_id, botID)))
        .run()
        .pipe(Effect.orDie)
      yield* db.update(TeamTable).set({ time_updated: Date.now() }).where(eq(TeamTable.id, teamID)).run().pipe(
        Effect.orDie,
      )
      return (yield* loadTeam(teamID))!
    })

    const setTeamCoordinator = Effect.fn("Mission.setTeamCoordinator")(function* (
      teamID: TeamID,
      botID: BotID | null,
    ) {
      yield* getTeam(teamID)
      if (botID) {
        yield* getBot(botID)
        yield* db
          .insert(TeamMemberTable)
          .values({ team_id: teamID, bot_id: botID })
          .onConflictDoNothing()
          .run()
          .pipe(Effect.orDie)
      }
      yield* db
        .update(TeamTable)
        .set({ coordinator_id: botID, time_updated: Date.now() })
        .where(eq(TeamTable.id, teamID))
        .run()
        .pipe(Effect.orDie)
      return (yield* loadTeam(teamID))!
    })

    // ---- missions -----------------------------------------------------------------------------

    const sessionsOf = Effect.fnUntraced(function* (missionIDs: ReadonlyArray<MissionID>) {
      if (missionIDs.length === 0) return new Map<MissionID, string[]>()
      const rows = yield* db
        .select({ mission_id: MissionSessionTable.mission_id, session_id: MissionSessionTable.session_id })
        .from(MissionSessionTable)
        .where(inArray(MissionSessionTable.mission_id, [...missionIDs]))
        .orderBy(asc(MissionSessionTable.time_created))
        .all()
        .pipe(Effect.orDie)
      const grouped = new Map<MissionID, string[]>()
      for (const row of rows) {
        const list = grouped.get(row.mission_id)
        if (list) list.push(row.session_id)
        else grouped.set(row.mission_id, [row.session_id])
      }
      return grouped
    })

    const loadMission = Effect.fn("Mission.loadMission")(function* (missionID: MissionID) {
      const row = yield* db.select().from(MissionTable).where(eq(MissionTable.id, missionID)).get().pipe(Effect.orDie)
      if (!row) return undefined
      const sessions = (yield* sessionsOf([missionID])).get(missionID) ?? []
      return missionFromRow(row as MissionRow, sessions)
    })

    const getMission = Effect.fn("Mission.getMission")(function* (missionID: MissionID) {
      const mission = yield* loadMission(missionID)
      if (!mission) return yield* new MissionSchema.MissionNotFoundError({ missionID })
      return mission
    })

    const listMissions = Effect.fn("Mission.listMissions")(function* (input?: {
      state?: MissionSchema.MissionState
      teamID?: TeamID
      includeArchived?: boolean
    }) {
      const rows = yield* db
        .select()
        .from(MissionTable)
        .where(
          and(
            input?.state ? eq(MissionTable.state, input.state) : undefined,
            input?.teamID ? eq(MissionTable.team_id, input.teamID) : undefined,
            input?.includeArchived ? undefined : isNull(MissionTable.time_archived),
          ),
        )
        .orderBy(asc(MissionTable.time_created))
        .all()
        .pipe(Effect.orDie)
      const sessions = yield* sessionsOf(rows.map((row) => row.id))
      return rows.map((row) => missionFromRow(row as MissionRow, sessions.get(row.id) ?? []))
    })

    const createMission = Effect.fn("Mission.createMission")(function* (input: MissionSchema.CreateMissionInput) {
      if (input.teamId) yield* getTeam(input.teamId)
      const now = Date.now()
      const row: typeof MissionTable.$inferInsert = {
        id: input.id ?? MissionSchema.MissionID.create(),
        title: input.title,
        state: input.state ?? "active",
        origin: input.origin ?? "manual",
        team_id: input.teamId,
        time_created: now,
        time_updated: now,
      }
      const sessionIds = [...new Set(input.sessionIds ?? [])]
      yield* db
        .transaction((tx) =>
          Effect.gen(function* () {
            yield* tx.insert(MissionTable).values(row).run()
            if (sessionIds.length > 0)
              yield* tx
                .insert(MissionSessionTable)
                .values(sessionIds.map((sessionID) => ({ mission_id: row.id, session_id: sessionID, time_created: now })))
                .onConflictDoNothing()
                .run()
          }),
        )
        .pipe(Effect.orDie)
      return (yield* loadMission(row.id))!
    })

    const attachMissionSession = Effect.fn("Mission.attachMissionSession")(function* (
      missionID: MissionID,
      sessionID: string,
      participant?: string,
    ) {
      yield* getMission(missionID)
      yield* db
        .insert(MissionSessionTable)
        .values({ mission_id: missionID, session_id: sessionID, participant })
        .onConflictDoNothing()
        .run()
        .pipe(Effect.orDie)
      return (yield* loadMission(missionID))!
    })

    const detachMissionSession = Effect.fn("Mission.detachMissionSession")(function* (
      missionID: MissionID,
      sessionID: string,
    ) {
      yield* getMission(missionID)
      yield* db
        .delete(MissionSessionTable)
        .where(and(eq(MissionSessionTable.mission_id, missionID), eq(MissionSessionTable.session_id, sessionID)))
        .run()
        .pipe(Effect.orDie)
      return (yield* loadMission(missionID))!
    })

    const setMissionState = Effect.fn("Mission.setMissionState")(function* (
      missionID: MissionID,
      state: MissionSchema.MissionState,
    ) {
      yield* getMission(missionID)
      const now = Date.now()
      yield* db
        .update(MissionTable)
        .set({ state, time_updated: now, time_archived: state === "archived" ? now : null })
        .where(eq(MissionTable.id, missionID))
        .run()
        .pipe(Effect.orDie)
      return (yield* loadMission(missionID))!
    })

    // ---- tasks --------------------------------------------------------------------------------

    const dependenciesOf = Effect.fnUntraced(function* (taskIDs: ReadonlyArray<TaskID>) {
      if (taskIDs.length === 0) return new Map<TaskID, string[]>()
      const rows = yield* db
        .select({ task_id: TaskDependencyTable.task_id, depends_on_id: TaskDependencyTable.depends_on_id })
        .from(TaskDependencyTable)
        .where(inArray(TaskDependencyTable.task_id, [...taskIDs]))
        .orderBy(asc(TaskDependencyTable.time_created))
        .all()
        .pipe(Effect.orDie)
      const grouped = new Map<TaskID, string[]>()
      for (const row of rows) {
        const list = grouped.get(row.task_id)
        if (list) list.push(row.depends_on_id)
        else grouped.set(row.task_id, [row.depends_on_id])
      }
      return grouped
    })

    const loadTask = Effect.fn("Mission.loadTask")(function* (taskID: TaskID) {
      const row = yield* db.select().from(TaskTable).where(eq(TaskTable.id, taskID)).get().pipe(Effect.orDie)
      if (!row) return undefined
      const deps = (yield* dependenciesOf([taskID])).get(taskID) ?? []
      return taskFromRow(row as TaskRow, deps)
    })

    const getTask = Effect.fn("Mission.getTask")(function* (taskID: TaskID) {
      const task = yield* loadTask(taskID)
      if (!task) return yield* new MissionSchema.TaskNotFoundError({ taskID })
      return task
    })

    const listTasks = Effect.fn("Mission.listTasks")(function* (input?: {
      missionID?: MissionID
      ownerID?: BotID
      state?: TaskState
      openOnly?: boolean
    }) {
      const rows = yield* db
        .select()
        .from(TaskTable)
        .where(
          and(
            input?.missionID ? eq(TaskTable.mission_id, input.missionID) : undefined,
            input?.ownerID ? eq(TaskTable.owner_id, input.ownerID) : undefined,
            input?.state ? eq(TaskTable.state, input.state) : undefined,
            input?.openOnly ? notInArray(TaskTable.state, [...MissionSchema.TERMINAL_TASK_STATES]) : undefined,
          ),
        )
        .orderBy(asc(TaskTable.time_created))
        .all()
        .pipe(Effect.orDie)
      const deps = yield* dependenciesOf(rows.map((row) => row.id))
      return rows.map((row) => taskFromRow(row as TaskRow, deps.get(row.id) ?? []))
    })

    const createTask = Effect.fn("Mission.createTask")(function* (input: MissionSchema.CreateTaskInput) {
      yield* getMission(input.missionId)
      if (input.ownerId) yield* getBot(input.ownerId)
      const dependsOn = [...new Set(input.dependsOn ?? [])]
      for (const dependency of dependsOn) {
        const task = yield* getTask(dependency)
        if (task.missionId !== input.missionId)
          return yield* new MissionSchema.TaskNotFoundError({ taskID: dependency })
      }
      const now = Date.now()
      const row: typeof TaskTable.$inferInsert = {
        id: input.id ?? MissionSchema.TaskID.create(),
        mission_id: input.missionId,
        title: input.title,
        state: input.state ?? "pending",
        owner_id: input.ownerId,
        revision: 1,
        time_created: now,
        time_updated: now,
      }
      yield* db
        .transaction((tx) =>
          Effect.gen(function* () {
            yield* tx.insert(TaskTable).values(row).run()
            if (dependsOn.length > 0)
              yield* tx
                .insert(TaskDependencyTable)
                .values(dependsOn.map((dependsOnId) => ({ task_id: row.id, depends_on_id: dependsOnId, time_created: now })))
                .onConflictDoNothing()
                .run()
          }),
        )
        .pipe(Effect.orDie)
      return (yield* loadTask(row.id))!
    })

    const setTaskState = Effect.fn("Mission.setTaskState")(function* (taskID: TaskID, state: TaskState) {
      const task = yield* getTask(taskID)
      // Reopening finished work starts a new revision; ordinary progress inside one attempt does not.
      const reopen = MissionSchema.isTerminalTask(task.state) && !MissionSchema.isTerminalTask(state)
      const next = reopen ? task.revision + 1 : task.revision
      yield* db
        .update(TaskTable)
        .set({ state, revision: next, time_updated: Date.now() })
        .where(eq(TaskTable.id, taskID))
        .run()
        .pipe(Effect.orDie)
      return (yield* loadTask(taskID))!
    })

    const reassignTask = Effect.fn("Mission.reassignTask")(function* (taskID: TaskID, botID: BotID) {
      const task = yield* getTask(taskID)
      yield* getBot(botID)
      yield* db
        .update(TaskTable)
        .set({ owner_id: botID, revision: task.revision + 1, time_updated: Date.now() })
        .where(eq(TaskTable.id, taskID))
        .run()
        .pipe(Effect.orDie)
      return (yield* loadTask(taskID))!
    })

    const setTaskDependencies = Effect.fn("Mission.setTaskDependencies")(function* (
      taskID: TaskID,
      dependsOn: ReadonlyArray<TaskID>,
    ) {
      const task = yield* getTask(taskID)
      const next = [...new Set(dependsOn)].filter((id) => id !== taskID)
      if (next.length !== new Set(dependsOn).size)
        return yield* new MissionSchema.MissionLinkError({ message: "A task cannot depend on itself" })
      const graph = new Map<TaskID, readonly TaskID[]>()
      for (const id of next) {
        const dependency = yield* getTask(id)
        if (dependency.missionId !== task.missionId)
          return yield* new MissionSchema.MissionLinkError({ message: "Dependencies must belong to the same mission" })
        graph.set(id, dependency.dependsOn)
      }
      // Reject a cycle before writing: walk every new dependency's own transitive chain.
      const seen = new Set<TaskID>()
      const stack = [...next]
      while (stack.length > 0) {
        const current = stack.pop()!
        if (current === taskID)
          return yield* new MissionSchema.MissionLinkError({ message: "Dependencies would form a cycle" })
        if (seen.has(current)) continue
        seen.add(current)
        stack.push(...(graph.get(current) ?? []))
        if (!graph.has(current)) {
          const dependency = yield* getTask(current)
          graph.set(current, dependency.dependsOn)
          stack.push(...dependency.dependsOn)
        }
      }
      const now = Date.now()
      yield* db
        .transaction((tx) =>
          Effect.gen(function* () {
            yield* tx.delete(TaskDependencyTable).where(eq(TaskDependencyTable.task_id, taskID)).run()
            if (next.length > 0)
              yield* tx
                .insert(TaskDependencyTable)
                .values(next.map((dependsOnId) => ({ task_id: taskID, depends_on_id: dependsOnId, time_created: now })))
                .run()
            yield* tx.update(TaskTable).set({ time_updated: now }).where(eq(TaskTable.id, taskID)).run()
          }),
        )
        .pipe(Effect.orDie)
      return (yield* loadTask(taskID))!
    })

    // ---- UI state -----------------------------------------------------------------------------

    const getUIState = Effect.fn("Mission.getUIState")(function* (missionID: MissionID) {
      const row = yield* db
        .select()
        .from(MissionUIStateTable)
        .where(eq(MissionUIStateTable.mission_id, missionID))
        .get()
        .pipe(Effect.orDie)
      return row ? uiStateFromRow(row as UIStateRow) : undefined
    })

    const saveUIState = Effect.fn("Mission.saveUIState")(function* (input: MissionSchema.SaveUIStateInput) {
      const now = Date.now()
      yield* db
        .insert(MissionUIStateTable)
        .values({
          mission_id: input.missionId,
          draft: input.draft,
          scroll: input.scroll,
          selected_artifact: input.selectedArtifact,
          selected_bot_id: input.selectedBotId,
          time_created: now,
          time_updated: now,
        })
        .onConflictDoUpdate({
          target: MissionUIStateTable.mission_id,
          set: {
            draft: input.draft,
            scroll: input.scroll,
            selected_artifact: input.selectedArtifact,
            selected_bot_id: input.selectedBotId,
            time_updated: now,
          },
        })
        .run()
        .pipe(Effect.orDie)
      return (yield* getUIState(input.missionId))!
    })

    const clearUIState = Effect.fn("Mission.clearUIState")(function* (missionID: MissionID) {
      yield* db.delete(MissionUIStateTable).where(eq(MissionUIStateTable.mission_id, missionID)).run().pipe(
        Effect.orDie,
      )
    })

    return Service.of({
      listBots,
      getBot,
      getBotBySlug,
      createBot,
      updateBot,
      archiveBot,
      restoreBot,
      openTasksForBot,
      listTeams,
      getTeam,
      createTeam,
      addTeamMember,
      removeTeamMember,
      setTeamCoordinator,
      listMissions,
      getMission,
      createMission,
      attachMissionSession,
      detachMissionSession,
      setMissionState,
      listTasks,
      getTask,
      createTask,
      setTaskState,
      reassignTask,
      setTaskDependencies,
      getUIState,
      saveUIState,
      clearUIState,
    })
  }),
)

export const node = makeGlobalNode({ service: Service, layer, deps: [Database.node] })
