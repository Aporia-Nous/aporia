import { describe, expect } from "bun:test"
import { DateTime, Effect, Schema } from "effect"
import { Database } from "@opencode/core/database/database"
import { AppNodeBuilder } from "@opencode/core/effect/app-node-builder"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { Agent } from "@opencode/core/agent"
import { Model } from "@opencode/core/model"
import { Project } from "@opencode/core/project"
import { ProjectTable } from "@opencode/core/project/sql"
import { Provider } from "@opencode/core/provider"
import { AbsolutePath } from "@opencode/core/schema"
import { SessionHistory } from "@opencode/core/session/history"
import { SessionMessage } from "@opencode/core/session/message"
import { SessionSchema } from "@opencode/core/session/schema"
import { SessionMessageTable, SessionTable } from "@opencode/core/session/sql"
import { testEffect } from "./lib/effect"

const it = testEffect(AppNodeBuilder.build(LayerNode.group([Database.node])))
const sessionID = SessionSchema.ID.make("ses_open_tools")
const model = { id: Model.ID.make("model"), providerID: Provider.ID.make("provider") }
const encodeMessage = Schema.encodeSync(SessionMessage.Info)
const created = DateTime.makeUnsafe(0)

const messageRow = (id: SessionMessage.ID, seq: number, message: SessionMessage.Info) => {
  const { id: _, type, ...data } = encodeMessage(message)
  return { id, session_id: sessionID, type, seq, time_created: DateTime.toEpochMillis(created), data }
}

const assistant = (id: string, content: SessionMessage.Assistant["content"]) =>
  SessionMessage.Assistant.make({
    id: SessionMessage.ID.make(id),
    type: "assistant",
    agent: Agent.defaultID,
    model,
    content,
    time: { created },
  })

const completedTool = (id: string) =>
  SessionMessage.AssistantTool.make({
    type: "tool",
    id,
    name: "echo",
    state: SessionMessage.ToolStateCompleted.make({
      status: "completed",
      input: { text: "done" },
      content: [{ type: "text", text: "ok" }],
    }),
    time: { created, completed: created },
  })

const runningTool = (id: string) =>
  SessionMessage.AssistantTool.make({
    type: "tool",
    id,
    name: "echo",
    state: SessionMessage.ToolStateRunning.make({ status: "running", input: { text: "stale" }, metadata: {} }),
    time: { created },
  })

const streamingTool = (id: string) =>
  SessionMessage.AssistantTool.make({
    type: "tool",
    id,
    name: "echo",
    state: SessionMessage.ToolStateStreaming.make({ status: "streaming", input: "" }),
    time: { created },
  })

const seed = Effect.fnUntraced(function* () {
  const db = (yield* Database.Service).db
  yield* db
    .insert(ProjectTable)
    .values({ id: Project.ID.global, worktree: AbsolutePath.make("/project"), sandboxes: [] })
    .run()
  yield* db
    .insert(SessionTable)
    .values({
      id: sessionID,
      project_id: Project.ID.global,
      slug: "open-tools",
      directory: "/project",
      version: "test",
    })
    .run()
  return db
})

describe("SessionHistory AP-ENGINE-E08 structured recent", () => {
  it.effect("expands recentMessageIDs after the checkpoint and clears the string dump", () =>
    Effect.gen(function* () {
      const e08Session = SessionSchema.ID.make("ses_e08_structured")
      const db = (yield* Database.Service).db
      yield* db
        .insert(ProjectTable)
        .values({ id: Project.ID.global, worktree: AbsolutePath.make("/project"), sandboxes: [] })
        .run()
      yield* db
        .insert(SessionTable)
        .values({
          id: e08Session,
          project_id: Project.ID.global,
          slug: "e08-structured",
          directory: "/project",
          version: "test",
        })
        .run()
      const row = (id: SessionMessage.ID, seq: number, message: SessionMessage.Info) => {
        const { id: _, type, ...data } = encodeMessage(message)
        return { id, session_id: e08Session, type, seq, time_created: DateTime.toEpochMillis(created), data }
      }
      const userID = SessionMessage.ID.make("msg_e08_user")
      const assistantID = SessionMessage.ID.make("msg_e08_assistant")
      const checkpointID = SessionMessage.ID.make("msg_e08_compaction")
      const afterID = SessionMessage.ID.make("msg_e08_after")
      const user = SessionMessage.User.make({
        id: userID,
        type: "user",
        text: "Keep me structured",
        time: { created },
      })
      const assistantMsg = assistant("msg_e08_assistant", [completedTool("call_e08")])
      yield* db
        .insert(SessionMessageTable)
        .values([
          row(userID, 1, user),
          row(assistantID, 2, assistantMsg),
          row(
            checkpointID,
            3,
            SessionMessage.CompactionCompleted.make({
              id: checkpointID,
              type: "compaction",
              status: "completed",
              reason: "auto",
              summary: "## Objective\n- e08",
              recent: "[User]: Keep me structured\n\n[Assistant tool call]: echo(...)",
              recentMessageIDs: [userID, assistantID],
              time: { created },
            }),
          ),
          row(
            afterID,
            4,
            SessionMessage.User.make({
              id: afterID,
              type: "user",
              text: "After compact",
              time: { created },
            }),
          ),
        ])
        .run()
        .pipe(Effect.orDie)

      const history = yield* SessionHistory.load(db, e08Session, "latest")
      expect(history.map((message) => message.id)).toEqual([checkpointID, userID, assistantID, afterID])
      const checkpoint = history[0]
      expect(checkpoint?.type).toBe("compaction")
      if (checkpoint?.type === "compaction" && checkpoint.status === "completed") {
        expect(checkpoint.recent).toBe("")
        expect(checkpoint.recentMessageIDs).toEqual([userID, assistantID])
      }
      expect(history[2]?.type).toBe("assistant")
    }),
  )
})

describe("SessionHistory.assistantsWithOpenTools", () => {
  it.effect("returns only assistants with streaming or running tools", () =>
    Effect.gen(function* () {
      const db = yield* seed()
      const settled = SessionMessage.ID.make("msg_settled")
      const running = SessionMessage.ID.make("msg_running")
      const streaming = SessionMessage.ID.make("msg_streaming")
      const textOnly = SessionMessage.ID.make("msg_text")
      yield* db
        .insert(SessionMessageTable)
        .values([
          messageRow(settled, 1, assistant("msg_settled", [completedTool("call_done")])),
          messageRow(running, 2, assistant("msg_running", [runningTool("call_running")])),
          messageRow(streaming, 3, assistant("msg_streaming", [streamingTool("call_streaming")])),
          messageRow(textOnly, 4, assistant("msg_text", [{ type: "text", text: "hello" }])),
        ])
        .run()
        .pipe(Effect.orDie)

      const open = yield* SessionHistory.assistantsWithOpenTools(db, sessionID)
      expect(open.map((message) => message.id)).toEqual([running, streaming])
    }),
  )

  it.effect("ignores open tools behind a completed compaction boundary", () =>
    Effect.gen(function* () {
      const db = yield* seed()
      const orphan = SessionMessage.ID.make("msg_orphan")
      const checkpoint = SessionMessage.ID.make("msg_compaction")
      const fresh = SessionMessage.ID.make("msg_fresh")
      yield* db
        .insert(SessionMessageTable)
        .values([
          messageRow(orphan, 1, assistant("msg_orphan", [runningTool("call_orphan")])),
          messageRow(
            checkpoint,
            2,
            SessionMessage.CompactionCompleted.make({
              id: checkpoint,
              type: "compaction",
              status: "completed",
              reason: "auto",
              summary: "checkpoint",
              recent: "",
              time: { created },
            }),
          ),
          messageRow(fresh, 3, assistant("msg_fresh", [runningTool("call_fresh")])),
        ])
        .run()
        .pipe(Effect.orDie)

      const open = yield* SessionHistory.assistantsWithOpenTools(db, sessionID)
      expect(open.map((message) => message.id)).toEqual([fresh])
    }),
  )
})
