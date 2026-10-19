import { Show, type JSX } from "solid-js"
import { aporiaAlerts } from "@/aporia/alerts"
import { AnCardStack } from "./an-card"
import type { AnCardAction, AnCardModel } from "./types"

/** Stream-prefixed AN card stack for AnShell sessions. */
export function AnStreamCards(props: {
  cards: AnCardModel[]
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
      <div class="an-stream-cards" data-component="an-stream-cards" aria-label="AN cards">
        <p class="an-stream-cards-label">Mission cards</p>
        <AnCardStack cards={props.cards} density="stream" onAction={handle} />
      </div>
    </Show>
  )
}
