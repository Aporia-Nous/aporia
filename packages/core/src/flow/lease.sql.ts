import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core"

// One row per database: which flow runner may advance runs, and until when. The runner that holds it
// renews it while it lives and clears it when it stops; a runner that dies leaves it to run out. It is
// updated in place, unlike the mission log, because it is a lease and not a fact about a run.
export const FlowRunnerLeaseTable = sqliteTable("flow_runner_lease", {
  id: text().primaryKey(),
  owner: text().notNull(),
  boot: text().notNull(),
  expires_at: integer().notNull(),
  time_updated: integer().notNull(),
})