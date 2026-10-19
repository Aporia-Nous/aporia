import type { AnAttentionItem, AnRosterMember } from "../types"
import type { AnCardModel } from "./types"

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
  computerLive?: boolean
  includeTeam?: boolean
}): AnCardModel[] {
  const cards: AnCardModel[] = []
  const task = sessionToTaskCard(input.session ?? {})
  if (task) cards.push(task)
  cards.push(...attentionToApprovalCards(input.attention ?? []))
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
