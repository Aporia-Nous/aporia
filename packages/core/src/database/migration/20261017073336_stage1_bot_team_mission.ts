import { Effect } from "effect"
import type { DatabaseMigration } from "../migration.js"

const migration: DatabaseMigration.Migration = {
  id: "20261017073336_stage1_bot_team_mission",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`bot\` (
          \`id\` text PRIMARY KEY,
          \`slug\` text NOT NULL UNIQUE,
          \`name\` text NOT NULL,
          \`role\` text DEFAULT '' NOT NULL,
          \`avatar\` text,
          \`instructions\` text DEFAULT '' NOT NULL,
          \`model\` text NOT NULL,
          \`tools\` text DEFAULT '[]' NOT NULL,
          \`mcps\` text DEFAULT '[]' NOT NULL,
          \`skills\` text DEFAULT '[]' NOT NULL,
          \`voice\` text,
          \`memory_scope\` text DEFAULT '["bot"]' NOT NULL,
          \`permissions\` text DEFAULT '{}' NOT NULL,
          \`kind\` text,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          \`time_archived\` integer
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`mission_session\` (
          \`mission_id\` text NOT NULL,
          \`session_id\` text NOT NULL,
          \`participant\` text,
          \`time_created\` integer NOT NULL,
          CONSTRAINT \`mission_session_pk\` PRIMARY KEY(\`mission_id\`, \`session_id\`),
          CONSTRAINT \`fk_mission_session_mission_id_mission_id_fk\` FOREIGN KEY (\`mission_id\`) REFERENCES \`mission\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`mission\` (
          \`id\` text PRIMARY KEY,
          \`title\` text NOT NULL,
          \`state\` text DEFAULT 'active' NOT NULL,
          \`origin\` text DEFAULT 'manual' NOT NULL,
          \`team_id\` text,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          \`time_archived\` integer
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`mission_ui_state\` (
          \`mission_id\` text PRIMARY KEY,
          \`draft\` text,
          \`scroll\` text,
          \`selected_artifact\` text,
          \`selected_bot_id\` text,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_mission_ui_state_mission_id_mission_id_fk\` FOREIGN KEY (\`mission_id\`) REFERENCES \`mission\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`task_dependency\` (
          \`task_id\` text NOT NULL,
          \`depends_on_id\` text NOT NULL,
          \`time_created\` integer NOT NULL,
          CONSTRAINT \`task_dependency_pk\` PRIMARY KEY(\`task_id\`, \`depends_on_id\`),
          CONSTRAINT \`fk_task_dependency_task_id_task_id_fk\` FOREIGN KEY (\`task_id\`) REFERENCES \`task\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`task\` (
          \`id\` text PRIMARY KEY,
          \`mission_id\` text NOT NULL,
          \`title\` text NOT NULL,
          \`state\` text DEFAULT 'pending' NOT NULL,
          \`owner_id\` text,
          \`revision\` integer DEFAULT 1 NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_task_mission_id_mission_id_fk\` FOREIGN KEY (\`mission_id\`) REFERENCES \`mission\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`team_member\` (
          \`team_id\` text NOT NULL,
          \`bot_id\` text NOT NULL,
          \`time_created\` integer NOT NULL,
          CONSTRAINT \`team_member_pk\` PRIMARY KEY(\`team_id\`, \`bot_id\`),
          CONSTRAINT \`fk_team_member_team_id_team_id_fk\` FOREIGN KEY (\`team_id\`) REFERENCES \`team\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`team\` (
          \`id\` text PRIMARY KEY,
          \`slug\` text NOT NULL UNIQUE,
          \`name\` text NOT NULL,
          \`coordinator_id\` text,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          \`time_archived\` integer
        );
      `)
      yield* tx.run(`CREATE INDEX \`bot_archived_idx\` ON \`bot\` (\`time_archived\`);`)
      yield* tx.run(`CREATE INDEX \`mission_session_session_idx\` ON \`mission_session\` (\`session_id\`);`)
      yield* tx.run(`CREATE INDEX \`mission_state_idx\` ON \`mission\` (\`state\`);`)
      yield* tx.run(`CREATE INDEX \`mission_team_idx\` ON \`mission\` (\`team_id\`);`)
      yield* tx.run(`CREATE INDEX \`task_mission_idx\` ON \`task\` (\`mission_id\`);`)
      yield* tx.run(`CREATE INDEX \`task_owner_state_idx\` ON \`task\` (\`owner_id\`,\`state\`);`)
      yield* tx.run(`CREATE INDEX \`team_member_bot_idx\` ON \`team_member\` (\`bot_id\`);`)
      yield* tx.run(`CREATE INDEX \`team_archived_idx\` ON \`team\` (\`time_archived\`);`)
    })
  },
}

export default migration
