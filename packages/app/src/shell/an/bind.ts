import type { AnPresence } from "./tokens"
import type { AnAttentionItem, AnMissionHeader, AnRosterMember } from "./types"

/** Bot shape from the desktop teammates bridge (subset used by the shell roster). */
export type AnBindBot = {
  slug: string
  name: string
  role: string
  avatar?: string
}

export type AnBindAttentionCard = {
  id: string
  title: string
  body?: string
  missionId?: string
}

/** Map desktop bots → roster rows. Presence is working only when a matching session is running; else unknown. */
export function botsToRoster(input: {
  bots: readonly AnBindBot[]
  currentAgent?: string
  /** agent id → session status string (e.g. "running") */
  agentStatus?: ReadonlyMap<string, string> | Record<string, string>
}): AnRosterMember[] {
  const statusOf = (agent: string): string | undefined => {
    const map = input.agentStatus
    if (!map) return undefined
    if (map instanceof Map) return map.get(agent)
    return map[agent]
  }
  return input.bots.map((bot) => {
    const agent = `aporia-${bot.slug}`
    const status = statusOf(agent)
    const presence: AnPresence = status === "running" ? "working" : "unknown"
    return {
      id: bot.slug,
      name: bot.name || bot.slug,
      role: bot.role?.trim() || "Teammate",
      avatar: bot.avatar,
      presence,
      selected: input.currentAgent === agent,
    }
  })
}

/** Map mission attention cards → shell attention items. No invented blockers. */
export function attentionCardsToItems(cards: readonly AnBindAttentionCard[]): AnAttentionItem[] {
  return cards.map((card) => ({
    id: card.id,
    title: card.title?.trim() || "Attention",
    detail: card.body?.trim() || undefined,
    kind: "approval",
  }))
}

/** Mission header from live session info. Omits progress when task progress is unavailable.
 *  Pills: Local is real for desktop; Private/Efficient/Verified stay marked unavailable (no fake telemetry). */
export function missionFromSession(input: {
  title?: string
  agent?: string
  directory?: string
  working?: boolean
}): AnMissionHeader {
  const title = input.title?.trim() || input.agent?.trim() || "Mission"
  const subtitleParts = [input.agent?.trim(), input.directory?.trim()].filter(Boolean)
  const pills: AnMissionHeader["pills"] = [
    { label: "Local", tone: "ok" },
    { label: "Private · unavailable", tone: "neutral" },
    { label: "Efficient · unavailable", tone: "neutral" },
    { label: "Verified · unavailable", tone: "neutral" },
  ]
  if (input.working) pills.unshift({ label: "Working", tone: "ok" })
  return {
    title,
    subtitle: subtitleParts.length ? subtitleParts.join(" · ") : undefined,
    pills,
  }
}

export type AnRosterBindResult = {
  roster: AnRosterMember[]
  /** Honest empty/unavailable copy for the roster list footer or empty state. */
  emptyReason?: string
}

export function rosterBindResult(input: {
  available: boolean
  bots: readonly AnBindBot[]
  currentAgent?: string
  agentStatus?: ReadonlyMap<string, string> | Record<string, string>
}): AnRosterBindResult {
  if (!input.available) {
    return {
      roster: [],
      emptyReason: "Teammate roster unavailable (desktop bridge not connected).",
    }
  }
  const roster = botsToRoster(input)
  if (roster.length === 0) {
    return { roster, emptyReason: "No teammates yet." }
  }
  return { roster }
}

export type AnAttentionBindResult = {
  attention: AnAttentionItem[]
  emptyMessage: string
}

export function attentionBindResult(input: {
  available: boolean
  error?: string
  cards: readonly AnBindAttentionCard[]
}): AnAttentionBindResult {
  if (!input.available) {
    return {
      attention: [],
      emptyMessage: "Attention unavailable (mission API not connected).",
    }
  }
  if (input.error) {
    return {
      attention: [],
      emptyMessage: `Attention unavailable (${input.error}).`,
    }
  }
  return {
    attention: attentionCardsToItems(input.cards),
    emptyMessage: "No blockers right now.",
  }
}

/** Mission-switch survival: shell is presentational chrome only; draft/scroll live in ComposerPersistenceProvider + session tabs. */
export function anShellMissionSwitchNote() {
  return "AnShell does not own composer/scroll state; Mission A→B→A survival uses existing tab + ComposerPersistenceProvider patterns."
}
