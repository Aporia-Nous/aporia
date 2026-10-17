// The durable Aporetic domain lives in this directory:
//   schema.ts  - Effect schemas, branded ids, inputs and tagged errors
//   sql.ts     - drizzle table declarations and the migration generator's input
//   service.ts - the Effect service over the tables
// `@opencode/core/mission` (src/mission.ts) re-exports this directory, so callers use
// `Mission.Service` / `Mission.Bot` without reaching into files.
export * from "./schema.js"
export * from "./service.js"
export * from "./backfill.js"
