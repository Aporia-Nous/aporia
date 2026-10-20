import { sqliteTable, text, integer, primaryKey, index } from "drizzle-orm/sqlite-core"
import { Timestamps } from "../database/schema.sql.js"
import type { MissionSchema } from "./schema.js"

// Durable domain tables. Every row is addressed by a stable text id; slug is only a natural key.
// `session`/`session_message` are never altered here: a mission links to a session by id string,
// deliberately without a foreign key, so importing, exporting or deleting conversations cannot
// cascade into work history (and vice versa).

export const BotTable = sqliteTable(
  "bot",
  {
    id: text().$type<MissionSchema.BotID>().primaryKey(),
    slug: text().$type<string>().notNull().unique(),
    name: text().notNull(),
    role: text().notNull().default(""),
    avatar: text(),
    instructions: text().notNull().default(""),
    model: text().notNull(),
    tools: text({ mode: "json" }).$type<readonly string[]>().notNull().default([]),
    mcps: text({ mode: "json" }).$type<readonly string[]>().notNull().default([]),
    skills: text({ mode: "json" }).$type<readonly string[]>().notNull().default([]),
    voice: text(),
    memory_scope: text({ mode: "json" }).$type<readonly string[]>().notNull().default(["bot"]),
    permissions: text({ mode: "json" }).$type<MissionSchema.Permissions>().notNull().default({}),
    kind: text().$type<MissionSchema.BotKind>(),
    ...Timestamps,
    time_archived: integer(),
  },
  (table) => [index("bot_archived_idx").on(table.time_archived)],
)

export const TeamTable = sqliteTable(
  "team",
  {
    id: text().$type<MissionSchema.TeamID>().primaryKey(),
    slug: text().$type<string>().notNull().unique(),
    name: text().notNull(),
    coordinator_id: text().$type<MissionSchema.BotID>(),
    ...Timestamps,
    time_archived: integer(),
  },
  (table) => [index("team_archived_idx").on(table.time_archived)],
)

/** Membership is its own table so a bot can belong to many teams and removal is one row. */
export const TeamMemberTable = sqliteTable(
  "team_member",
  {
    team_id: text()
      .$type<MissionSchema.TeamID>()
      .notNull()
      .references(() => TeamTable.id, { onDelete: "cascade" }),
    bot_id: text().$type<MissionSchema.BotID>().notNull(),
    time_created: integer()
      .notNull()
      .$default(() => Date.now()),
  },
  (table) => [primaryKey({ columns: [table.team_id, table.bot_id] }), index("team_member_bot_idx").on(table.bot_id)],
)

export const MissionTable = sqliteTable(
  "mission",
  {
    id: text().$type<MissionSchema.MissionID>().primaryKey(),
    title: text().notNull(),
    state: text().$type<MissionSchema.MissionState>().notNull().default("active"),
    origin: text().$type<MissionSchema.MissionOrigin>().notNull().default("manual"),
    team_id: text().$type<MissionSchema.TeamID>(),
    ...Timestamps,
    time_archived: integer(),
  },
  (table) => [index("mission_state_idx").on(table.state), index("mission_team_idx").on(table.team_id)],
)

/** A mission can use many underlying sessions while reading as one job. */
export const MissionSessionTable = sqliteTable(
  "mission_session",
  {
    mission_id: text()
      .$type<MissionSchema.MissionID>()
      .notNull()
      .references(() => MissionTable.id, { onDelete: "cascade" }),
    session_id: text().$type<string>().notNull(),
    /** Which teammate (bot slug) the session belongs to when the link is per member, else null. */
    participant: text(),
    time_created: integer()
      .notNull()
      .$default(() => Date.now()),
  },
  (table) => [
    primaryKey({ columns: [table.mission_id, table.session_id] }),
    index("mission_session_session_idx").on(table.session_id),
  ],
)

export const TaskTable = sqliteTable(
  "task",
  {
    id: text().$type<MissionSchema.TaskID>().primaryKey(),
    mission_id: text()
      .$type<MissionSchema.MissionID>()
      .notNull()
      .references(() => MissionTable.id, { onDelete: "cascade" }),
    title: text().notNull(),
    state: text().$type<MissionSchema.TaskState>().notNull().default("pending"),
    owner_id: text().$type<MissionSchema.BotID>(),
    revision: integer().notNull().default(1),
    ...Timestamps,
  },
  (table) => [
    index("task_mission_idx").on(table.mission_id),
    index("task_owner_state_idx").on(table.owner_id, table.state),
  ],
)

/** Dependencies are rows, not a JSON array: a cycle check and a "what blocks X" query both need them. */
export const TaskDependencyTable = sqliteTable(
  "task_dependency",
  {
    task_id: text()
      .$type<MissionSchema.TaskID>()
      .notNull()
      .references(() => TaskTable.id, { onDelete: "cascade" }),
    depends_on_id: text().$type<MissionSchema.TaskID>().notNull(),
    time_created: integer()
      .notNull()
      .$default(() => Date.now()),
  },
  (table) => [primaryKey({ columns: [table.task_id, table.depends_on_id] })],
)

/**
 * UI state lives in its own table keyed by mission. It carries no work state, so a restart may keep
 * it, drop it or leave it stale without losing anything that matters.
 */
export const MissionUIStateTable = sqliteTable("mission_ui_state", {
  mission_id: text()
    .$type<MissionSchema.MissionID>()
    .primaryKey()
    .references(() => MissionTable.id, { onDelete: "cascade" }),
  draft: text(),
  scroll: text({ mode: "json" }).$type<unknown>(),
  selected_artifact: text(),
  selected_bot_id: text().$type<MissionSchema.BotID>(),
  ...Timestamps,
})
