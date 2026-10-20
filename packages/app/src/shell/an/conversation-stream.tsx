import { For, Show, createEffect, on, type JSX } from "solid-js"
import { AnCard } from "./cards/an-card"
import type { AnCardAction, AnCardModel } from "./cards/types"
import type { AnConversationTurn } from "./conversation-turns"
import type { AnStreamItem } from "./conversation-stream-items"
import { aporiaAlerts } from "@/aporia/alerts"
import type { AnDraftIdentity } from "./session-draft-store"
import {
  anScrollApplyIdentity,
  anScrollHasIdentity,
  anScrollSaveIdentity,
} from "./session-scroll-store"

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
  /** AP-STAGE4-MISSION-RESTART — restore/save scroll for this teammate/mission identity. */
  scrollIdentity?: AnDraftIdentity
}): JSX.Element {
  let root: HTMLDivElement | undefined
  /** After restore, skip one pin-to-bottom so mid-thread scroll survives A→B→A. */
  let restorePending = false

  const items = (): AnStreamItem[] => {
    if (props.items) return props.items
    return (props.turns ?? []).map((turn) => ({
      kind: "turn" as const,
      id: `turn:${turn.id}`,
      turn,
    }))
  }

  const hasContent = () => items().length > 0

  const identityKey = () => {
    const id = props.scrollIdentity
    if (!id) return ""
    return `${id.agent ?? ""}|${id.slug ?? ""}|${id.sessionID ?? ""}`
  }

  createEffect(
    on(identityKey, (key) => {
      if (!key || !root) return
      restorePending = true
      requestAnimationFrame(() => {
        if (!root || !props.scrollIdentity) return
        const applied = anScrollApplyIdentity(root, props.scrollIdentity)
        if (!applied) restorePending = false
        else {
          // Keep restorePending true until after the content-effect runs once.
          requestAnimationFrame(() => {
            restorePending = false
          })
        }
      })
    }),
  )

  createEffect(() => {
    const list = items()
    const count = list.length
    const last = list[count - 1]
    void last?.kind === "turn" ? last.turn.text : last?.card.title
    void last?.kind === "turn" ? last.turn.streaming : undefined
    if (!root || count === 0) return
    if (restorePending) return
    const streaming = last?.kind === "turn" && last.turn.streaming
    const hasSaved =
      !!props.scrollIdentity && anScrollHasIdentity(props.scrollIdentity)
    // Pin to bottom on streaming / no identity / no saved mid-scroll; keep restored position otherwise.
    if (streaming || !props.scrollIdentity || !hasSaved) {
      requestAnimationFrame(() => {
        root?.scrollTo({ top: root.scrollHeight, behavior: "auto" })
      })
    }
  })

  const onScroll = () => {
    if (!root || !props.scrollIdentity || restorePending) return
    anScrollSaveIdentity(props.scrollIdentity, root.scrollTop)
  }

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
        if (el && props.scrollIdentity) {
          restorePending = true
          requestAnimationFrame(() => {
            anScrollApplyIdentity(el, props.scrollIdentity!)
            requestAnimationFrame(() => {
              restorePending = false
            })
          })
        }
      }}
      class="an-conversation"
      data-component="an-conversation"
      data-an-cards-in-stream="true"
      data-an-scroll-key={identityKey() || undefined}
      aria-label="Conversation"
      onScroll={onScroll}
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
