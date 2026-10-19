import type { SessionMessageAssistantTool, SessionMessageInfo } from "@opencode/client/promise"
import type { AnAttentionItem, AnRosterMember } from "../types"
import type { AnCardModel, AnCardStatusTone } from "./types"

/** Tool names that map to Proof cards when completed (file edits / writes). */
const EDIT_TOOL_NAMES = new Set([
  "edit",
  "write",
  "apply_patch",
  "applypatch",
  "str_replace",
  "multiedit",
  "create",
  "create_file",
  "patch",
])

const PART_CARD_LIMIT = 6

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function toolInputRecord(tool: SessionMessageAssistantTool): Record<string, unknown> | undefined {
  const state = tool.state
  if (state.status === "streaming") return undefined
  return isRecord(state.input) ? state.input : undefined
}

function toolDetailFromInput(input: Record<string, unknown> | undefined, streaming?: string): string | undefined {
  if (streaming?.trim()) return streaming.trim().slice(0, 160)
  if (!input) return undefined
  for (const key of ["path", "file_path", "filePath", "description", "query", "command", "pattern", "url", "name"]) {
    const value = input[key]
    if (typeof value === "string" && value.trim()) return value.trim().slice(0, 160)
  }
  return undefined
}

function isEditTool(name: string): boolean {
  const key = name.trim().toLowerCase().replace(/[\s-]+/g, "_")
  return EDIT_TOOL_NAMES.has(key)
}

function toolStatusLabel(status: SessionMessageAssistantTool["state"]["status"]): {
  status: string
  tone: AnCardStatusTone
} {
  switch (status) {
    case "streaming":
      return { status: "Streaming", tone: "ok" }
    case "running":
      return { status: "Running", tone: "ok" }
    case "completed":
      return { status: "Done", tone: "ok" }
    case "error":
      return { status: "Failed", tone: "danger" }
    default: {
      const _exhaustive: never = status
      return { status: String(_exhaustive), tone: "neutral" }
    }
  }
}

/** Map a single assistant tool part → Task or Proof card (real tool data only). */
export function toolPartToCard(tool: SessionMessageAssistantTool): AnCardModel {
  const name = tool.name?.trim() || "Tool"
  const edit = isEditTool(name)
  const input = toolInputRecord(tool)
  const streaming = tool.state.status === "streaming" ? tool.state.input : undefined
  const detail = toolDetailFromInput(input, streaming)
  const { status, tone } = toolStatusLabel(tool.state.status)
  const done = tool.state.status === "completed"
  const failed = tool.state.status === "error"
  const asProof = edit && (done || failed)

  return {
    id: `tool:${tool.id}`,
    type: asProof ? "proof" : "task",
    title: asProof ? (detail ? `Edit · ${detail}` : `Edit · ${name}`) : name,
    detail: asProof
      ? failed
        ? "Edit failed — see stream for error detail."
        : "File change recorded from session tool."
      : detail,
    status,
    statusTone: tone,
    meta: asProof ? name : undefined,
    source: asProof ? "edit" : "tool",
    actions: [
      {
        id: "open",
        label: asProof ? "Open proof" : "Open in stream",
        variant: "secondary",
        stub: true,
        stubReason: "Part stays interactive in the stream below — Mission card is language chrome.",
      },
    ],
  }
}

/** Surface in Mission stack: active tools, errors, and completed edits (not every quiet read). */
function shouldSurfaceToolInMission(tool: SessionMessageAssistantTool): boolean {
  const status = tool.state.status
  if (status === "streaming" || status === "running" || status === "error") return true
  if (status === "completed" && isEditTool(tool.name)) return true
  return false
}

/** Recent tool/edit parts from session messages → AN cards (newest first, capped). */
export function messagesToPartCards(
  messages: readonly SessionMessageInfo[],
  limit = PART_CARD_LIMIT,
): AnCardModel[] {
  const tools: SessionMessageAssistantTool[] = []
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (!msg || msg.type !== "assistant") continue
    for (let j = msg.content.length - 1; j >= 0; j--) {
      const part = msg.content[j]
      if (!part || part.type !== "tool") continue
      if (!shouldSurfaceToolInMission(part)) continue
      tools.push(part)
      if (tools.length >= limit) break
    }
    if (tools.length >= limit) break
  }
  return tools.map(toolPartToCard)
}

/** User/assistant text turns stay in stream; expose honest unavailable Proof when no edit tools exist. */
export function messageProofUnavailableCard(): AnCardModel {
  return {
    id: "proof:unavailable",
    type: "proof",
    title: "Proof",
    detail: "No file-edit proof in this session yet.",
    status: "Unavailable",
    statusTone: "neutral",
    source: "message",
    actions: [
      {
        id: "unavailable",
        label: "Unavailable",
        variant: "ghost",
        stub: true,
        stubReason: "Proof cards appear when edit/write tools complete — not invented.",
      },
    ],
  }
}

/** Map mission attention → Approval cards (honest titles/details only). */
export function attentionToApprovalCards(items: readonly AnAttentionItem[]): AnCardModel[] {
  return items.map((item) => ({
    id: `attention:${item.id}`,
    type: "approval" as const,
    title: item.title?.trim() || "Approval needed",
    detail: item.detail?.trim() || undefined,
    status: "Awaiting your decision",
    statusTone: "warn" as const,
    source: "attention" as const,
    actions: [
      {
        id: "review",
        label: "Review",
        variant: "secondary" as const,
        stub: true,
        stubReason: "Attention review navigation not wired in Stage 4 cards slice.",
      },
      {
        id: "approve",
        label: "Approve",
        variant: "primary" as const,
        stub: true,
        stubReason: "Mission attention resolve not bound from stream card yet — use Attention rail when available.",
      },
    ],
  }))
}

/** Permission dock → Approval card model (actions wired by caller). */
export function permissionToApprovalCard(input: {
  id: string
  action: string
  resources?: readonly string[]
  description?: string
}): AnCardModel {
  const resources = (input.resources ?? []).filter(Boolean)
  return {
    id: `permission:${input.id}`,
    type: "approval",
    title: input.action?.trim() || "Permission request",
    detail: input.description?.trim() || (resources.length ? resources.join(" · ") : undefined),
    status: "Awaiting your decision",
    statusTone: "warn",
    meta: resources.length ? `${resources.length} resource${resources.length === 1 ? "" : "s"}` : undefined,
    source: "permission",
    actions: [
      { id: "reject", label: "Deny", variant: "ghost" },
      { id: "always", label: "Always allow", variant: "secondary" },
      { id: "once", label: "Allow once", variant: "primary" },
    ],
  }
}

/** Question dock → Decision card model (submit stays on dock / stub until bound). */
export function questionToDecisionCard(input: {
  id: string
  title?: string
  detail?: string
}): AnCardModel {
  return {
    id: `question:${input.id}`,
    type: "decision",
    title: input.title?.trim() || "Decision needed",
    detail: input.detail?.trim() || undefined,
    status: "Awaiting choice",
    statusTone: "warn",
    source: "question",
    actions: [
      {
        id: "decide",
        label: "Decide",
        variant: "primary",
        stub: true,
        stubReason: "Use the question dock options below — Decision card is visual language only until bound.",
      },
    ],
  }
}

/** Session working state → Task card (no invented progress %). */
export function sessionToTaskCard(input: {
  sessionID?: string
  title?: string
  agent?: string
  working?: boolean
}): AnCardModel | undefined {
  if (!input.working) return undefined
  return {
    id: `task:${input.sessionID ?? "session"}`,
    type: "task",
    title: input.title?.trim() || "Mission in progress",
    detail: input.agent?.trim() ? `Agent ${input.agent} is working.` : "Session is working.",
    status: "In progress",
    statusTone: "ok",
    author: input.agent,
    source: "session",
    actions: [
      {
        id: "start",
        label: "Start task",
        variant: "primary",
        stub: true,
        stubReason: "Task runner not exposed as AN card actions yet — session already working.",
      },
    ],
  }
}

/** Live computer panel → Computer card (honest idle/empty; no fake feed URL). */
export function computerToCard(input?: { live?: boolean; title?: string; detail?: string }): AnCardModel {
  const live = !!input?.live
  return {
    id: "computer:live",
    type: "computer",
    title: input?.title?.trim() || "Live computer",
    detail:
      input?.detail?.trim() ||
      (live ? "Computer feed attached." : "No live computer feed yet — surface stays visible."),
    status: live ? "Live" : "Idle",
    statusTone: live ? "ok" : "neutral",
    source: "computer",
    actions: [
      {
        id: "view",
        label: "View",
        variant: "secondary",
        stub: !live,
        stubReason: live ? undefined : "No computer session attached — View is chrome-only.",
      },
    ],
  }
}

/** Roster → Team card summary (Configure stub). */
export function rosterToTeamCard(members: readonly AnRosterMember[]): AnCardModel | undefined {
  if (members.length === 0) return undefined
  return {
    id: "team:roster",
    type: "team",
    title: "Active team",
    detail: `${members.length} teammate${members.length === 1 ? "" : "s"} in roster.`,
    status: "Roster",
    statusTone: "neutral",
    source: "roster",
    members: members.slice(0, 6).map((m) => ({ id: m.id, name: m.name, avatar: m.avatar })),
    actions: [
      {
        id: "configure",
        label: "Configure",
        variant: "primary",
        stub: true,
        stubReason: "Team configure sheet not wired — use roster to open a teammate.",
      },
    ],
  }
}

/** Build stream card stack for AnShell — real sources only; Computer always present as honest idle/live. */
export function buildStreamCards(input: {
  attention?: readonly AnAttentionItem[]
  roster?: readonly AnRosterMember[]
  session?: { sessionID?: string; title?: string; agent?: string; working?: boolean }
  messages?: readonly SessionMessageInfo[]
  computerLive?: boolean
  includeTeam?: boolean
  /** When true and no edit/proof tools exist, append honest Proof · unavailable (default false — avoid clutter). */
  includeProofUnavailable?: boolean
}): AnCardModel[] {
  const cards: AnCardModel[] = []
  const task = sessionToTaskCard(input.session ?? {})
  if (task) cards.push(task)
  cards.push(...attentionToApprovalCards(input.attention ?? []))
  const partCards = messagesToPartCards(input.messages ?? [])
  cards.push(...partCards)
  if (input.includeProofUnavailable && !partCards.some((c) => c.type === "proof")) {
    cards.push(messageProofUnavailableCard())
  }
  cards.push(computerToCard({ live: input.computerLive }))
  if (input.includeTeam !== false) {
    const team = rosterToTeamCard(input.roster ?? [])
    if (team) cards.push(team)
  }
  return cards
}

/** Mission header pills — Local is real for desktop; others marked unavailable (no fake telemetry). */
export function missionChromePills(input?: { working?: boolean }): Array<{
  label: string
  tone?: "neutral" | "ok" | "warn"
}> {
  const pills: Array<{ label: string; tone?: "neutral" | "ok" | "warn" }> = [
    { label: "Local", tone: "ok" },
    { label: "Private · unavailable", tone: "neutral" },
    { label: "Efficient · unavailable", tone: "neutral" },
    { label: "Verified · unavailable", tone: "neutral" },
  ]
  if (input?.working) pills.unshift({ label: "Working", tone: "ok" })
  return pills
}
