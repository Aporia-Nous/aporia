import { Show, type JSX } from "solid-js"
import { aporiaAlerts } from "@/aporia/alerts"
import { AnCardStack } from "./an-card"
import type { AnCardAction, AnCardModel } from "./types"

/** Stream-prefixed AN card stack — collapsed Mission strip or home legacy stack. */
export function AnStreamCards(props: {
  cards: AnCardModel[]
  /** Compact Mission stack above Conversation (not primary card surface). */
  collapsed?: boolean
  onAction?: (action: AnCardAction, card: AnCardModel) => void
}): JSX.Element {
  const handle = (action: AnCardAction, card: AnCardModel) => {
    if (props.onAction) {
      props.onAction(action, card)
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
    <Show when={props.cards.length > 0}>
      <div
        class="an-stream-cards"
        classList={{ "an-stream-cards--collapsed": !!props.collapsed }}
        data-component="an-stream-cards"
        data-collapsed={props.collapsed ? "true" : "false"}
        aria-label={props.collapsed ? "Mission stack (collapsed)" : "AN cards"}
      >
        <p class="an-stream-cards-label">{props.collapsed ? "Mission" : "Mission cards"}</p>
        <AnCardStack
          cards={props.cards}
          density={props.collapsed ? "compact" : "stream"}
          onAction={handle}
        />
      </div>
    </Show>
  )
}
