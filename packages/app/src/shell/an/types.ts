import type { AnPresence, AnShellMode } from "./tokens"
import type { AnCardModel } from "./cards/types"
import type { AnConversationTurn } from "./conversation-turns"
import type { JSX, ParentProps } from "solid-js"

export type AnNavItem = {
  id: string
  label: string
  icon?: string
  active?: boolean
}

export type AnRosterMember = {
  id: string
  name: string
  role: string
  avatar?: string
  presence: AnPresence
  selected?: boolean
}

export type AnMissionHeader = {
  title: string
  subtitle?: string
  /** 0–100 from real task state; omit when unknown — do not invent progress. */
  progressPercent?: number
  pills?: Array<{ label: string; tone?: "neutral" | "ok" | "warn" }>
}

export type AnAttentionItem = {
  id: string
  title: string
  detail?: string
  kind?: "approval" | "blocker" | "info"
}

export type AnShellProps = ParentProps<{
  /** Monogram in nav mark (default AN). */
  brandMark?: string
  /** Product name for tooltips/roster (default Aporetic — not company name). */
  brandTitle?: string
  brandSubtitle?: string
  navItems?: AnNavItem[]
  rosterTitle?: string
  rosterSubtitle?: string
  roster?: AnRosterMember[]
  mission?: AnMissionHeader
  attentionTitle?: string
  attention?: AnAttentionItem[]
  /** Mapped AN cards shown at top of the conversation stream (Task/Approval/…). */
  streamCards?: AnCardModel[]
  /**
   * AN-owned conversation turns (user + assistant text).
   * When provided (including empty array on a live session), AnShell renders Conversation —
   * OpenCode timeline chrome is suppressed under AnShell.
   */
  conversationTurns?: AnConversationTurn[]
  /** Empty-state hint for the AN conversation list. */
  conversationEmpty?: string
  /** Approved three-state framing (Conversation / Computer View / Takeover); not Stage 5 control lock. */
  mode?: AnShellMode
  /** Interactive mode switch — layout changes; backends may still be stubbed. */
  onModeChange?: (mode: AnShellMode) => void
  onSelectNav?: (id: string) => void
  onSelectMember?: (id: string) => void
  onSelectAttention?: (id: string) => void
  onStreamCardAction?: (actionId: string, card: AnCardModel) => void
  /** Takeover chrome stubs — honest no-ops when computer backend is missing. */
  onHandBack?: () => void
  onStopTakeover?: () => void
  rosterFooter?: JSX.Element
  attentionEmpty?: string
  /** Honest empty copy for the always-on Computer View panel. */
  computerEmpty?: string
  computerTitle?: string
  /** True only when a consented local browser workspace is attached — never invent live. */
  computerLive?: boolean
  /** AP-BF-01: attach phase for Connect/Disconnect chrome. */
  computerAttachPhase?: "disconnected" | "consenting" | "attached"
  /** Labeled bot cursor overlay — only when live (UI affordance, not page paint). */
  computerCursorVisible?: boolean
  /** AP-BF-02: watch-only page feed — only when Live; never invent pixels. */
  computerFeedActive?: boolean
  computerFeedUrl?: string
  computerFeedSrcdoc?: string
  computerFeedDraft?: string
  onComputerFeedDraftChange?: (value: string) => void
  onComputerFeedNavigate?: (url: string) => void
  onComputerConnect?: () => void
  onComputerConfirmAttach?: () => void
  onComputerCancelConsent?: () => void
  onComputerDisconnect?: () => void
}>
