import { For, Show, type JSX } from "solid-js"
import { anShellModeLabel, presenceDotClass, type AnShellMode } from "./tokens"
import type { AnShellProps } from "./types"
import "./an-shell.css"

const DEFAULT_NAV = [
  { id: "home", label: "Home", icon: "⌂", active: true },
  { id: "missions", label: "Missions", icon: "▦" },
  { id: "knowledge", label: "Knowledge", icon: "▣" },
  { id: "settings", label: "Settings", icon: "⚙" },
] as const

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase()
}

export function AnShell(props: AnShellProps): JSX.Element {
  const mode = (): AnShellMode => props.mode ?? "conversation"
  const nav = () => props.navItems ?? [...DEFAULT_NAV]
  const attention = () => props.attention ?? []
  const roster = () => props.roster ?? []
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
      data-attention-collapsed={attention().length === 0 ? "" : undefined}
    >
      <nav class="an-nav" aria-label="AN navigation">
        <div class="an-nav-brand" title={props.brandTitle ?? "Aporia Nous"} aria-label="AN">
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
          <strong>{props.rosterTitle ?? props.brandTitle ?? "Aporia Nous"}</strong>
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
          <span class="an-mode-chip" data-mode={mode()} title="Approved three-state framing (Stage 5 modes deferred)">
            {anShellModeLabel(mode())}
          </span>
        </header>
        <div class="an-stream">{props.children}</div>
      </section>

      <aside class="an-attention" aria-label="Attention">
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
