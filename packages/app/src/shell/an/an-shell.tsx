import { For, Show, type JSX, type ParentProps } from "solid-js"
import { AnCard, AnStreamCards } from "./cards"
import { attentionToApprovalCards } from "./cards/map"
import type { AnCardModel } from "./cards/types"
import { AnConversationStream } from "./conversation-stream"
import type { AnStreamItem } from "./conversation-stream-items"
import type { AnConversationTurn } from "./conversation-turns"
import { AN_COMPUTER_ATTACH_SURFACE, type ComputerAttachPath } from "./computer-attach"
import { AN_NAV_ILLUSTRATED } from "./nav-illustrated"
import { AnNavIcon } from "./nav-icons"
import {
  AN_COMPUTER_EXTERNAL_SURFACE,
  EXTERNAL_BROWSER_FAMILIES,
  externalBrowserFamilyLabel,
  type ExternalBrowserFamily,
} from "./computer-external"
import { AN_COMPUTER_CONTROL_SURFACE } from "./computer-control"
import { AN_COMPUTER_SCOPE_SURFACE } from "./computer-scope"
import { AN_COMPUTER_CDP_ISOLATION_SURFACE } from "./computer-cdp-isolation"
import { AN_COMPUTER_FEED_SURFACE } from "./computer-feed"
import { AN_COMPUTER_OS_POINTER_PAUSE_SURFACE } from "./computer-os-pointer-pause"
import {
  AN_COMPUTER_SCREENCAST_SURFACE,
  type ComputerPixelSource,
  type ComputerScreencastPhase,
} from "./computer-screencast"
import {
  AN_PRESENCE_PERSONALITY,
  AN_PRODUCT_NAME,
  AN_REVIEW_SURFACE,
  AN_SHELL_UX,
  anPresenceLabel,
  anShellLayout,
  presenceDotClass,
  type AnShellMode,
} from "./tokens"
import type { AnShellProps } from "./types"
import type { AnDraftIdentity } from "./session-draft-store"
import "./an-shell.css"

function StreamRegion(
  props: ParentProps<{
    /** Collapsed Mission stack above Conversation (empty when cards are in-stream). */
    missionStackCards?: AnCardModel[]
    /** Legacy flat cards when Conversation is not owned (home / non-session). */
    cards?: AnCardModel[]
    turns?: AnConversationTurn[]
    /** Interleaved Conversation items (turns + cards) — AP-STAGE4-15. */
    streamItems?: AnStreamItem[]
    conversationEmpty?: string
    /** When true, AN owns message list; children keep composer / home chrome. */
    ownConversation?: boolean
    scrollIdentity?: AnDraftIdentity
    onCardAction?: (actionId: string, card: AnCardModel) => void
  }>,
) {
  const onAction = (action: { id: string }, card: AnCardModel) =>
    props.onCardAction?.(action.id, card)
  return (
    <>
      {/* Collapsed Mission stack — not the primary card surface when Conversation owns cards. */}
      <Show when={props.ownConversation}>
        <AnStreamCards
          cards={props.missionStackCards ?? []}
          collapsed
          onAction={onAction}
        />
      </Show>
      <Show when={!props.ownConversation}>
        <AnStreamCards cards={props.cards ?? []} onAction={onAction} />
      </Show>
      <Show when={props.ownConversation}>
        <AnConversationStream
          items={props.streamItems}
          turns={props.turns ?? []}
          emptyHint={props.conversationEmpty}
          scrollIdentity={props.scrollIdentity}
          onCardAction={onAction}
        />
      </Show>
      <div
        class="an-stream-legacy"
        classList={{ "an-stream-legacy--composer-only": !!props.ownConversation }}
        data-an-own-conversation={props.ownConversation ? "true" : "false"}
      >
        {props.children}
      </div>
    </>
  )
}

const DEFAULT_NAV = [
  { id: "home", label: "Home", icon: "home", active: true },
  { id: "missions", label: "Missions", icon: "missions" },
  { id: "contraptions", label: "Contraptions", icon: "contraptions" },
  { id: "review", label: "Review", icon: "review" },
  { id: "knowledge", label: "Knowledge", icon: "knowledge" },
  { id: "settings", label: "Settings", icon: "settings" },
] as const

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase()
}

/** Live Computer View panel — hosted in Review sidebar (AP-STAGE5-08), not a peer mode column. */
export function AnLiveComputerPanel(props: {
  title: string
  empty: string
  note: string
  size: "compact" | "large" | "primary"
  live?: boolean
  attachPhase?: "disconnected" | "consenting" | "attached"
  attachPath?: ComputerAttachPath
  attachBackend?: "local-browser" | "external-chromium"
  pathLabel?: string
  externalDraftEndpoint?: string
  externalDraftRegion?: string
  externalDraftFamily?: ExternalBrowserFamily
  externalEndpoint?: string
  externalRegionId?: string
  cursorVisible?: boolean
  /** AP-STAGE5-04 scope axis (separate from mode). */
  scopeKind?: "none" | "local-workspace" | "tab-group" | "window"
  scopeTarget?: string
  boundaryVisible?: boolean
  scopeBannerLine?: string
  /** AP-STAGE5-06: CDP isolation chrome (native capture honesty). */
  cdpIsolationLine?: string
  nativeCaptureBlocked?: boolean
  feedActive?: boolean
  feedUrl?: string
  feedSrcdoc?: string
  feedDraft?: string
  /** BF-03: watch-only until user Takeover. Default true preserves BF-02. */
  feedWatchOnly?: boolean
  /** AP-BF-05: CDP screencast phase / real pixel frame (never invent Live). */
  screencastPhase?: ComputerScreencastPhase
  screencastFrameUrl?: string
  screencastFrameCount?: number
  pixelSource?: ComputerPixelSource
  screencastStatus?: string
  controller?: "none" | "bot" | "user"
  botPaused?: boolean
  userInput?: boolean
  needsFreshObservation?: boolean
  /** Display name for banner / cursor tag (AP-STAGE5-05). */
  controllerBotName?: string
  onFeedDraftChange?: (value: string) => void
  onFeedNavigate?: (url: string) => void
  /** AP-STAGE5-07: user pointer/focus on Live Computer chrome (not Takeover grant). */
  onUserTargetChromeInteraction?: (kind: "chrome-pointer" | "chrome-focus") => void
  onConnect?: () => void
  onConfirmAttach?: () => void
  onCancelConsent?: () => void
  onDisconnect?: () => void
  onAttachPathChange?: (path: ComputerAttachPath) => void
  onExternalDraftChange?: (draft: { endpoint?: string; region?: string; family?: string }) => void
  onExternalProbe?: () => void
  /** AP-BF-06: open tab in existing Edge/Chrome (spawn only if none). */
  onExternalOpenTab?: () => void
  /** AP-STAGE5-05 handoff H: Take over / Pause / Resume while Live + bot lock. */
  onTakeOver?: () => void
  onPauseBot?: () => void
  onResumeBot?: () => void
}) {
  const badge = () => (props.live ? "Live" : "Unavailable")
  const phase = () => props.attachPhase ?? (props.live ? "attached" : "disconnected")
  const attachPath = () => props.attachPath ?? props.attachBackend ?? "local-browser"
  const backend = () => props.attachBackend ?? attachPath()
  const pathLabel = () => props.pathLabel ?? AN_COMPUTER_ATTACH_SURFACE.pathLabel
  const feedActive = () => !!props.live && !!props.feedActive
  const watchOnly = () => props.feedWatchOnly !== false && !props.userInput
  const controller = () => props.controller ?? (props.live ? "bot" : "none")
  const botName = () => props.controllerBotName?.trim() || "Bot"
  const cursorLabel = () => `${botName()} cursor`
  const pixelSource = () => props.pixelSource ?? "none"
  const scopeKind = () => props.scopeKind ?? "none"
  const boundaryVisible = () => !!props.boundaryVisible
  const showScreencastPixels = () =>
    pixelSource() === "cdp-screencast" && !!props.screencastFrameUrl
  const showBotDriveControls = () => !!props.live && !props.userInput
  return (
    <section
      class="an-computer"
      data-size={props.size}
      data-an-part={AN_COMPUTER_ATTACH_SURFACE.part}
      data-attach-phase={phase()}
      data-attach-path={attachPath()}
      data-backend={backend()}
      data-external-endpoint={props.externalEndpoint || undefined}
      data-external-region={props.externalRegionId || undefined}
      data-feed-active={feedActive() ? "true" : "false"}
      data-pixel-source={pixelSource()}
      data-screencast-phase={props.screencastPhase ?? "idle"}
      data-screencast-frames={props.screencastFrameCount != null ? String(props.screencastFrameCount) : undefined}
      data-an-control={AN_COMPUTER_CONTROL_SURFACE.part}
      data-an-screencast={AN_COMPUTER_SCREENCAST_SURFACE.part}
      data-an-scope={AN_COMPUTER_SCOPE_SURFACE.part}
      data-scope-kind={scopeKind()}
      data-scope-target={props.scopeTarget || undefined}
      data-boundary={boundaryVisible() ? AN_COMPUTER_SCOPE_SURFACE.boundaryTone : "off"}
      data-an-part-isolation={AN_COMPUTER_CDP_ISOLATION_SURFACE.part}
      data-cdp-isolation={
        scopeKind() === "tab-group" && AN_COMPUTER_CDP_ISOLATION_SURFACE.browserTabGroupIsolation
          ? "on"
          : scopeKind() === "window"
            ? "native-blocked"
            : "off"
      }
      data-native-capture={
        props.nativeCaptureBlocked !== false && !AN_COMPUTER_CDP_ISOLATION_SURFACE.nativeWindowCapture
          ? "blocked"
          : "unavailable"
      }
      data-an-part-os-pointer={AN_COMPUTER_OS_POINTER_PAUSE_SURFACE.part}
      data-os-pointer-pause={
        props.live && AN_COMPUTER_OS_POINTER_PAUSE_SURFACE.computerChromeAutoPause ? "on" : "off"
      }
      data-controller={controller()}
      data-bot-paused={props.botPaused ? "true" : "false"}
      data-user-input={props.userInput ? "true" : "false"}
      data-needs-observation={props.needsFreshObservation ? "true" : "false"}
      aria-label={props.title}
    >
      <header class="an-computer-header">
        <strong>{props.title}</strong>
        <span class="an-computer-badge" data-live={props.live ? "true" : "false"} data-state={badge().toLowerCase()}>
          {badge()}
        </span>
      </header>
      <Show when={props.scopeBannerLine}>
        <div
          class="an-computer-scope-banner"
          data-an-part={AN_COMPUTER_SCOPE_SURFACE.part}
          data-boundary={boundaryVisible() ? AN_COMPUTER_SCOPE_SURFACE.boundaryTone : "off"}
          data-controller={controller()}
          aria-live="polite"
        >
          {props.scopeBannerLine}
        </div>
      </Show>
      <Show when={props.cdpIsolationLine && props.live}>
        <p
          class="an-computer-isolation-note"
          data-an-part={AN_COMPUTER_CDP_ISOLATION_SURFACE.part}
          data-native-capture={
            props.nativeCaptureBlocked !== false ? "blocked" : "unavailable"
          }
        >
          {props.cdpIsolationLine}
        </p>
      </Show>
      <div class="an-computer-surface" data-empty={props.live ? "false" : "true"}>
        <Show
          when={props.live}
          fallback={<p class="an-computer-empty">{props.empty}</p>}
        >
          <div
            class="an-computer-workspace"
            data-an-part="computer-workspace"
            data-an-boundary={AN_COMPUTER_SCOPE_SURFACE.boundaryPart}
            data-boundary={boundaryVisible() ? AN_COMPUTER_SCOPE_SURFACE.boundaryTone : "off"}
            data-scope-kind={scopeKind()}
          >
            <span class="an-computer-workspace-label">{pathLabel()}</span>
            <Show when={feedActive()}>
              <form
                class="an-computer-feed-bar"
                data-an-part="computer-feed-bar"
                onSubmit={(event) => {
                  event.preventDefault()
                  props.onFeedNavigate?.(props.feedDraft ?? props.feedUrl ?? "")
                }}
              >
                <input
                  class="an-computer-feed-url"
                  data-an-part="computer-feed-url"
                  type="text"
                  spellcheck={false}
                  autocomplete="off"
                  aria-label="Watch-only page URL"
                  placeholder="https://…"
                  value={props.feedDraft ?? props.feedUrl ?? ""}
                  onInput={(event) => props.onFeedDraftChange?.(event.currentTarget.value)}
                  onFocus={() => props.onUserTargetChromeInteraction?.("chrome-focus")}
                />
                <button type="submit" class="an-computer-btn an-computer-btn--feed" data-action="computer-feed-go">
                  Go
                </button>
              </form>
              <div
                class="an-computer-feed"
                data-an-part={AN_COMPUTER_FEED_SURFACE.part}
                data-watch-only={watchOnly() ? "true" : "false"}
                data-cursor-in-capture={AN_COMPUTER_FEED_SURFACE.includeCursorInCapture ? "true" : "false"}
                data-feed-url={props.feedUrl ?? ""}
                data-user-input={props.userInput ? "true" : "false"}
                data-pixel-source={pixelSource()}
                data-screencast-phase={props.screencastPhase ?? "idle"}
                data-action="computer-feed-surface"
                onPointerDown={() => props.onUserTargetChromeInteraction?.("chrome-pointer")}
              >
                <Show when={showScreencastPixels()}>
                  <img
                    class="an-computer-feed-pixels"
                    data-an-part={AN_COMPUTER_SCREENCAST_SURFACE.framePart}
                    data-cursor-in-capture="false"
                    data-watch-only={watchOnly() ? "true" : "false"}
                    alt="Live CDP page pixels"
                    src={props.screencastFrameUrl}
                    draggable={false}
                  />
                </Show>
                <Show when={!showScreencastPixels()}>
                  <Show
                    when={props.feedSrcdoc}
                    fallback={
                      <iframe
                        class="an-computer-feed-frame"
                        title="Computer View page feed"
                        src={props.feedUrl || "about:blank"}
                        sandbox="allow-scripts allow-same-origin allow-forms"
                        tabindex={watchOnly() ? -1 : 0}
                        data-an-part="computer-feed-frame"
                        data-feed-mode="src"
                        data-watch-only={watchOnly() ? "true" : "false"}
                      />
                    }
                  >
                    <iframe
                      class="an-computer-feed-frame"
                      title="Computer View page feed"
                      srcdoc={props.feedSrcdoc}
                      sandbox="allow-scripts allow-same-origin"
                      tabindex={watchOnly() ? -1 : 0}
                      data-an-part="computer-feed-frame"
                      data-feed-mode="srcdoc"
                      data-watch-only={watchOnly() ? "true" : "false"}
                    />
                  </Show>
                </Show>
                <Show when={props.screencastStatus && pixelSource() !== "iframe"}>
                  <p
                    class="an-computer-screencast-status"
                    data-an-part="computer-screencast-status"
                    data-phase={props.screencastPhase ?? "idle"}
                  >
                    {props.screencastStatus}
                  </p>
                </Show>
              </div>
            </Show>
            <Show when={props.cursorVisible}>
              <div
                class="an-computer-cursor"
                data-an-part="computer-cursor"
                title={cursorLabel()}
                aria-label={cursorLabel()}
              >
                <i class="an-computer-cursor-pointer" />
                <span class="an-computer-cursor-tag">{cursorLabel()}</span>
              </div>
            </Show>
            <Show when={!feedActive()}>
              <p class="an-computer-empty an-computer-empty--live">{props.empty}</p>
            </Show>
          </div>
        </Show>
      </div>
      <div class="an-computer-actions" data-an-part="computer-attach-actions" role="group" aria-label="Computer View attach">
        <Show when={phase() === "disconnected" || (phase() === "attached" && !props.live)}>
          <button type="button" class="an-computer-btn an-computer-btn--connect" data-action="computer-connect" onClick={() => props.onConnect?.()}>
            Connect browser
          </button>
        </Show>
        <Show when={phase() === "consenting"}>
          <div
            class="an-computer-path"
            data-an-part={AN_COMPUTER_EXTERNAL_SURFACE.part}
            role="radiogroup"
            aria-label="Browser attach path"
          >
            <button
              type="button"
              class="an-computer-btn an-computer-btn--path"
              role="radio"
              data-action="computer-path-local"
              data-path="local-browser"
              data-active={attachPath() === "local-browser" ? "true" : "false"}
              aria-checked={attachPath() === "local-browser"}
              onClick={() => props.onAttachPathChange?.("local-browser")}
            >
              Local workspace
            </button>
            <button
              type="button"
              class="an-computer-btn an-computer-btn--path"
              role="radio"
              data-action="computer-path-external"
              data-path="external-chromium"
              data-active={attachPath() === "external-chromium" ? "true" : "false"}
              aria-checked={attachPath() === "external-chromium"}
              onClick={() => props.onAttachPathChange?.("external-chromium")}
            >
              My Edge/Chrome
            </button>
          </div>
          <Show when={attachPath() === "external-chromium"}>
            <div class="an-computer-external" data-an-part="computer-external-fields">
              <label class="an-computer-external-field">
                <span>Browser</span>
                <select
                  data-action="computer-external-family"
                  value={props.externalDraftFamily ?? "edge"}
                  onChange={(event) =>
                    props.onExternalDraftChange?.({ family: event.currentTarget.value })
                  }
                >
                  <For each={[...EXTERNAL_BROWSER_FAMILIES]}>
                    {(family) => <option value={family}>{externalBrowserFamilyLabel(family)}</option>}
                  </For>
                </select>
              </label>
              <label class="an-computer-external-field">
                <span>Loopback endpoint</span>
                <input
                  type="text"
                  data-action="computer-external-endpoint"
                  placeholder={AN_COMPUTER_EXTERNAL_SURFACE.defaultEndpointHint}
                  value={props.externalDraftEndpoint ?? ""}
                  onInput={(event) =>
                    props.onExternalDraftChange?.({ endpoint: event.currentTarget.value })
                  }
                />
              </label>
              <label class="an-computer-external-field">
                <span>Region id</span>
                <input
                  type="text"
                  data-action="computer-external-region"
                  placeholder="CDP target id from your browser"
                  value={props.externalDraftRegion ?? ""}
                  onInput={(event) =>
                    props.onExternalDraftChange?.({ region: event.currentTarget.value })
                  }
                />
              </label>
              <button
                type="button"
                class="an-computer-btn"
                data-action="computer-external-probe"
                onClick={() => props.onExternalProbe?.()}
              >
                Check endpoint
              </button>
              <button
                type="button"
                class="an-computer-btn"
                data-action="computer-external-open-tab"
                data-an-part="computer-external-window"
                title="Open a tab in the existing Edge/Chrome window when debugging is up; spawn only if none is running"
                onClick={() => props.onExternalOpenTab?.()}
              >
                Open tab in browser
              </button>
            </div>
          </Show>
          <button type="button" class="an-computer-btn an-computer-btn--confirm" data-action="computer-confirm" onClick={() => props.onConfirmAttach?.()}>
            Confirm attach
          </button>
          <button type="button" class="an-computer-btn an-computer-btn--cancel" data-action="computer-cancel" onClick={() => props.onCancelConsent?.()}>
            Cancel
          </button>
        </Show>
        <Show when={showBotDriveControls()}>
          <div
            class="an-computer-drive-controls"
            data-an-part="computer-drive-controls"
            role="toolbar"
            aria-label="Bot drive controls"
          >
            <button
              type="button"
              class="an-computer-btn an-computer-btn--takeover"
              data-action="computer-take-over"
              onClick={() => props.onTakeOver?.()}
            >
              Take over
            </button>
            <Show
              when={props.botPaused}
              fallback={
                <button
                  type="button"
                  class="an-computer-btn an-computer-btn--pause"
                  data-action="computer-pause"
                  onClick={() => props.onPauseBot?.()}
                >
                  Pause
                </button>
              }
            >
              <button
                type="button"
                class="an-computer-btn an-computer-btn--resume"
                data-action="computer-resume"
                onClick={() => props.onResumeBot?.()}
              >
                Resume
              </button>
            </Show>
          </div>
        </Show>
        <Show when={props.live}>
          <button type="button" class="an-computer-btn an-computer-btn--disconnect" data-action="computer-disconnect" onClick={() => props.onDisconnect?.()}>
            Disconnect
          </button>
        </Show>
      </div>
      <Show when={props.size !== "primary"}>
        <p class="an-computer-note">{props.note}</p>
      </Show>
    </section>
  )
}

/** Mission chrome: Review sidebar toggle — not Conversation/Computer View/Takeover peer pills. */
function ReviewChromeToggle(props: {
  open?: boolean
  onToggle?: () => void
}) {
  return (
    <div
      class="an-review-chrome"
      data-an-part="review-chrome"
      data-shell-ux={AN_SHELL_UX.slice}
      data-peer-mode-pills="false"
    >
      <button
        type="button"
        class="an-review-chrome-btn"
        data-action="review-toggle"
        data-active={props.open ? "true" : "false"}
        aria-pressed={props.open ? "true" : "false"}
        aria-label={props.open ? "Collapse Review sidebar" : "Open Review sidebar"}
        title={AN_REVIEW_SURFACE.label}
        onClick={() => props.onToggle?.()}
      >
        {AN_REVIEW_SURFACE.label}
      </button>
    </div>
  )
}

export function AnShell(props: AnShellProps): JSX.Element {
  const mode = (): AnShellMode => props.mode ?? "conversation"
  const layout = () => anShellLayout(mode())
  const nav = () => props.navItems ?? [...DEFAULT_NAV]
  const attention = () => props.attention ?? []
  const roster = () => props.roster ?? []
  const streamCards = () => props.streamCards ?? []
  const missionStackCards = () => props.missionStackCards ?? []
  const streamItems = () => props.streamItems
  const conversationTurns = () => props.conversationTurns
  const ownConversation = () => conversationTurns() !== undefined
  const attentionCards = () => attentionToApprovalCards(attention())
  const progress = () => {
    const value = props.mission?.progressPercent
    if (value === undefined || Number.isNaN(value)) return undefined
    return Math.max(0, Math.min(100, value))
  }

  return (
    <div
      data-component="an-shell"
      data-an-theme="an"
      data-mode={mode()}
      data-conversation-primary={layout().conversationPrimary ? "true" : "false"}
      data-review-hosts-computer={layout().reviewHostsComputer ? "true" : "false"}
      data-shell-ux={AN_SHELL_UX.slice}
      data-peer-mode-pills="false"
      data-attention-always-on=""
      data-presence-personality={AN_PRESENCE_PERSONALITY.markers.personality}
    >
      <nav
        class="an-nav"
        aria-label="AN navigation"
        data-an-part={AN_NAV_ILLUSTRATED.part}
        data-an-nav={AN_NAV_ILLUSTRATED.style}
      >
        <div class="an-nav-brand" title={props.brandTitle ?? AN_PRODUCT_NAME} aria-label={props.brandTitle ?? AN_PRODUCT_NAME}>
          {props.brandMark ?? "AN"}
        </div>
        <For each={nav()}>
          {(item) => (
            <button
              type="button"
              class="an-nav-item"
              data-active={item.active ? "true" : "false"}
              title={item.label}
              aria-label={item.label}
              aria-current={item.active ? "page" : undefined}
              onClick={() => props.onSelectNav?.(item.id)}
            >
              <AnNavIcon name={item.icon ?? item.id} />
            </button>
          )}
        </For>
      </nav>

      <aside class="an-roster" aria-label="Bot Team roster">
        <header class="an-roster-header">
          <strong>{props.rosterTitle ?? props.brandTitle ?? AN_PRODUCT_NAME}</strong>
          <span>{props.rosterSubtitle ?? props.brandSubtitle ?? "Local-first agentic teams"}</span>
        </header>
        <div class="an-roster-list" role="list">
          <For each={roster()}>
            {(member) => (
              <button
                type="button"
                class="an-roster-member"
                role="listitem"
                data-slug={member.id}
                data-selected={member.selected ? "true" : "false"}
                data-presence={member.presence}
                title={`${member.name} · ${anPresenceLabel(member.presence)}`}
                aria-label={`${member.name}, ${member.role}, ${anPresenceLabel(member.presence)}`}
                onClick={() => props.onSelectMember?.(member.id)}
                onContextMenu={(event) => {
                  if (!props.onMemberContextMenu) return
                  event.preventDefault()
                  props.onMemberContextMenu(member.id, event)
                }}
              >
                <span
                  class="an-roster-avatar"
                  aria-hidden="true"
                  data-presence={member.presence}
                  data-companion={member.selected ? "true" : "false"}
                >
                  <span class="an-roster-companion-aura" data-an-part={AN_PRESENCE_PERSONALITY.markers.selectedAura} />
                  {member.avatar || initials(member.name)}
                  <i class={presenceDotClass(member.presence)} data-personality="micro-spring" />
                </span>
                <span class="an-roster-text">
                  <strong>{member.name}</strong>
                  <span>{member.role}</span>
                  <span class="an-roster-presence" data-presence={member.presence}>
                    {anPresenceLabel(member.presence)}
                  </span>
                </span>
              </button>
            )}
          </For>
        </div>
        <Show when={props.rosterFooter}>
          <div class="an-roster-footer">{props.rosterFooter}</div>
        </Show>
      </aside>

      <section class="an-main" aria-label="Mission conversation">
        <header class="an-mission" data-an-mission="compact" data-collapsed="true">
          <div class="an-mission-copy">
            <strong>{props.mission?.title ?? "Mission"}</strong>
            <Show when={props.mission?.subtitle}>
              <span class="an-mission-subtitle">{props.mission!.subtitle}</span>
            </Show>
            <Show when={(props.mission?.pills?.length ?? 0) > 0}>
              <details class="an-mission-pills-details">
                <summary class="an-mission-pills-summary">
                  {props.mission!.pills![0]?.label ?? "Status"}
                  {(props.mission!.pills!.length ?? 0) > 1
                    ? ` · +${props.mission!.pills!.length - 1}`
                    : ""}
                </summary>
                <div class="an-mission-pills">
                  <For each={props.mission!.pills!}>
                    {(pill) => (
                      <span class="an-pill" data-tone={pill.tone ?? "neutral"}>
                        {pill.label}
                      </span>
                    )}
                  </For>
                </div>
              </details>
            </Show>
          </div>
          <Show when={progress() !== undefined}>
            <div
              class="an-mission-progress"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress()}
              title={`${progress()}%`}
            >
              <i style={{ width: `${progress()}%` }} />
            </div>
          </Show>
          <ReviewChromeToggle open={props.reviewOpen} onToggle={props.onToggleReview} />
        </header>

        {/* AP-STAGE5-08: Conversation always primary — Computer View / Takeover live in Review sidebar. */}
        <div
          class="an-stream"
          data-an-own-conversation={ownConversation() ? "true" : "false"}
          data-an-cards-in-stream={ownConversation() ? "true" : "false"}
          data-conversation-primary="true"
        >
          <StreamRegion
            cards={streamCards()}
            missionStackCards={missionStackCards()}
            streamItems={streamItems()}
            turns={conversationTurns()}
            conversationEmpty={props.conversationEmpty}
            ownConversation={ownConversation()}
            scrollIdentity={props.conversationScrollIdentity}
            onCardAction={props.onStreamCardAction}
          >
            {props.children}
          </StreamRegion>
        </div>
      </section>

      <aside class="an-attention" aria-label="Attention">
        <div class="an-attention-header">{props.attentionTitle ?? "Attention"}</div>
        <div class="an-attention-list">
          <Show
            when={attentionCards().length > 0}
            fallback={<p class="an-attention-empty">{props.attentionEmpty ?? "No blockers right now."}</p>}
          >
            <For each={attentionCards()}>
              {(card) => {
                const rawId = () =>
                  card.id.startsWith("attention:") ? card.id.slice("attention:".length) : card.id
                const railCard = () => ({ ...card, actions: undefined })
                return (
                  <div
                    class="an-attention-card-wrap"
                    data-kind="approval"
                    role="button"
                    tabindex="0"
                    onClick={() => props.onSelectAttention?.(rawId())}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        props.onSelectAttention?.(rawId())
                      }
                    }}
                  >
                    <AnCard card={railCard()} density="rail" />
                  </div>
                )
              }}
            </For>
          </Show>
        </div>
      </aside>
    </div>
  )
}
