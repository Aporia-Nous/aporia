import { expect } from "bun:test"
import { Effect } from "effect"
import { tmpdir } from "../../core/test/fixture/tmpdir"
import { it } from "../../core/test/lib/effect"
import { startServer } from "./fixture/server"

// Stage 3 HTTP surface: the coordinator trigger is running inside a real server, the card list is
// served, an unknown card is a 404, and none of it is reachable without the server password.
it.live("serves attention cards and the running coordinator trigger", () =>
  Effect.gen(function* () {
    const tmp = yield* Effect.acquireDisposable(Effect.promise(() => tmpdir("aporia-mission-endpoint-")))
    const server = yield* startServer(tmp.path)
    const get = (path: string, headers: Record<string, string> = server.headers) =>
      Effect.promise(() => fetch(new URL(path, server.base), { headers }))
    const post = (path: string, body?: unknown) =>
      Effect.promise(() =>
        fetch(new URL(path, server.base), {
          method: "POST",
          headers: { ...server.headers, "content-type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        }),
      )

    const listed = yield* get("/api/mission/attention")
    expect(listed.status).toBe(200)
    const body = (yield* Effect.promise(() => listed.json())) as {
      data: unknown[]
      coordinator: { running: boolean; cursor: number; latest: number }
    }
    expect(body.data).toEqual([])
    expect(body.coordinator.running).toBe(true)
    expect(body.coordinator.cursor).toBe(body.coordinator.latest)

    const drained = yield* post("/api/mission/coordinator/drain")
    expect(drained.status).toBe(200)
    expect(((yield* Effect.promise(() => drained.json())) as { handled: number }).handled).toBe(0)

    const missing = yield* post("/api/mission/attention/evt_missing/resolve", {})
    expect(missing.status).toBe(404)

    const anonymous = yield* get("/api/mission/attention", {})
    expect(anonymous.status).toBe(401)
  }),
)
