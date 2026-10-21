/**
 * FLOW-GENIUS-03/04 / Stage 6 — live mission/task fold into SessionRunner lean pack.
 *
 * Pure fold maps mission + tasks + attention cards → LeanPackInput / LeanPack.
 * Effect loader reads mission_session / mission / task / mission_event via Database
 * (same tables as Mission.Service).
 *
 * FLOW-GENIUS-04: optional MnemosynePort recall fills CitedRetrieval (bounded, sourced).
 * Auto-wire only when the session is linked to a mission. Empty / unlinked → undefined
 * (caller omits leanPack). Default port is unavailable (no host DB); inject fixture in tests.
 */
export * as SessionMissionFold from "./mission-fold.js"

import { and, asc, eq, inArray } from "drizzle-orm"
import { Effect } from "effect"
import { Database } from "../database/database.js"
import { fold as foldAttentionCards, type Card } from "../mission/cards.js"
import {
  buildRecallQuery,
  getDefaultMnemosynePort,
  recallCitedRetrieval,
  type MnemosynePort,
  type MnemosyneScope,
} from "../mission/mnemosyne-port.js"
import { MissionEventTable } from "../mission/event.sql.js"
import { MissionSchema } from "../mission/schema.js"
import { MissionSessionTable, MissionTable, TaskTable } from "../mission/sql.js"
import { SessionMessage } from "./message.js"
import {
  DEFAULT_RECENT_MESSAGES,
  assembleLeanPack,
  type CitedRetrieval,
  type DecisionFact,
  type DoneFact,
  type LeanPack,
  type LeanPackInput,
  type MessageFact,
  type PendingFact,
  type TaskCardFact,
} from "./lean-pack.js"

const ATTENTION_TYPES: ReadonlyArray<MissionSchema.MissionEventType> = [
  "coordination.attention",
  "attention.resolved",
]

const FOCUS_ORDER: ReadonlyArray<MissionSchema.TaskState> = [
  "in_progress",
  "review",
  "pending",
  "blocked",
]

export type MissionFoldMission = {
  readonly id: string
  readonly title: string
  readonly state: string
}

export type MissionFoldTask = {
  readonly id: string
  readonly title: string
  readonly state: MissionSchema.TaskState | string
  readonly ownerId?: string
  readonly revision?: number
}

export type MissionFoldCard = {
  readonly title: string
  readonly body: string
  readonly state: "open" | "resolved"
  readonly resolution?: string
  readonly taskId?: string
}

export type MissionFoldFacts = {
  readonly mission: MissionFoldMission
  readonly tasks: ReadonlyArray<MissionFoldTask>
  readonly cards?: ReadonlyArray<MissionFoldCard>
  readonly messages?: ReadonlyArray<MessageFact>
  readonly recentMessageLimit?: number
  /**
   * When true, lean pack skips Recent messages (SessionRunner / Generate transcript
   * already carries those turns via toLLMMessages).
   */
  readonly omitRecent?: boolean
  readonly focusTaskId?: string
  /** Explicit retrieval (tests); when omitted, optional mnemosyne port may recall. */
  readonly retrieval?: ReadonlyArray<CitedRetrieval>
  readonly mnemosyne?: MnemosynePort
  readonly retrievalScope?: MnemosyneScope
  readonly retrievalLimit?: number
}

const isTerminal = (state: string) => state === "verified" || state === "cancelled"

/** Pick the task card to feature: explicit focus, else FOCUS_ORDER, else first non-cancelled. */
export function selectFocusTask(
  tasks: ReadonlyArray<MissionFoldTask>,
  focusTaskId?: string,
): MissionFoldTask | undefined {
  if (focusTaskId) {
    const hit = tasks.find((t) => t.id === focusTaskId)
    if (hit) return hit
  }
  for (const state of FOCUS_ORDER) {
    const hit = tasks.find((t) => t.state === state)
    if (hit) return hit
  }
  return tasks.find((t) => t.state !== "cancelled")
}

function taskCardOf(task: MissionFoldTask): TaskCardFact {
  return {
    id: task.id,
    title: task.title,
    state: task.state,
    owner: task.ownerId,
    body:
      task.revision !== undefined
        ? `Revision ${task.revision}. Mission fold auto-wired for SessionRunner lean pack.`
        : "Mission fold auto-wired for SessionRunner lean pack.",
  }
}

function decisionsFromCards(cards: ReadonlyArray<MissionFoldCard>): DecisionFact[] {
  return cards
    .filter((c) => c.state === "resolved")
    .map((c) => {
      const resolution = c.resolution?.trim()
      const body = c.body.trim()
      const text = resolution
        ? `${c.title}: ${resolution}`
        : body.length > 0
          ? `${c.title}: ${body}`
          : c.title
      return { text }
    })
    .filter((d) => d.text.trim().length > 0)
}

function constraintsFromFacts(
  tasks: ReadonlyArray<MissionFoldTask>,
  cards: ReadonlyArray<MissionFoldCard>,
): { text: string }[] {
  const fromCards = cards
    .filter((c) => c.state === "open")
    .map((c) => {
      const body = c.body.trim()
      return { text: body.length > 0 ? `Open attention — ${c.title}: ${body}` : `Open attention — ${c.title}` }
    })
  const fromBlocked = tasks
    .filter((t) => t.state === "blocked")
    .map((t) => ({ text: `Blocked task ${t.id}: ${t.title}` }))
  return [...fromCards, ...fromBlocked]
}

/**
 * Pure: mission/task/attention facts → LeanPackInput (Stage 6 sections).
 * Retrieval: explicit facts.retrieval, else MnemosynePort recall (no invented hits).
 */
export function foldMissionLeanInput(facts: MissionFoldFacts): LeanPackInput {
  const cards = facts.cards ?? []
  const pending: PendingFact[] = facts.tasks
    .filter((t) => !isTerminal(t.state))
    .map((t) => ({ id: t.id, title: t.title, state: t.state }))
  const done: DoneFact[] = facts.tasks
    .filter((t) => t.state === "verified")
    .map((t) => ({
      id: t.id,
      title: t.title,
      evidence: t.revision !== undefined ? `verified rev ${t.revision}` : "verified",
    }))
  const focus = selectFocusTask(facts.tasks, facts.focusTaskId)
  const objective = `${facts.mission.title} [${facts.mission.state}] (${facts.mission.id})`

  let retrieval: CitedRetrieval[] = facts.retrieval ? [...facts.retrieval] : []
  if (retrieval.length === 0 && facts.mnemosyne) {
    const query = buildRecallQuery({
      objective: facts.mission.title,
      taskTitle: focus?.title,
    })
    retrieval = recallCitedRetrieval(facts.mnemosyne, {
      query,
      limit: facts.retrievalLimit,
      scope: facts.retrievalScope,
    })
  }

  return {
    objective,
    decisions: decisionsFromCards(cards),
    constraints: constraintsFromFacts(facts.tasks, cards),
    pending,
    done,
    taskCard: focus ? taskCardOf(focus) : undefined,
    messages: facts.messages,
    recentMessageLimit: facts.recentMessageLimit ?? DEFAULT_RECENT_MESSAGES,
    omitRecent: facts.omitRecent,
    retrieval,
  }
}

/** Pure assemble after fold. Empty pack text when mission title is blank and nothing else lands. */
export function assembleMissionLeanPack(facts: MissionFoldFacts): LeanPack {
  return assembleLeanPack(foldMissionLeanInput(facts))
}

/**
 * Compact SessionMessage rows into MessageFact for the lean pack recent section.
 * Compaction/system messages are skipped (same honesty as compaction recent text).
 */
export function sessionMessagesToLeanFacts(
  messages: ReadonlyArray<SessionMessage.Info>,
): MessageFact[] {
  const out: MessageFact[] = []
  for (const message of messages) {
    switch (message.type) {
      case "user": {
        const text = message.text?.trim() ?? ""
        if (text.length === 0) continue
        out.push({ id: message.id, role: "user", text })
        break
      }
      case "assistant": {
        const texts = message.content
          .flatMap((part) => {
            if (part.type === "text" && part.text.trim().length > 0) return [part.text]
            if (part.type === "tool" && part.state.status === "completed") {
              const preview = part.state.content
                .map((item) => (item.type === "text" ? item.text : `[${item.mime}]`))
                .join("\n")
                .trim()
              return preview.length > 0 ? [`tool:${part.name} → ${preview}`] : [`tool:${part.name}`]
            }
            return []
          })
          .join("\n")
          .trim()
        if (texts.length === 0) continue
        out.push({ id: message.id, role: "assistant", text: texts })
        break
      }
      default:
        break
    }
  }
  return out
}

function cardFacts(cards: ReadonlyArray<Card>): MissionFoldCard[] {
  return cards.map((c) => ({
    title: c.title,
    body: c.body,
    state: c.state,
    resolution: c.resolution,
    taskId: c.taskId,
  }))
}

export type LoadedMissionLeanPack = {
  readonly pack: LeanPack
  readonly missionId: string
  readonly taskCount: number
  readonly cardCount: number
  readonly retrievalCount: number
  readonly mnemosyneAvailability: ReturnType<MnemosynePort["availability"]>
}

/**
 * Load mission fold for a session and assemble the lean pack.
 * Returns undefined when the session has no mission link (honest no-op).
 * Mnemosyne: uses input.mnemosyne or getDefaultMnemosynePort() (built-in DEV-local available by default).
 */
export const loadLeanPackForSession = Effect.fn("SessionMissionFold.loadLeanPackForSession")(function* (input: {
  readonly sessionID: string
  readonly messages?: ReadonlyArray<SessionMessage.Info>
  readonly recentMessageLimit?: number
  /**
   * Default: omit recent when `messages` are supplied (SessionRunner / Generate
   * already put those turns on the transcript). Pass `false` to force recent in pack.
   */
  readonly omitRecent?: boolean
  readonly focusTaskId?: string
  readonly mnemosyne?: MnemosynePort
  readonly retrievalScope?: MnemosyneScope
  readonly retrievalLimit?: number
}) {
  const db = (yield* Database.Service).db
  const mnemosyne = input.mnemosyne ?? getDefaultMnemosynePort()

  const link = yield* db
    .select({ mission_id: MissionSessionTable.mission_id })
    .from(MissionSessionTable)
    .where(eq(MissionSessionTable.session_id, input.sessionID))
    .orderBy(asc(MissionSessionTable.time_created))
    .get()
    .pipe(Effect.orDie)

  if (!link) return undefined as LoadedMissionLeanPack | undefined

  const missionRow = yield* db
    .select()
    .from(MissionTable)
    .where(eq(MissionTable.id, link.mission_id))
    .get()
    .pipe(Effect.orDie)

  if (!missionRow) return undefined as LoadedMissionLeanPack | undefined

  const taskRows = yield* db
    .select()
    .from(TaskTable)
    .where(eq(TaskTable.mission_id, missionRow.id))
    .orderBy(asc(TaskTable.time_created))
    .all()
    .pipe(Effect.orDie)

  const eventRows = yield* db
    .select()
    .from(MissionEventTable)
    .where(
      and(
        eq(MissionEventTable.mission_id, missionRow.id),
        inArray(MissionEventTable.type, [...ATTENTION_TYPES]),
      ),
    )
    .orderBy(asc(MissionEventTable.seq))
    .all()
    .pipe(Effect.orDie)

  const events: MissionSchema.MissionEvent[] = eventRows.map((row) => ({
    seq: row.seq,
    id: row.id,
    missionId: row.mission_id ?? undefined,
    taskId: row.task_id ?? undefined,
    correlationId: row.correlation_id,
    type: row.type,
    actor: row.actor,
    payload: row.payload,
    idempotencyKey: row.idempotency_key,
    createdAt: row.time_created,
  }))

  const cards = foldAttentionCards(events)
  const hasTranscriptMessages = (input.messages?.length ?? 0) > 0
  const omitRecent = input.omitRecent ?? hasTranscriptMessages
  const facts: MissionFoldFacts = {
    mission: {
      id: missionRow.id,
      title: missionRow.title,
      state: missionRow.state,
    },
    tasks: taskRows.map((row) => ({
      id: row.id,
      title: row.title,
      state: row.state,
      ownerId: row.owner_id ?? undefined,
      revision: row.revision,
    })),
    cards: cardFacts(cards),
    messages: input.messages ? sessionMessagesToLeanFacts(input.messages) : undefined,
    recentMessageLimit: input.recentMessageLimit,
    omitRecent,
    focusTaskId: input.focusTaskId,
    mnemosyne,
    retrievalScope: input.retrievalScope,
    retrievalLimit: input.retrievalLimit,
  }

  const leanInput = foldMissionLeanInput(facts)
  const pack = assembleLeanPack(leanInput)
  if (pack.text.trim().length === 0) return undefined as LoadedMissionLeanPack | undefined

  return {
    pack,
    missionId: missionRow.id,
    taskCount: taskRows.length,
    cardCount: cards.length,
    retrievalCount: leanInput.retrieval?.length ?? 0,
    mnemosyneAvailability: mnemosyne.availability(),
  } satisfies LoadedMissionLeanPack
})
