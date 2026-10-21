import { Effect } from "effect"
import type { DatabaseMigration } from "../migration.js"

const migration: DatabaseMigration.Migration = {
  id: "20261017144410_flow1_runner_lease",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`flow_runner_lease\` (
          \`id\` text PRIMARY KEY,
          \`owner\` text NOT NULL,
          \`boot\` text NOT NULL,
          \`expires_at\` integer NOT NULL,
          \`time_updated\` integer NOT NULL
        );
      `)
    })
  },
}

export default migration
