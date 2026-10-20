import type { SessionMessageInfo } from "@opencode/client/promise"
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

/** Real signals used to resolve presence — omit fields when unavailable. */
export type AnPresenceSignal = {
  /** Session status string (e.g. "running" when busy, "idle" when ready). */
  sessionStatus?: string
  /**
   * Finer activity while a session is busy.
   * Derived from message parts only — never invented.
   */
  activity?: "tool" | "stream" | "reasoning" | "none"
  /**
   * Voice-call engine state when the call is bound to this agent.
   * Only pass when `call.active` and agent is the call target.
   */
  callState?: "idle" | "connecting" | "listening" | "thinking" | "speaking" | "error"
  /** Permission / attention awaiting the user for this agent's session. */
  awaitingUser?: boolean
  /**
   * Companion is known from a real source (desktop roster / session row).
   * With no busy/wait/call activity → design `listening`, not `unknown`.
   */
  known?: boolean
}

/**
 * Map real session/call signals → design presence (five-state + unknown escape).
 * Priority: call speaking/thinking/listening → connecting → waiting → tool → stream →
 * reasoning → busy → known idle/ready → unknown.
 * Known idle companions → `listening`. `unknown` only when no honest signal.
 */
export function resolveAnPresence(signal: AnPresenceSignal = {}): AnPresence {
  const call = signal.callState
  if (call === "listening") return "listening"
  if (call === "thinking") return "thinking"
  if (call === "speaking") return "speaking"
  if (call === "connecting") return "thinking"
  if (call === "error") return "unknown"

  if (signal.awaitingUser) return "waiting"

  const status = (signal.sessionStatus ?? "").trim().toLowerCase()
  const busy = status === "running" || status === "busy"
  if (busy) {
    switch (signal.activity) {
      case "tool":
        return "working"
      case "stream":
        return "speaking"
      case "reasoning":
        return "thinking"
      case "none":
      case undefined:
        // Busy without finer parts — honest generic "thinking" (model turn in flight).
        return "thinking"
      default: {
        const _exhaustive: never = signal.activity
        void _exhaustive
        return "thinking"
      }
    }
  }

  // Known ready companion (session idle, call idle, or roster-listed) → listening.
  if (status === "idle" || status === "ready" || call === "idle" || signal.known === true) {
    return "listening"
  }

  return "unknown"
}

/** Scan newest assistant message for active tool / stream / reasoning parts. */
export function sessionActivityFromMessages(messages: readonly SessionMessageInfo[]): AnPresenceSignal["activity"] {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (!msg || msg.type !== "assistant") continue
    if (msg.time?.completed) continue

    let sawReasoning = false
    let sawStream = false
    for (const part of msg.content) {
      if (!part) continue
      if (part.type === "tool") {
        const status = part.state?.status
        if (status === "running" || status === "streaming") return "tool"
      } else if (part.type === "reasoning") {
        if (!part.time?.completed) sawReasoning = true
      } else if (part.type === "text") {
        if (typeof part.text === "string" && part.text.length > 0) sawStream = true
      }
    }
    if (sawStream) return "stream"
    if (sawReasoning) return "reasoning"
    return "none"
  }
  return "none"
}

/** Map desktop bots → roster rows. Presence from real signals only. */
export function botsToRoster(input: {
  bots: readonly AnBindBot[]
  currentAgent?: string
  /** agent id → presence signal (preferred) */
  agentSignals?: ReadonlyMap<string, AnPresenceSignal> | Record<string, AnPresenceSignal>
  /**
   * Legacy: agent id → session status string (e.g. "running").
   * Used when `agentSignals` omits an agent.
   */
  agentStatus?: ReadonlyMap<string, string> | Record<string, string>
}): AnRosterMember[] {
  const signalOf = (agent: string): AnPresenceSignal => {
    const map = input.agentSignals
    if (map) {
      const fromMap = map instanceof Map ? map.get(agent) : map[agent]
      if (fromMap) return fromMap
    }
    const statusMap = input.agentStatus
    if (!statusMap) return {}
    const status = statusMap instanceof Map ? statusMap.get(agent) : statusMap[agent]
    return status ? { sessionStatus: status } : {}
  }
  return input.bots.map((bot) => {
    const agent = `aporia-${bot.slug}`
    const raw = signalOf(agent)
    // Listed teammate from the desktop bridge is a known companion — missing
    // session row is idle/listening, not Unknown.
    const signal: AnPresenceSignal = { ...raw, known: true }
    return {
      id: bot.slug,
      name: bot.name || bot.slug,
      role: bot.role?.trim() || "Teammate",
      avatar: bot.avatar,
      presence: resolveAnPresence(signal),
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
  agentSignals?: ReadonlyMap<string, AnPresenceSignal> | Record<string, AnPresenceSignal>
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

/** Mission-switch survival: draft/scroll via ComposerPersistenceProvider + AnShell maps (localStorage for quit/reopen). */
export function anShellMissionSwitchNote() {
  return "Mission A→B→A + quit/reopen uses ComposerPersistenceProvider + AP-STAGE4-B1 anDraftSwitch + AP-STAGE4-MISSION-RESTART an.shell.drafts/scroll localStorage before teammate navigate."
}
