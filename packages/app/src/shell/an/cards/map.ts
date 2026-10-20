import type { SessionMessageAssistantTool, SessionMessageInfo } from "@opencode/client/promise"
import type { AnAttentionItem, AnRosterMember } from "../types"
import type {
  AnCardModel,
  AnCardPreviewKind,
  AnCardStatusTone,
  AnComputerEventDensity,
} from "./types"

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
        stubReason: "Part stays interactive in Conversation — card is AN language chrome.",
      },
    ],
  }
}

/** Surface in Conversation (or legacy Mission stack): active tools, errors, completed edits — not quiet reads. */
export function shouldSurfaceToolCard(tool: SessionMessageAssistantTool): boolean {
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
      if (!shouldSurfaceToolCard(part)) continue
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

/**
 * AP-STAGE5-01/02 Option C: stream Computer card residency.
 * Conversation only, and only when relevant (Live / feed / Takeover lock) or quiet entry.
 * View / Takeover keep ONE live panel — never duplicate a Computer card in the stream.
 * Status/Inline densities are event cards, not shell modes.
 */
export function shouldIncludeComputerStreamCard(input?: {
  shellMode?: string
  live?: boolean
  feedActive?: boolean
  userControl?: boolean
  /** Quiet Status entry: bot using / user asked / Live attach offer (Conversation-only). */
  quietEntry?: boolean
}): boolean {
  const mode = input?.shellMode
  if (mode === "view" || mode === "takeover") return false
  if (input?.quietEntry) return true
  return !!(input?.live || input?.feedActive || input?.userControl)
}

/** User intent phrases that request Computer (quiet entry — not wallpaper). */
const COMPUTER_ASK_RE =
  /\b(computer\s*view|take\s*control|takeover|go\s*live|attach(\s+(a|the|my))?\s*(browser|computer)|open(\s+(the|a))?\s*(computer|browser|side\s*panel)|use(\s+(the|a))?\s*(computer|browser)|watch(\s+(the|a))?\s*(screen|browser|computer))\b/i

/**
 * AP-STAGE5-02: recent user turns asked for Computer / attach / Takeover.
 * Lookback caps wallpaper risk from ancient transcript noise.
 */
export function userAskedComputerFromMessages(
  messages: readonly SessionMessageInfo[] | undefined,
  lookback = 8,
): boolean {
  if (!messages?.length) return false
  let seen = 0
  for (let i = messages.length - 1; i >= 0 && seen < lookback; i--) {
    const msg = messages[i]
    if (!msg || msg.type !== "user") continue
    seen++
    const text = typeof msg.text === "string" ? msg.text : ""
    if (text && COMPUTER_ASK_RE.test(text)) return true
  }
  return false
}

/** Bot holds / may drive Live computer (Status density — not permanent wallpaper). */
export function isBotUsingComputer(input?: {
  live?: boolean
  controller?: "none" | "bot" | "user"
  userControl?: boolean
}): boolean {
  if (!input?.live) return false
  if (input.userControl || input.controller === "user") return false
  return input.controller === "bot" || input.controller === "none" || input.controller === undefined
}

/**
 * AP-STAGE5-02 quiet Computer entry (Status density).
 * True for: Live attach offer (consenting), bot using computer, or user asked.
 * Idle disconnected Conversation stays quiet — no ambient wallpaper.
 */
export function isQuietComputerEntry(input?: {
  attachPhase?: "disconnected" | "consenting" | "attached"
  botUsingComputer?: boolean
  userAskedComputer?: boolean
}): boolean {
  if (input?.attachPhase === "consenting") return true
  if (input?.botUsingComputer) return true
  if (input?.userAskedComputer) return true
  return false
}

/** Agent switch in assistant turns — real Team handoff (not roster wallpaper). */
export type AnTeamHandoff = {
  fromAgent: string
  toAgent: string
}

export function detectTeamHandoff(
  messages: readonly SessionMessageInfo[] | undefined,
): AnTeamHandoff | undefined {
  if (!messages?.length) return undefined
  let lastAgent: string | undefined
  for (const msg of messages) {
    if (!msg || msg.type !== "assistant") continue
    const agent = typeof msg.agent === "string" ? msg.agent.trim() : ""
    if (!agent) continue
    if (lastAgent && lastAgent !== agent) {
      return { fromAgent: lastAgent, toAgent: agent }
    }
    lastAgent = agent
  }
  return undefined
}

/** Team stream card only on real handoffs (or explicit includeTeam). */
export function shouldIncludeTeamStreamCard(input?: {
  includeTeam?: boolean
  teamHandoff?: boolean | AnTeamHandoff
}): boolean {
  if (input?.includeTeam === true) return true
  if (input?.includeTeam === false) return false
  return !!input?.teamHandoff
}

function teammateLabel(id: string, members: readonly AnRosterMember[]): string {
  const hit = members.find((m) => m.id === id || m.name.toLowerCase() === id.toLowerCase())
  return hit?.name?.trim() || id
}

/**
 * AP-STAGE5-03 Option C: Inline when Live + feed (denser preview);
 * Status for quiet entry / Live without feed — never a fourth shell mode.
 */
export function resolveComputerCardDensity(input?: {
  live?: boolean
  feedActive?: boolean
}): AnComputerEventDensity {
  if (input?.live && input?.feedActive) return "inline"
  return "status"
}

/** Stream Computer card (Status/Inline density) — never titled "Computer View". */
export function computerToCard(input?: {
  live?: boolean
  feedActive?: boolean
  /** AP-BF-03: user holds control lock (Takeover). */
  userControl?: boolean
  /** AP-STAGE5-02: consenting = Live attach offer quiet entry. */
  attachPhase?: "disconnected" | "consenting" | "attached"
  /** Watch-only feed URL for Inline preview (never widens scope). */
  feedUrl?: string
  /** Workspace srcdoc present — Inline shows labeled preview honesty. */
  feedSrcdoc?: boolean | string
  /** Force density; default from Live+feed. */
  eventDensity?: AnComputerEventDensity
  title?: string
  detail?: string
}): AnCardModel {
  const live = !!input?.live
  const feedActive = !!input?.feedActive
  const userControl = !!input?.userControl
  const consenting = input?.attachPhase === "consenting"
  const eventDensity = input?.eventDensity ?? resolveComputerCardDensity({ live, feedActive })
  const feedUrl = typeof input?.feedUrl === "string" ? input.feedUrl.trim() : ""
  const hasSrcdoc =
    typeof input?.feedSrcdoc === "string" ? input.feedSrcdoc.trim().length > 0 : !!input?.feedSrcdoc
  const previewKind: AnCardPreviewKind =
    eventDensity !== "inline"
      ? "none"
      : feedUrl
        ? "url"
        : hasSrcdoc
          ? "srcdoc"
          : feedActive
            ? "pending"
            : "none"
  const previewLabel =
    previewKind === "url"
      ? "Watch-only inline preview"
      : previewKind === "srcdoc"
        ? "Watch-only workspace preview"
        : previewKind === "pending"
          ? "Watch-only preview · feed pending"
          : undefined
  const detailDefault = !live
    ? consenting
      ? "Live attach offer — confirm a local browser workspace to go Live."
      : "No live attach — connect a local browser workspace to go Live."
    : userControl
      ? "You hold the control lock (Takeover). Bot is paused until Hand back or Stop."
      : eventDensity === "inline"
        ? "Inline Live preview in Conversation — Open in Computer View or Take control (view-only until Takeover)."
        : feedActive
          ? "Local browser workspace attached with watch-only page feed. Bot holds the lock; Bot cursor is overlay chrome only."
          : "Local browser workspace attached (consented). Page feed pending."
  const actions: AnCardModel["actions"] = [
    {
      id: "view",
      label: "Open in Computer View",
      variant: "secondary",
      // Mode switch is always available; Live gate lives on Takeover / attach.
    },
  ]
  if (eventDensity === "inline") {
    actions.push({
      id: "take-control",
      label: "Take control",
      variant: "primary",
      stub: !live || userControl,
      stubReason: !live
        ? "Attach a Live browser workspace before Takeover."
        : userControl
          ? "Already in Takeover — use Hand back on the mode dock."
          : undefined,
    })
  }
  return {
    id: eventDensity === "inline" ? "computer:inline" : "computer:status",
    type: "computer",
    title: input?.title?.trim() || "Computer",
    detail: input?.detail?.trim() || detailDefault,
    status: live ? (userControl ? "You control" : "Live") : consenting ? "Attach offer" : "Unavailable",
    statusTone: live ? "ok" : consenting ? "warn" : "neutral",
    source: "computer",
    eventDensity,
    previewUrl: previewKind === "url" ? feedUrl : undefined,
    previewKind,
    previewLabel,
    meta: eventDensity === "inline" ? "Inline" : eventDensity === "status" ? "Status" : undefined,
    actions,
  }
}

/** Roster → Team card summary (Configure stub). Prefer teamHandoffToCard for real handoffs. */
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
        // AP-STAGE4-NEW-TEAMMATE: session-layout opens New teammate / edit sheet.
      },
      {
        id: "new-teammate",
        label: "New teammate",
        variant: "ghost",
      },
    ],
  }
}

/** AP-STAGE5-02: Team card only when a real agent handoff is observed. */
export function teamHandoffToCard(
  handoff: AnTeamHandoff,
  members: readonly AnRosterMember[] = [],
): AnCardModel {
  const from = teammateLabel(handoff.fromAgent, members)
  const to = teammateLabel(handoff.toAgent, members)
  return {
    id: `team:handoff:${handoff.fromAgent}->${handoff.toAgent}`,
    type: "team",
    title: "Team handoff",
    detail: `${from} → ${to}`,
    status: "Handoff",
    statusTone: "ok",
    source: "roster",
    members: members.slice(0, 6).map((m) => ({ id: m.id, name: m.name, avatar: m.avatar })),
    actions: [
      {
        id: "configure",
        label: "Configure",
        variant: "primary",
      },
      {
        id: "new-teammate",
        label: "New teammate",
        variant: "ghost",
      },
    ],
  }
}

/**
 * Build stream card stack for AnShell — real sources only.
 * AP-STAGE5-01/02 Option C: Computer/Team are NOT wallpaper — Computer when relevant; Team on handoffs only.
 */
export function buildStreamCards(input: {
  attention?: readonly AnAttentionItem[]
  roster?: readonly AnRosterMember[]
  session?: { sessionID?: string; title?: string; agent?: string; working?: boolean }
  messages?: readonly SessionMessageInfo[]
  computerLive?: boolean
  computerFeedActive?: boolean
  /** AP-BF-03: user holds Takeover control lock. */
  computerUserControl?: boolean
  /** AP-BF-03 controller for bot-using quiet entry. */
  computerController?: "none" | "bot" | "user"
  /** AP-BF-01 attach phase — consenting = Live attach offer quiet entry. */
  computerAttachPhase?: "disconnected" | "consenting" | "attached"
  /** Watch-only feed for Inline density preview. */
  computerFeedUrl?: string
  computerFeedSrcdoc?: boolean | string
  /** Shell mode — View/Takeover suppress stream Computer (one live panel). */
  shellMode?: string
  /** Explicit override; default = residency helper (relevant only). */
  includeComputer?: boolean
  quietComputerEntry?: boolean
  /** Team card only on handoffs/events (default: detect agent handoff — no wallpaper). */
  includeTeam?: boolean
  /** Explicit handoff; default = detectTeamHandoff(messages). */
  teamHandoff?: AnTeamHandoff | boolean
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
  const quietEntry =
    input.quietComputerEntry === true ||
    (input.quietComputerEntry !== false &&
      isQuietComputerEntry({
        attachPhase: input.computerAttachPhase,
        botUsingComputer: isBotUsingComputer({
          live: input.computerLive,
          controller: input.computerController,
          userControl: input.computerUserControl,
        }),
        userAskedComputer: userAskedComputerFromMessages(input.messages),
      }))
  const includeComputer =
    input.includeComputer === true ||
    (input.includeComputer !== false &&
      shouldIncludeComputerStreamCard({
        shellMode: input.shellMode,
        live: input.computerLive,
        feedActive: input.computerFeedActive,
        userControl: input.computerUserControl,
        quietEntry,
      }))
  if (includeComputer) {
    cards.push(
      computerToCard({
        live: input.computerLive,
        feedActive: input.computerFeedActive,
        userControl: input.computerUserControl,
        attachPhase: input.computerAttachPhase,
        feedUrl: input.computerFeedUrl,
        feedSrcdoc: input.computerFeedSrcdoc,
      }),
    )
  }
  const detectedHandoff =
    typeof input.teamHandoff === "object" && input.teamHandoff
      ? input.teamHandoff
      : input.teamHandoff === true
        ? undefined
        : detectTeamHandoff(input.messages)
  const includeTeam = shouldIncludeTeamStreamCard({
    includeTeam: input.includeTeam,
    teamHandoff: input.teamHandoff === true || detectedHandoff,
  })
  if (includeTeam) {
    const team = detectedHandoff
      ? teamHandoffToCard(detectedHandoff, input.roster ?? [])
      : rosterToTeamCard(input.roster ?? [])
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
