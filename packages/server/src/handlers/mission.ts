import { Mission } from "@opencode/core/mission"
import { AttentionCardNotFoundError } from "@opencode/protocol/errors"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { Api } from "../api"

export const MissionHandler = HttpApiBuilder.group(Api, "server.mission", (handlers) =>
  handlers
    .handle(
      "mission.attention.list",
      Effect.fn(function* (ctx) {
        const cards = yield* Mission.AttentionCards.Service
        const trigger = yield* Mission.CoordinatorTrigger.Service
        const data = yield* cards.list({
          state: ctx.query.state,
          missionID: ctx.query.missionID === undefined ? undefined : Mission.MissionID.make(ctx.query.missionID),
        })
        return { data, coordinator: yield* trigger.status }
      }),
    )
    .handle(
      "mission.attention.resolve",
      Effect.fn(function* (ctx) {
        const cards = yield* Mission.AttentionCards.Service
        const data = yield* cards
          .resolve({ cardID: ctx.params.cardID, resolution: ctx.payload.resolution })
          .pipe(
            Effect.catchTag("Mission.AttentionCardNotFound", (error) =>
              Effect.fail(
                new AttentionCardNotFoundError({ id: error.cardID, message: `Attention card not found: ${error.cardID}` }),
              ),
            ),
          )
        return { data }
      }),
    )
    .handle(
      "mission.coordinator.drain",
      Effect.fn(function* () {
        const trigger = yield* Mission.CoordinatorTrigger.Service
        const handled = yield* trigger.tick
        return { handled, coordinator: yield* trigger.status }
      }),
    ),
)
