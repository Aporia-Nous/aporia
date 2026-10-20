import type { AnPresence, AnShellMode } from "./tokens"
import type { AnCardModel } from "./cards/types"
import type { AnStreamItem } from "./conversation-stream-items"
import type { AnConversationTurn } from "./conversation-turns"
import type { AnDraftIdentity } from "./session-draft-store"
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
  /** Legacy / home: mapped AN cards above stream when Conversation is not owned. */
  streamCards?: AnCardModel[]
  /**
   * Collapsed Mission stack above Conversation (AP-STAGE4-15).
   * Empty when Task/Approval/Proof/Computer live in-stream.
   */
  missionStackCards?: AnCardModel[]
  /**
   * Interleaved Conversation items (turns + cards) — mockup in-conversation cards.
   */
  streamItems?: AnStreamItem[]
  /**
   * AN-owned conversation turns (user + assistant text).
   * When provided (including empty array on a live session), AnShell renders Conversation —
   * OpenCode timeline chrome is suppressed under AnShell.
   */
  conversationTurns?: AnConversationTurn[]
  /** Empty-state hint for the AN conversation list. */
  conversationEmpty?: string
  /** AP-STAGE4-MISSION-RESTART — identity for conversation scroll save/restore. */
  conversationScrollIdentity?: AnDraftIdentity
  /** Approved three-state framing (Conversation / Computer View / Takeover); shares one BF-03 control lock. */
  mode?: AnShellMode
  /** Interactive mode switch — layout changes; backends may still be stubbed. */
  onModeChange?: (mode: AnShellMode) => void
  onSelectNav?: (id: string) => void
  onSelectMember?: (id: string) => void
  /** AP-STAGE4-NEW-TEAMMATE — roster context menu (edit/archive). */
  onMemberContextMenu?: (id: string, event: MouseEvent) => void
  onSelectAttention?: (id: string) => void
  onStreamCardAction?: (actionId: string, card: AnCardModel) => void
  /** AP-BF-03: Hand back / Stop — release user lock to bot (when Live). */
  onHandBack?: () => void
  onStopTakeover?: () => void
  /** AP-STAGE5-05: Pause / Resume bot drive without Takeover; Take over enters Takeover mode. */
  onPauseBot?: () => void
  onResumeBot?: () => void
  onTakeOver?: () => void
  rosterFooter?: JSX.Element
  attentionEmpty?: string
  /** Honest empty copy for the always-on Computer View panel. */
  computerEmpty?: string
  computerTitle?: string
  /** True only when a consented local or external browser path is attached — never invent live. */
  computerLive?: boolean
  /** AP-BF-01: attach phase for Connect/Disconnect chrome. */
  computerAttachPhase?: "disconnected" | "consenting" | "attached"
  /** AP-BF-01/04: local-browser or external-chromium. */
  computerAttachPath?: "local-browser" | "external-chromium"
  computerAttachBackend?: "local-browser" | "external-chromium"
  /** Path label shown on the workspace chrome. */
  computerAttachPathLabel?: string
  /** AP-BF-04 consent drafts for external Edge/Chrome. */
  computerExternalDraftEndpoint?: string
  computerExternalDraftRegion?: string
  computerExternalDraftFamily?: "edge" | "chrome" | "chromium"
  computerExternalEndpoint?: string
  computerExternalRegionId?: string
  /** Labeled bot cursor overlay — Live and bot holds lock (hidden during user Takeover). */
  computerCursorVisible?: boolean
  /** AP-STAGE5-04: scope axis kind (orthogonal to mode). */
  computerScopeKind?: "none" | "local-workspace" | "tab-group" | "window"
  /** AP-STAGE5-04: scoped target label for gold boundary / banner. */
  computerScopeTarget?: string
  /** AP-STAGE5-04: electric-gold outline when Live + assigned scope. */
  computerBoundaryVisible?: boolean
  /** AP-STAGE5-04: handoff H control line (`Bot is controlling · target`). */
  computerScopeBannerLine?: string
  /** Selected bot display name for controlling banner. */
  computerControllerBotName?: string
  /** AP-STAGE5-06: CDP isolation status line + native capture honesty. */
  computerCdpIsolationLine?: string
  computerNativeCaptureBlocked?: boolean
  /** AP-BF-02: page feed — only when Live; never invent pixels. */
  computerFeedActive?: boolean
  computerFeedUrl?: string
  computerFeedSrcdoc?: string
  computerFeedDraft?: string
  /** AP-BF-03: feed watch-only until user Takeover grants input. */
  computerFeedWatchOnly?: boolean
  /** AP-BF-05: live CDP screencast / pixel source honesty. */
  computerScreencastPhase?: "idle" | "connecting" | "streaming" | "error" | "stopped"
  computerScreencastFrameUrl?: string
  computerScreencastFrameCount?: number
  computerPixelSource?: "none" | "iframe" | "cdp-screencast"
  computerScreencastStatus?: string
  /** AP-BF-03: single controller — none | bot | user. */
  computerController?: "none" | "bot" | "user"
  computerBotPaused?: boolean
  computerUserInput?: boolean
  computerNeedsFreshObservation?: boolean
  /** Override Computer View note (control-lock aware). */
  computerNote?: string
  onComputerFeedDraftChange?: (value: string) => void
  onComputerFeedNavigate?: (url: string) => void
  /** AP-STAGE5-07: pointer/focus on Live Computer chrome → auto-pause (no Takeover grant). */
  onComputerUserTargetChromeInteraction?: (kind: "chrome-pointer" | "chrome-focus") => void
  onComputerConnect?: () => void
  onComputerConfirmAttach?: () => void
  onComputerCancelConsent?: () => void
  onComputerDisconnect?: () => void
  onComputerAttachPathChange?: (path: "local-browser" | "external-chromium") => void
  onComputerExternalDraftChange?: (draft: {
    endpoint?: string
    region?: string
    family?: string
  }) => void
  onComputerExternalProbe?: () => void
  /** AP-BF-06: open tab in existing Edge/Chrome window (spawn only if none). */
  onComputerExternalOpenTab?: () => void
}>
