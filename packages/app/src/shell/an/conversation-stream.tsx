import { For, Show, createEffect, type JSX } from "solid-js"
import { AnCard } from "./cards/an-card"
import type { AnCardAction, AnCardModel } from "./cards/types"
import type { AnConversationTurn } from "./conversation-turns"
import type { AnStreamItem } from "./conversation-stream-items"
import { aporiaAlerts } from "@/aporia/alerts"

function TurnArticle(props: { turn: AnConversationTurn }): JSX.Element {
  return (
    <article
      class="an-turn"
      data-role={props.turn.role}
      data-streaming={props.turn.streaming ? "true" : "false"}
      data-message-id={props.turn.id}
    >
      <header class="an-turn-meta">
        <span class="an-turn-role">
          {props.turn.role === "user" ? "You" : props.turn.agent?.trim() || "Assistant"}
        </span>
        <Show when={props.turn.streaming}>
          <span class="an-turn-streaming">Speaking</span>
        </Show>
      </header>
      <div class="an-turn-body" data-slot="an-turn-text">
        {props.turn.text}
      </div>
    </article>
  )
}

export function AnConversationStream(props: {
  /** Preferred: interleaved turns + cards (AP-STAGE4-15 mockup). */
  items?: AnStreamItem[]
  /** Legacy: turns-only when items not provided. */
  turns?: AnConversationTurn[]
  emptyHint?: string
  onCardAction?: (action: AnCardAction, card: AnCardModel) => void
}): JSX.Element {
  let root: HTMLDivElement | undefined

  const items = (): AnStreamItem[] => {
    if (props.items) return props.items
    return (props.turns ?? []).map((turn) => ({
      kind: "turn" as const,
      id: `turn:${turn.id}`,
      turn,
    }))
  }

  const hasContent = () => items().length > 0

  createEffect(() => {
    const list = items()
    const count = list.length
    const last = list[count - 1]
    void last?.kind === "turn" ? last.turn.text : last?.card.title
    void last?.kind === "turn" ? last.turn.streaming : undefined
    if (!root || count === 0) return
    requestAnimationFrame(() => {
      root?.scrollTo({ top: root.scrollHeight, behavior: "smooth" })
    })
  })

  const handleCardAction = (action: AnCardAction, card: AnCardModel) => {
    if (props.onCardAction) {
      props.onCardAction(action, card)
      return
    }
    if (action.stub) {
      aporiaAlerts.push({
        title: `${card.type} · ${action.label}`,
        detail: action.stubReason ?? "Action stub — backend not wired for this card yet.",
        level: "info",
      })
    }
  }

  return (
    <div
      ref={(el) => {
        root = el
      }}
      class="an-conversation"
      data-component="an-conversation"
      data-an-cards-in-stream="true"
      aria-label="Conversation"
    >
      <Show
        when={hasContent()}
        fallback={
          <p class="an-conversation-empty">
            {props.emptyHint ?? "Send a message — it will appear here in Conversation."}
          </p>
        }
      >
        <div class="an-conversation-list" role="log" aria-live="polite" data-an-part="conversation-list">
          <For each={items()}>
            {(item) =>
              item.kind === "turn" ? (
                <TurnArticle turn={item.turn} />
              ) : (
                <div
                  class="an-conversation-card"
                  data-an-part="in-conversation-card"
                  data-card-type={item.card.type}
                  data-card-id={item.card.id}
                >
                  <AnCard card={item.card} density="stream" onAction={handleCardAction} />
                </div>
              )
            }
          </For>
        </div>
      </Show>
    </div>
  )
}
