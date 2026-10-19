import type { AnPresence, AnShellMode } from "./tokens"
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
  brandMark?: string
  brandTitle?: string
  brandSubtitle?: string
  navItems?: AnNavItem[]
  rosterTitle?: string
  rosterSubtitle?: string
  roster?: AnRosterMember[]
  mission?: AnMissionHeader
  attentionTitle?: string
  attention?: AnAttentionItem[]
  /** Approved three-state framing (Conversation / View / Takeover); not Stage 5 control lock. */
  mode?: AnShellMode
  /** Interactive mode switch — layout changes; backends may still be stubbed. */
  onModeChange?: (mode: AnShellMode) => void
  onSelectNav?: (id: string) => void
  onSelectMember?: (id: string) => void
  onSelectAttention?: (id: string) => void
  /** Takeover chrome stubs — honest no-ops when computer backend is missing. */
  onHandBack?: () => void
  onStopTakeover?: () => void
  rosterFooter?: JSX.Element
  attentionEmpty?: string
  /** Honest empty copy for the always-on live computer panel. */
  computerEmpty?: string
  computerTitle?: string
}>
