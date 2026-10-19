import { For, Show, type JSX } from "solid-js"
import {
  AN_PRODUCT_NAME,
  AN_SHELL_MODES,
  anShellLayout,
  anShellModeLabel,
  presenceDotClass,
  type AnShellMode,
} from "./tokens"
import type { AnShellProps } from "./types"
import "./an-shell.css"

const DEFAULT_NAV = [
  { id: "home", label: "Home", icon: "⌂", active: true },
  { id: "missions", label: "Missions", icon: "▦" },
  { id: "knowledge", label: "Knowledge", icon: "▣" },
  { id: "settings", label: "Settings", icon: "⚙" },
] as const

const DEFAULT_COMPUTER_EMPTY =
  "No live computer feed yet. Surface stays visible — attach a session to populate."

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase()
}

function LiveComputerPanel(props: {
  title: string
  empty: string
  size: "compact" | "large" | "primary"
  live?: boolean
}) {
  return (
    <section class="an-computer" data-size={props.size} aria-label={props.title}>
      <header class="an-computer-header">
        <strong>{props.title}</strong>
        <span class="an-computer-badge" data-live={props.live ? "true" : "false"}>
          {props.live ? "Live" : "Idle"}
        </span>
      </header>
      <div class="an-computer-surface" data-empty="true">
        <p class="an-computer-empty">{props.empty}</p>
      </div>
      <Show when={props.size !== "primary"}>
        <p class="an-computer-note">Watch only in View — input requires Takeover.</p>
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
      aria-label="Shell mode (Conversation, View, Takeover)"
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
  const computerEmpty = () => props.computerEmpty ?? DEFAULT_COMPUTER_EMPTY
  const computerTitle = () => props.computerTitle ?? "Live computer"
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
              <span aria-hidden="true">{item.icon ?? item.label.slice(0, 1)}</span>
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
                onClick={() => props.onSelectMember?.(member.id)}
              >
                <span class="an-roster-avatar" aria-hidden="true">
                  {member.avatar || initials(member.name)}
                  <i class={presenceDotClass(member.presence)} />
                </span>
                <span class="an-roster-text">
                  <strong>{member.name}</strong>
                  <span>{member.role}</span>
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
        <header class="an-mission">
          <div class="an-mission-copy">
            <strong>{props.mission?.title ?? "Mission"}</strong>
            <Show when={props.mission?.subtitle}>
              <span>{props.mission!.subtitle}</span>
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
          <Show when={(props.mission?.pills?.length ?? 0) > 0}>
            <div class="an-mission-pills">
              <For each={props.mission!.pills!}>
                {(pill) => (
                  <span class="an-pill" data-tone={pill.tone ?? "neutral"}>
                    {pill.label}
                  </span>
                )}
              </For>
            </div>
          </Show>
          <ModeSwitcher mode={mode()} onChange={props.onModeChange} />
        </header>

        <Show when={layout().computerPrimary}>
          <div class="an-takeover-stage" aria-label="Computer takeover">
            <div class="an-takeover-banner">
              <span class="an-takeover-pill">Live takeover</span>
              <span class="an-takeover-copy">
                You are controlling the computer surface. Backend may be stubbed — affordances stay honest.
              </span>
            </div>
            <LiveComputerPanel
              title={computerTitle()}
              empty={computerEmpty()}
              size="primary"
              live={false}
            />
            <div class="an-takeover-bar" role="toolbar" aria-label="Takeover controls">
              <button type="button" class="an-takeover-handback" onClick={() => props.onHandBack?.()}>
                Hand back
              </button>
              <button type="button" class="an-takeover-stop" onClick={() => props.onStopTakeover?.()}>
                Stop
              </button>
            </div>
          </div>
        </Show>

        <Show when={!layout().computerPrimary}>
          <div class="an-stream">{props.children}</div>
        </Show>
      </section>

      <aside class="an-attention" aria-label="Attention and live computer">
        <Show when={layout().computerPrimary}>
          <div class="an-attention-header">Conversation</div>
          <div class="an-stream an-stream--rail">{props.children}</div>
        </Show>

        <Show when={!layout().computerPrimary}>
          <LiveComputerPanel
            title={computerTitle()}
            empty={computerEmpty()}
            size={layout().computerBeside ? "large" : "compact"}
            live={false}
          />
        </Show>

        <div class="an-attention-header">{props.attentionTitle ?? "Attention"}</div>
        <div class="an-attention-list">
          <Show
            when={attention().length > 0}
            fallback={<p class="an-attention-empty">{props.attentionEmpty ?? "No blockers right now."}</p>}
          >
            <For each={attention()}>
              {(item) => (
                <button
                  type="button"
                  class="an-attention-card"
                  data-kind={item.kind ?? "info"}
                  onClick={() => props.onSelectAttention?.(item.id)}
                >
                  <strong>{item.title}</strong>
                  <Show when={item.detail}>
                    <span>{item.detail}</span>
                  </Show>
                </button>
              )}
            </For>
          </Show>
        </div>
      </aside>
    </div>
  )
}
