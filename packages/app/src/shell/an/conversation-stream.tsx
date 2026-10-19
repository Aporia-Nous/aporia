import { For, Show, createEffect, type JSX } from "solid-js"
import type { AnConversationTurn } from "./conversation-turns"

export function AnConversationStream(props: {
  turns: AnConversationTurn[]
  emptyHint?: string
}): JSX.Element {
  let root: HTMLDivElement | undefined

  createEffect(() => {
    const count = props.turns.length
    const last = props.turns[count - 1]
    void last?.text
    void last?.streaming
    if (!root || count === 0) return
    requestAnimationFrame(() => {
      root?.scrollTo({ top: root.scrollHeight, behavior: "smooth" })
    })
  })

  return (
    <div
      ref={(el) => {
        root = el
      }}
      class="an-conversation"
      data-component="an-conversation"
      aria-label="Conversation"
    >
      <Show
        when={props.turns.length > 0}
        fallback={
          <p class="an-conversation-empty">
            {props.emptyHint ?? "Send a message — it will appear here in Conversation."}
          </p>
        }
      >
        <div class="an-conversation-list" role="log" aria-live="polite">
          <For each={props.turns}>
            {(turn) => (
              <article
                class="an-turn"
                data-role={turn.role}
                data-streaming={turn.streaming ? "true" : "false"}
                data-message-id={turn.id}
              >
                <header class="an-turn-meta">
                  <span class="an-turn-role">
                    {turn.role === "user" ? "You" : turn.agent?.trim() || "Assistant"}
                  </span>
                  <Show when={turn.streaming}>
                    <span class="an-turn-streaming">Speaking</span>
                  </Show>
                </header>
                <div class="an-turn-body" data-slot="an-turn-text">
                  {turn.text}
                </div>
              </article>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}
