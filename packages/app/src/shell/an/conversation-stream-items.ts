import type { SessionMessageAssistantTool, SessionMessageInfo } from "@opencode/client/promise"
import {
  attentionToApprovalCards,
  computerToCard,
  detectTeamHandoff,
  isBotUsingComputer,
  isQuietComputerEntry,
  messageProofUnavailableCard,
  messagesToPartCards,
  rosterToTeamCard,
  sessionToTaskCard,
  shouldIncludeComputerStreamCard,
  shouldIncludeTeamStreamCard,
  shouldSurfaceToolCard,
  teamHandoffToCard,
  toolPartToCard,
  userAskedComputerFromMessages,
  type AnTeamHandoff,
} from "./cards/map"
import type { AnCardModel } from "./cards/types"
import { messagesToConversationTurns, type AnConversationTurn } from "./conversation-turns"
import type { AnAttentionItem, AnRosterMember } from "./types"

/** One row in the AN Conversation stream — text turn or in-conversation card (mockup). */
export type AnStreamItem =
  | { kind: "turn"; id: string; turn: AnConversationTurn }
  | { kind: "card"; id: string; card: AnCardModel }

/**
 * Context cards not derived from a specific message tool part
 * (session task, attention, optional computer/team, optional proof unavailable).
 * AP-STAGE5-01/02 Option C: Computer when relevant; Team on handoffs only — no wallpaper.
 */
export function buildContextCards(input: {
  attention?: readonly AnAttentionItem[]
  roster?: readonly AnRosterMember[]
  session?: { sessionID?: string; title?: string; agent?: string; working?: boolean }
  messages?: readonly SessionMessageInfo[]
  computerLive?: boolean
  computerFeedActive?: boolean
  computerUserControl?: boolean
  computerController?: "none" | "bot" | "user"
  computerAttachPhase?: "disconnected" | "consenting" | "attached"
  shellMode?: string
  includeComputer?: boolean
  quietComputerEntry?: boolean
  /** Team card only on handoffs/events (default: detect agent handoff). */
  includeTeam?: boolean
  teamHandoff?: AnTeamHandoff | boolean
  includeProofUnavailable?: boolean
}): AnCardModel[] {
  const cards: AnCardModel[] = []
  const task = sessionToTaskCard(input.session ?? {})
  if (task) cards.push(task)
  cards.push(...attentionToApprovalCards(input.attention ?? []))
  if (input.includeProofUnavailable) {
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

/**
 * Collapsed Mission stack above Conversation (AP-STAGE4-15).
 * When Conversation owns cards, stack stays empty — cards live in-stream per mockup.
 */
export function buildMissionStackCards(_input?: {
  conversationOwnsCards?: boolean
}): AnCardModel[] {
  if (_input?.conversationOwnsCards !== false) return []
  return []
}

/**
 * Interleave user/assistant turns with Task/Approval/Proof/Computer cards
 * for in-conversation mockup placement (chronological).
 */
export function buildConversationStreamItems(input: {
  messages?: readonly SessionMessageInfo[]
  contextCards?: readonly AnCardModel[]
  /** When set, use these turns instead of remapping messages (keeps agent labels). */
  turns?: readonly AnConversationTurn[]
}): AnStreamItem[] {
  const messages = input.messages ?? []
  const turns = input.turns ?? messagesToConversationTurns(messages)
  const turnById = new Map(turns.map((t) => [t.id, t]))
  const items: AnStreamItem[] = []
  const emittedTurnIds = new Set<string>()
  const emittedCardIds = new Set<string>()

  for (const msg of messages) {
    if (!msg) continue
    if (msg.type === "user") {
      const turn = turnById.get(msg.id)
      if (turn) {
        items.push({ kind: "turn", id: `turn:${turn.id}`, turn })
        emittedTurnIds.add(turn.id)
      }
      continue
    }
    if (msg.type === "assistant") {
      const turn = turnById.get(msg.id)
      if (turn) {
        items.push({ kind: "turn", id: `turn:${turn.id}`, turn })
        emittedTurnIds.add(turn.id)
      }
      for (const part of msg.content) {
        if (!part || part.type !== "tool") continue
        if (!shouldSurfaceToolCard(part as SessionMessageAssistantTool)) continue
        const card = toolPartToCard(part as SessionMessageAssistantTool)
        if (emittedCardIds.has(card.id)) continue
        items.push({ kind: "card", id: `card:${card.id}`, card })
        emittedCardIds.add(card.id)
      }
    }
  }

  for (const turn of turns) {
    if (emittedTurnIds.has(turn.id)) continue
    items.push({ kind: "turn", id: `turn:${turn.id}`, turn })
    emittedTurnIds.add(turn.id)
  }

  for (const card of input.contextCards ?? []) {
    if (emittedCardIds.has(card.id)) continue
    if (card.id.startsWith("tool:")) continue
    items.push({ kind: "card", id: `card:${card.id}`, card })
    emittedCardIds.add(card.id)
  }

  return items
}

/** Flat list helper for tests / probes. */
export function flattenStreamItems(items: readonly AnStreamItem[]): {
  turns: AnConversationTurn[]
  cards: AnCardModel[]
} {
  const turns: AnConversationTurn[] = []
  const cards: AnCardModel[] = []
  for (const item of items) {
    if (item.kind === "turn") turns.push(item.turn)
    else cards.push(item.card)
  }
  return { turns, cards }
}

/** Re-export for callers that still want part cards without interleave. */
export { messagesToPartCards }
