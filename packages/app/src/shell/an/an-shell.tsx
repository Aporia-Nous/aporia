import { For, Show, type JSX, type ParentProps } from "solid-js"
import { AnCard, AnStreamCards } from "./cards"
import { attentionToApprovalCards } from "./cards/map"
import type { AnCardModel } from "./cards/types"
import { AnConversationStream } from "./conversation-stream"
import type { AnStreamItem } from "./conversation-stream-items"
import type { AnConversationTurn } from "./conversation-turns"
import { AN_COMPUTER_ATTACH_SURFACE, type ComputerAttachPath } from "./computer-attach"
import {
  AN_COMPUTER_EXTERNAL_SURFACE,
  EXTERNAL_BROWSER_FAMILIES,
  externalBrowserFamilyLabel,
  type ExternalBrowserFamily,
} from "./computer-external"
import {
  AN_COMPUTER_CONTROL_SURFACE,
  computerControlBannerCopy,
} from "./computer-control"
import { AN_COMPUTER_FEED_SURFACE } from "./computer-feed"
import {
  AN_COMPUTER_SCREENCAST_SURFACE,
  type ComputerPixelSource,
  type ComputerScreencastPhase,
} from "./computer-screencast"
import {
  AN_PRESENCE_PERSONALITY,
  AN_PRODUCT_NAME,
  AN_SHELL_MODES,
  anPresenceLabel,
  anShellLayout,
  anShellModeLabel,
  presenceDotClass,
  type AnShellMode,
} from "./tokens"
import type { AnShellProps } from "./types"
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

const DEFAULT_COMPUTER_EMPTY =
  "Computer View has no live feed yet. Watch/control backends are not attached — chrome only."

/** Line icons toward mockup — not emoji glyphs. */
function NavIcon(props: { name?: string }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "1.75",
    "stroke-linecap": "round" as const,
    "stroke-linejoin": "round" as const,
    "aria-hidden": "true" as const,
    class: "an-nav-icon",
  }
  switch (props.name) {
    case "home":
      return (
        <svg {...common}>
          <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" />
        </svg>
      )
    case "missions":
      return (
        <svg {...common}>
          <rect x="4" y="4" width="7" height="7" rx="1.5" />
          <rect x="13" y="4" width="7" height="7" rx="1.5" />
          <rect x="4" y="13" width="7" height="7" rx="1.5" />
          <rect x="13" y="13" width="7" height="7" rx="1.5" />
        </svg>
      )
    case "contraptions":
      return (
        <svg {...common}>
          <circle cx="9" cy="9" r="2.5" />
          <path d="M9 3.5v1.2M9 13.3v1.2M4.4 5.8l.9.9M12.7 12.3l.9.9M3.5 9h1.2M13.3 9h1.2M4.4 12.2l.9-.9M12.7 5.7l.9-.9" />
          <circle cx="16.5" cy="15.5" r="2" />
          <path d="M16.5 11.8v.9M16.5 18.3v.9M13.2 13.3l.7.7M19.1 17l.7.7M12.8 15.5h.9M19.3 15.5h.9M13.2 17.7l.7-.7M19.1 14l.7-.7" />
        </svg>
      )
    case "review":
      return (
        <svg {...common}>
          <rect x="4" y="4" width="10" height="16" rx="1.5" />
          <path d="M7 8h4M7 11h4M7 14h2.5" />
          <path d="M16 7h4v10h-4" />
          <path d="M16 10h4M16 13h3" />
        </svg>
      )
    case "knowledge":
      return (
        <svg {...common}>
          <path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v16H7.5A2.5 2.5 0 0 0 5 21.5V5.5Z" />
          <path d="M5 21.5A2.5 2.5 0 0 1 7.5 19H19" />
        </svg>
      )
    case "settings":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 3.5v2.2M12 18.3v2.2M4.9 6.5l1.6 1.6M17.5 15.9l1.6 1.6M3.5 12h2.2M18.3 12h2.2M4.9 17.5l1.6-1.6M17.5 8.1l1.6-1.6" />
        </svg>
      )
    default:
      return <span class="an-nav-icon-fallback">{props.name?.slice(0, 1) ?? "?"}</span>
  }
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase()
}

function LiveComputerPanel(props: {
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
  onFeedDraftChange?: (value: string) => void
  onFeedNavigate?: (url: string) => void
  onConnect?: () => void
  onConfirmAttach?: () => void
  onCancelConsent?: () => void
  onDisconnect?: () => void
  onAttachPathChange?: (path: ComputerAttachPath) => void
  onExternalDraftChange?: (draft: { endpoint?: string; region?: string; family?: string }) => void
  onExternalProbe?: () => void
  /** AP-BF-06: open tab in existing Edge/Chrome (spawn only if none). */
  onExternalOpenTab?: () => void
}) {
  const badge = () => (props.live ? "Live" : "Unavailable")
  const phase = () => props.attachPhase ?? (props.live ? "attached" : "disconnected")
  const attachPath = () => props.attachPath ?? props.attachBackend ?? "local-browser"
  const backend = () => props.attachBackend ?? attachPath()
  const pathLabel = () => props.pathLabel ?? AN_COMPUTER_ATTACH_SURFACE.pathLabel
  const feedActive = () => !!props.live && !!props.feedActive
  const watchOnly = () => props.feedWatchOnly !== false && !props.userInput
  const controller = () => props.controller ?? (props.live ? "bot" : "none")
  const pixelSource = () => props.pixelSource ?? "none"
  const showScreencastPixels = () =>
    pixelSource() === "cdp-screencast" && !!props.screencastFrameUrl
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
      <div class="an-computer-surface" data-empty={props.live ? "false" : "true"}>
        <Show
          when={props.live}
          fallback={<p class="an-computer-empty">{props.empty}</p>}
        >
          <div class="an-computer-workspace" data-an-part="computer-workspace">
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
                title={AN_COMPUTER_ATTACH_SURFACE.cursorLabel}
                aria-label={AN_COMPUTER_ATTACH_SURFACE.cursorLabel}
              >
                <i class="an-computer-cursor-pointer" />
                <span class="an-computer-cursor-tag">{AN_COMPUTER_ATTACH_SURFACE.cursorLabel}</span>
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

function ModeSwitcher(props: {
  mode: AnShellMode
  onChange?: (mode: AnShellMode) => void
}) {
  return (
    <div
      class="an-mode-switch"
      role="radiogroup"
      aria-label="Shell mode (Conversation, Computer View, Takeover)"
    >
      <For each={[...AN_SHELL_MODES]}>
        {(id) => (
          <button
            type="button"
            class="an-mode-btn"
            role="radio"
            data-mode={id}
            data-active={props.mode === id ? "true" : "false"}
            aria-checked={props.mode === id}
            title={anShellModeLabel(id)}
            onClick={() => props.onChange?.(id)}
          >
            {anShellModeLabel(id)}
          </button>
        )}
      </For>
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
  const computerEmpty = () => props.computerEmpty ?? DEFAULT_COMPUTER_EMPTY
  const computerTitle = () => props.computerTitle ?? "Computer View"
  const computerLive = () => !!props.computerLive
  const computerNote = () =>
    props.computerNote ??
    (props.computerLive
      ? "Live = consented local browser attach + watch-only page feed. Bot holds the lock until Takeover. Bot cursor is overlay chrome — not in page captures."
      : "Watch-only Computer View — connect a local browser workspace to go Live. Takeover needs Live.")
  const computerUserInput = () => !!props.computerUserInput
  const computerFeedWatchOnly = () =>
    props.computerFeedWatchOnly !== undefined ? props.computerFeedWatchOnly : !computerUserInput()
  const takeoverBanner = () => computerControlBannerCopy(computerLive(), {
    controller: props.computerController ?? (computerLive() ? "bot" : "none"),
    botPaused: !!props.computerBotPaused,
    userInputGranted: computerUserInput(),
    needsFreshObservation: !!props.computerNeedsFreshObservation,
  })
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
      data-attention-always-on=""
      data-presence-personality={AN_PRESENCE_PERSONALITY.markers.personality}
    >
      <nav class="an-nav" aria-label="AN navigation">
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
              <NavIcon name={item.icon ?? item.id} />
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
                data-selected={member.selected ? "true" : "false"}
                data-presence={member.presence}
                title={`${member.name} · ${anPresenceLabel(member.presence)}`}
                aria-label={`${member.name}, ${member.role}, ${anPresenceLabel(member.presence)}`}
                onClick={() => props.onSelectMember?.(member.id)}
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
          <ModeSwitcher mode={mode()} onChange={props.onModeChange} />
        </header>

        <Show when={layout().computerPrimary}>
          <div
            class="an-takeover-stage"
            aria-label="Computer takeover"
            data-an-part={AN_COMPUTER_CONTROL_SURFACE.part}
            data-controller={props.computerController ?? (computerLive() ? "bot" : "none")}
            data-user-input={computerUserInput() ? "true" : "false"}
            data-bot-paused={props.computerBotPaused ? "true" : "false"}
          >
            <div class="an-takeover-banner" data-live={computerLive() ? "true" : "false"}>
              <span class="an-takeover-pill">{takeoverBanner().pill}</span>
              <span class="an-takeover-copy">{takeoverBanner().copy}</span>
            </div>
            <LiveComputerPanel
              title={computerTitle()}
              empty={computerEmpty()}
              note={computerNote()}
              size="primary"
              live={computerLive()}
              attachPhase={props.computerAttachPhase}
              attachPath={props.computerAttachPath}
              attachBackend={props.computerAttachBackend}
              pathLabel={props.computerAttachPathLabel}
              externalDraftEndpoint={props.computerExternalDraftEndpoint}
              externalDraftRegion={props.computerExternalDraftRegion}
              externalDraftFamily={props.computerExternalDraftFamily}
              externalEndpoint={props.computerExternalEndpoint}
              externalRegionId={props.computerExternalRegionId}
              cursorVisible={props.computerCursorVisible}
              feedActive={props.computerFeedActive}
              feedUrl={props.computerFeedUrl}
              feedSrcdoc={props.computerFeedSrcdoc}
              feedDraft={props.computerFeedDraft}
              feedWatchOnly={computerFeedWatchOnly()}
              screencastPhase={props.computerScreencastPhase}
              screencastFrameUrl={props.computerScreencastFrameUrl}
              screencastFrameCount={props.computerScreencastFrameCount}
              pixelSource={props.computerPixelSource}
              screencastStatus={props.computerScreencastStatus}
              controller={props.computerController}
              botPaused={props.computerBotPaused}
              userInput={computerUserInput()}
              needsFreshObservation={props.computerNeedsFreshObservation}
              onFeedDraftChange={props.onComputerFeedDraftChange}
              onFeedNavigate={props.onComputerFeedNavigate}
              onConnect={props.onComputerConnect}
              onConfirmAttach={props.onComputerConfirmAttach}
              onCancelConsent={props.onComputerCancelConsent}
              onDisconnect={props.onComputerDisconnect}
              onAttachPathChange={props.onComputerAttachPathChange}
              onExternalDraftChange={props.onComputerExternalDraftChange}
              onExternalProbe={props.onComputerExternalProbe}
              onExternalOpenTab={props.onComputerExternalOpenTab}
            />
            <div class="an-takeover-bar" role="toolbar" aria-label="Takeover controls">
              <button
                type="button"
                class="an-takeover-handback"
                data-action="computer-handback"
                onClick={() => props.onHandBack?.()}
              >
                Hand back
              </button>
              <button
                type="button"
                class="an-takeover-stop"
                data-action="computer-stop-takeover"
                onClick={() => props.onStopTakeover?.()}
              >
                Stop
              </button>
            </div>
          </div>
        </Show>

        <Show when={!layout().computerPrimary}>
          <div
            class="an-stream"
            data-an-own-conversation={ownConversation() ? "true" : "false"}
            data-an-cards-in-stream={ownConversation() ? "true" : "false"}
          >
            <StreamRegion
              cards={streamCards()}
              missionStackCards={missionStackCards()}
              streamItems={streamItems()}
              turns={conversationTurns()}
              conversationEmpty={props.conversationEmpty}
              ownConversation={ownConversation()}
              onCardAction={props.onStreamCardAction}
            >
              {props.children}
            </StreamRegion>
          </div>
        </Show>
      </section>

      <aside class="an-attention" aria-label="Attention and live computer">
        <Show when={layout().computerPrimary}>
          <div class="an-attention-header">Conversation</div>
          <div
            class="an-stream an-stream--rail"
            data-an-own-conversation={ownConversation() ? "true" : "false"}
            data-an-cards-in-stream={ownConversation() ? "true" : "false"}
          >
            <StreamRegion
              cards={streamCards()}
              missionStackCards={missionStackCards()}
              streamItems={streamItems()}
              turns={conversationTurns()}
              conversationEmpty={props.conversationEmpty}
              ownConversation={ownConversation()}
              onCardAction={props.onStreamCardAction}
            >
              {props.children}
            </StreamRegion>
          </div>
        </Show>

        <Show when={!layout().computerPrimary}>
          <LiveComputerPanel
            title={computerTitle()}
            empty={computerEmpty()}
            note={computerNote()}
            size={layout().computerBeside ? "large" : "compact"}
            live={computerLive()}
            attachPhase={props.computerAttachPhase}
            attachPath={props.computerAttachPath}
            attachBackend={props.computerAttachBackend}
            pathLabel={props.computerAttachPathLabel}
            externalDraftEndpoint={props.computerExternalDraftEndpoint}
            externalDraftRegion={props.computerExternalDraftRegion}
            externalDraftFamily={props.computerExternalDraftFamily}
            externalEndpoint={props.computerExternalEndpoint}
            externalRegionId={props.computerExternalRegionId}
            cursorVisible={props.computerCursorVisible}
            feedActive={props.computerFeedActive}
            feedUrl={props.computerFeedUrl}
            feedSrcdoc={props.computerFeedSrcdoc}
            feedDraft={props.computerFeedDraft}
            feedWatchOnly={computerFeedWatchOnly()}
            screencastPhase={props.computerScreencastPhase}
            screencastFrameUrl={props.computerScreencastFrameUrl}
            screencastFrameCount={props.computerScreencastFrameCount}
            pixelSource={props.computerPixelSource}
            screencastStatus={props.computerScreencastStatus}
            controller={props.computerController}
            botPaused={props.computerBotPaused}
            userInput={computerUserInput()}
            needsFreshObservation={props.computerNeedsFreshObservation}
            onFeedDraftChange={props.onComputerFeedDraftChange}
            onFeedNavigate={props.onComputerFeedNavigate}
            onConnect={props.onComputerConnect}
            onConfirmAttach={props.onComputerConfirmAttach}
            onCancelConsent={props.onComputerCancelConsent}
            onDisconnect={props.onComputerDisconnect}
            onAttachPathChange={props.onComputerAttachPathChange}
            onExternalDraftChange={props.onComputerExternalDraftChange}
            onExternalProbe={props.onComputerExternalProbe}
            onExternalOpenTab={props.onComputerExternalOpenTab}
          />
        </Show>

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
