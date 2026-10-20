export * as AttentionCards from "./cards.js"

import { Context, Effect, Layer } from "effect"
import { makeGlobalNode } from "@opencode/util/effect/app-node"
import { Coordinator } from "./coordinator.js"
import { MissionEvents } from "./event.js"
import { MissionSchema } from "./schema.js"

// An attention card is not a table. It is a `coordination.attention` fact, and resolving it is one
// more fact, `attention.resolved`. The card's state is folded from the log in order, the same way a
// coordination thread is, so a restart has nothing to repair and nothing can drift: the same log
// always folds to the same cards.
//
// Resolving is idempotent by key (`resolve:<card id>`) and inert by rule: `attention.resolved` is an
// outcome in `Coordination`, so `decide` returns nothing for it and dealing with a card never wakes
// anybody.

export type CardState = "open" | "resolved"

export interface Card {
  /** The id of the `coordination.attention` event. Stable for the card's whole life. */
  readonly id: MissionSchema.MissionEventID
  /** That event's idempotency key: why there is exactly one card for one approval. */
  readonly key: string
  readonly title: string
  readonly body: string
  readonly state: CardState
  readonly correlationId: MissionSchema.CorrelationID
  readonly missionId?: MissionSchema.MissionID
  readonly taskId?: MissionSchema.TaskID
  readonly createdAt: number
  readonly resolvedAt?: number
  readonly resolvedBy?: string
  readonly resolution?: string
}

const CARD_TYPES: ReadonlyArray<MissionSchema.MissionEventType> = ["coordination.attention", "attention.resolved"]

const text = (event: MissionSchema.MissionEvent, key: string): string | undefined => {
  const value = event.payload[key]
  return typeof value === "string" && value.length > 0 ? value : undefined
}

/** Pure: events in log order -> cards in creation order. Unknown or repeated resolutions are ignored. */
export const fold = (events: ReadonlyArray<MissionSchema.MissionEvent>): ReadonlyArray<Card> => {
  const cards = new Map<string, Card>()
  for (const event of events) {
    if (event.type === "coordination.attention") {
      if (cards.has(event.id)) continue
      cards.set(event.id, {
        id: event.id,
        key: event.idempotencyKey,
        title: text(event, "title") ?? "Attention needed",
        body: text(event, "body") ?? "",
        state: "open",
        correlationId: event.correlationId,
        missionId: event.missionId,
        taskId: event.taskId,
        createdAt: event.createdAt,
      })
      continue
    }
    if (event.type !== "attention.resolved") continue
    const id = text(event, "card")
    const card = id === undefined ? undefined : cards.get(id)
    if (card === undefined || card.state === "resolved") continue
    cards.set(card.id, {
      ...card,
      state: "resolved",
      resolvedAt: event.createdAt,
      resolvedBy: event.actor.id,
      resolution: text(event, "resolution"),
    })
  }
  return [...cards.values()]
}

export interface ListInput {
  /** Default `open`. */
  readonly state?: CardState | "all"
  readonly missionID?: MissionSchema.MissionID
}

export interface ResolveInput {
  readonly cardID: string
  /** Who resolved it, as a person names themselves. Defaults to `user`. */
  readonly by?: string
  readonly resolution?: string
}

export interface Interface {
  /** Newest first. */
  readonly list: (input?: ListInput) => Effect.Effect<ReadonlyArray<Card>>
  readonly resolve: (input: ResolveInput) => Effect.Effect<Card, MissionSchema.AttentionCardNotFoundError>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/MissionAttentionCards") {}

export const make = Effect.fn("AttentionCards.make")(function* () {
  const events = yield* MissionEvents.Service
  const coordinator = yield* Coordinator.Service

  const all = Effect.fn("AttentionCards.all")(function* (missionID?: MissionSchema.MissionID) {
    return fold(yield* events.list({ types: CARD_TYPES, missionID }))
  })

  const list = Effect.fn("AttentionCards.list")(function* (input?: ListInput) {
    const state = input?.state ?? "open"
    const cards = yield* all(input?.missionID)
    return cards
      .filter((card) => state === "all" || card.state === state)
      .sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? 1 : -1))
  })

  const resolve = Effect.fn("AttentionCards.resolve")(function* (input: ResolveInput) {
    const find = Effect.map(all(), (cards) => cards.find((card) => card.id === input.cardID))
    const card = yield* find
    if (card === undefined) return yield* new MissionSchema.AttentionCardNotFoundError({ cardID: input.cardID })
    if (card.state === "resolved") return card
    yield* coordinator.emit({
      type: "attention.resolved",
      actor: { kind: "user", id: input.by ?? "user" },
      idempotencyKey: `resolve:${card.id}`,
      correlationId: card.correlationId,
      missionId: card.missionId,
      taskId: card.taskId,
      payload: input.resolution === undefined ? { card: card.id } : { card: card.id, resolution: input.resolution },
    })
    const after = yield* find
    return after ?? card
  })

  return Service.of({ list, resolve })
})

export const layer = Layer.effect(Service, make())

export const node = makeGlobalNode({
  service: Service,
  layer,
  deps: [MissionEvents.node, Coordinator.node],
})
