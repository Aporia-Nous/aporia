import { For, Show, type JSX } from "solid-js"
import { anCardLabel, type AnCardAction, type AnCardModel, type AnCardType } from "./types"
import "./an-card.css"

const TYPE_GLYPH: Record<AnCardType, string> = {
  task: "▣",
  approval: "◇",
  decision: "⚖",
  proof: "✓",
  computer: "▭",
  team: "☰",
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase()
}

export type AnCardProps = {
  card: AnCardModel
  density?: "stream" | "rail" | "compact"
  onAction?: (action: AnCardAction, card: AnCardModel) => void
}

export function AnCard(props: AnCardProps): JSX.Element {
  const card = () => props.card
  const density = () => props.density ?? "stream"
  const progressPct = () => {
    const p = card().progress
    if (!p || p.total <= 0) return undefined
    return Math.max(0, Math.min(100, Math.round((p.current / p.total) * 100)))
  }

  return (
    <article
      class="an-card"
      data-component="an-card"
      data-type={card().type}
      data-density={density()}
      data-source={card().source ?? "unknown"}
    >
      <header class="an-card-header">
        <span class="an-card-type" data-type={card().type}>
          <i class="an-card-glyph" aria-hidden="true">
            {TYPE_GLYPH[card().type]}
          </i>
          <span>{anCardLabel(card().type)}</span>
        </span>
        <Show when={card().status}>
          <span class="an-card-status" data-tone={card().statusTone ?? "neutral"}>
            <i aria-hidden="true" />
            {card().status}
          </span>
        </Show>
        <Show when={card().priority}>
          <span class="an-card-priority">{card().priority}</span>
        </Show>
        <Show when={card().author || card().meta}>
          <span class="an-card-meta">
            <Show when={card().author}>
              <em>{card().author}</em>
            </Show>
            <Show when={card().meta}>
              <span>{card().meta}</span>
            </Show>
          </span>
        </Show>
      </header>

      <div class="an-card-body">
        <strong class="an-card-title">{card().title}</strong>
        <Show when={card().detail}>
          <p class="an-card-detail">{card().detail}</p>
        </Show>

        <Show when={progressPct() !== undefined}>
          <div
            class="an-card-progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressPct()}
          >
            <span class="an-card-progress-track">
              <i style={{ width: `${progressPct()}%` }} />
            </span>
            <span>
              {card().progress!.current}/{card().progress!.total}
            </span>
          </div>
        </Show>

        <Show when={(card().checklist?.length ?? 0) > 0}>
          <ul class="an-card-checklist">
            <For each={card().checklist!}>
              {(item) => (
                <li data-done={item.done ? "true" : "false"}>
                  <i aria-hidden="true" />
                  <span>{item.label}</span>
                </li>
              )}
            </For>
          </ul>
        </Show>

        <Show when={(card().tags?.length ?? 0) > 0}>
          <div class="an-card-tags">
            <For each={card().tags!}>{(tag) => <span class="an-card-tag">{tag}</span>}</For>
          </div>
        </Show>

        <Show when={(card().members?.length ?? 0) > 0}>
          <div class="an-card-members" aria-label="Team members">
            <For each={card().members!}>
              {(m) => (
                <span class="an-card-avatar" title={m.name}>
                  {m.avatar || initials(m.name)}
                </span>
              )}
            </For>
          </div>
        </Show>
      </div>

      <Show when={(card().actions?.length ?? 0) > 0}>
        <footer class="an-card-actions">
          <For each={card().actions!}>
            {(action) => (
              <button
                type="button"
                class="an-card-btn"
                data-variant={action.variant ?? "secondary"}
                data-stub={action.stub ? "true" : "false"}
                title={action.stub ? (action.stubReason ?? "Action stub — backend not wired") : undefined}
                onClick={() => props.onAction?.(action, card())}
              >
                {action.label}
              </button>
            )}
          </For>
        </footer>
      </Show>
    </article>
  )
}

export function AnCardStack(props: {
  cards: AnCardModel[]
  density?: "stream" | "rail" | "compact"
  empty?: JSX.Element
  onAction?: (action: AnCardAction, card: AnCardModel) => void
}): JSX.Element {
  return (
    <div class="an-card-stack" data-component="an-card-stack" data-density={props.density ?? "stream"}>
      <Show when={props.cards.length > 0} fallback={props.empty}>
        <For each={props.cards}>
          {(card) => <AnCard card={card} density={props.density} onAction={props.onAction} />}
        </For>
      </Show>
    </div>
  )
}
