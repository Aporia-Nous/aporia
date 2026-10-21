import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"
import type { MissionSchema } from "./schema.js"

// Append-only coordination log. Rows are never updated or deleted: `seq` is the order the
// coordinator replays and `idempotency_key` is what makes a replay insert nothing. Keeping the log
// append-only is what lets a restart recover by reading forward instead of by trusting memory.
//
// `mission_event` deliberately carries no foreign keys. Work history must survive a mission, task
// or bot being archived, and a cascade delete would erase the reason a wake happened.
export const MissionEventTable = sqliteTable(
  "mission_event",
  {
    seq: integer().primaryKey({ autoIncrement: true }),
    id: text().$type<MissionSchema.MissionEventID>().notNull().unique(),
    mission_id: text().$type<MissionSchema.MissionID>(),
    task_id: text().$type<MissionSchema.TaskID>(),
    correlation_id: text().$type<MissionSchema.CorrelationID>().notNull(),
    type: text().$type<MissionSchema.MissionEventType>().notNull(),
    actor: text({ mode: "json" }).$type<MissionSchema.Actor>().notNull(),
    payload: text({ mode: "json" }).$type<MissionSchema.MissionEvent["payload"]>().notNull(),
    idempotency_key: text().notNull(),
    time_created: integer().notNull(),
  },
  (table) => [
    uniqueIndex("mission_event_idempotency_idx").on(table.idempotency_key),
    index("mission_event_correlation_idx").on(table.correlation_id, table.seq),
    index("mission_event_task_idx").on(table.task_id, table.seq),
    index("mission_event_mission_idx").on(table.mission_id, table.seq),
  ],
)

// One row: how far the coordinator has replayed. A crash leaves this behind the log, and the next
// start replays the difference; every effect of that replay is keyed, so replay wakes nobody twice.
export const CoordinatorCursorTable = sqliteTable("mission_coordinator_cursor", {
  id: text().primaryKey(),
  seq: integer().notNull().default(0),
})
