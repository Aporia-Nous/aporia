import { Effect } from "effect"
import type { DatabaseMigration } from "../migration.js"

const migration: DatabaseMigration.Migration = {
  id: "20261017084824_stage2_mission_event",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`mission_coordinator_cursor\` (
          \`id\` text PRIMARY KEY,
          \`seq\` integer DEFAULT 0 NOT NULL
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`mission_event\` (
          \`seq\` integer PRIMARY KEY AUTOINCREMENT,
          \`id\` text NOT NULL UNIQUE,
          \`mission_id\` text,
          \`task_id\` text,
          \`correlation_id\` text NOT NULL,
          \`type\` text NOT NULL,
          \`actor\` text NOT NULL,
          \`payload\` text NOT NULL,
          \`idempotency_key\` text NOT NULL,
          \`time_created\` integer NOT NULL
        );
      `)
      yield* tx.run(`CREATE UNIQUE INDEX \`mission_event_idempotency_idx\` ON \`mission_event\` (\`idempotency_key\`);`)
      yield* tx.run(`CREATE INDEX \`mission_event_correlation_idx\` ON \`mission_event\` (\`correlation_id\`,\`seq\`);`)
      yield* tx.run(`CREATE INDEX \`mission_event_task_idx\` ON \`mission_event\` (\`task_id\`,\`seq\`);`)
      yield* tx.run(`CREATE INDEX \`mission_event_mission_idx\` ON \`mission_event\` (\`mission_id\`,\`seq\`);`)
    })
  },
}

export default migration
