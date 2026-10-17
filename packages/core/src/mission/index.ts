// The durable Aporetic domain lives in this directory:
//   schema.ts       - Effect schemas, branded ids, inputs and tagged errors
//   sql.ts          - drizzle table declarations and the migration generator's input
//   service.ts      - the Effect service over the tables
//   event.sql.ts    - the append-only mission_event log and the coordinator cursor
//   event.ts        - the log's Effect service (append, list, cursor)
//   coordination.ts - the pure rules: fold a thread, decide who is woken next
//   coordinator.ts  - the Effect service that applies those rules and delivers wakes
// `@opencode/core/mission` (src/mission.ts) re-exports this directory, so callers use
// `Mission.Service` / `Mission.Bot` without reaching into files.
export * from "./schema.js"
export * from "./service.js"
export * from "./backfill.js"
export * as MissionEvents from "./event.js"
export * as Coordination from "./coordination.js"
export * as Coordinator from "./coordinator.js"
