import { expect } from "bun:test"
import { Effect } from "effect"
import { tmpdir } from "../../core/test/fixture/tmpdir"
import { it } from "../../core/test/lib/effect"
import { startServer } from "./fixture/server"

// Flow stage 1 HTTP surface (F1-8, F1-10): save, list, run by id, the same request is one run, the
// runner inside the real server finishes it, errors are 400/404, and nothing works without the password.
const greet = {
  id: "greet",
  name: "Greet",
  steps: [
    { id: "hello", type: "set", params: { fields: { text: "hello {{ input.text }}" } } },
    { id: "shout", type: "set", params: { fields: { loud: true } } },
  ],
  connections: [{ from: "hello", to: "shout" }],
}

it.live("saves, lists and runs a flow over HTTP; the runner in the server finishes it", () =>
  Effect.gen(function* () {
    const tmp = yield* Effect.acquireDisposable(Effect.promise(() => tmpdir("aporia-flow-endpoint-")))
    const server = yield* startServer(tmp.path)
    const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = server.headers) =>
      Effect.promise(async () => {
        const response = await fetch(new URL(path, server.base), {
          method,
          headers: body === undefined ? headers : { ...headers, "content-type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        })
        const text = await response.text()
        return { status: response.status, json: text ? (JSON.parse(text) as any) : undefined }
      })

    const empty = yield* call("GET", "/api/flow")
    expect(empty.status).toBe(200)
    expect(empty.json.data).toEqual([])
    expect(empty.json.runner.running).toBe(true)

    const bad = yield* call("POST", "/api/flow", { definition: { id: "Bad", name: "", steps: [], connections: [] } })
    expect(bad.status).toBe(400)
    expect(bad.json.problems.length).toBeGreaterThan(0)

    const saved = yield* call("POST", "/api/flow", { definition: greet })
    expect(saved.status).toBe(200)
    expect(saved.json.data).toEqual({ id: "greet", version: 1, created: true })
    expect((yield* call("POST", "/api/flow", { definition: greet })).json.data.created).toBe(false)
    expect((yield* call("GET", "/api/flow/greet")).json.data.version).toBe(1)
    expect((yield* call("GET", "/api/flow/missing")).status).toBe(404)

    const request = { requestId: "http-test-0001", input: { text: "ali" }, trigger: "slash" }
    const first = yield* call("POST", "/api/flow/greet/run", request)
    expect(first.status).toBe(200)
    expect(first.json.data.created).toBe(true)
    const again = yield* call("POST", "/api/flow/greet/run", request)
    expect(again.json.data).toEqual({ runId: first.json.data.runId, created: false })

    let detail: any
    for (let i = 0; i < 100; i++) {
      detail = (yield* call("GET", `/api/flow-runs/${first.json.data.runId}`)).json.data
      if (detail.status === "completed") break
      yield* Effect.promise(() => new Promise((resolve) => setTimeout(resolve, 50)))
    }
    expect(detail.status).toBe("completed")
    expect(detail.tokens).toBe(0)
    expect(detail.trigger).toBe("slash")
    expect(detail.steps.map((s: any) => s.status)).toEqual(["succeeded", "succeeded"])
    expect(JSON.parse(detail.output)[0]).toEqual({ text: "hello ali", loud: true })

    const runs = yield* call("GET", "/api/flow-runs?flowID=greet&limit=5")
    expect(runs.json.data).toHaveLength(1)
    const listed = yield* call("GET", "/api/flow")
    expect(listed.json.data[0].lastRun.status).toBe("completed")

    expect((yield* call("POST", "/api/flow/missing/run", { requestId: "http-test-0002" })).status).toBe(404)
    expect((yield* call("POST", "/api/flow/greet/run", { requestId: "x" })).status).toBe(400)
    expect((yield* call("GET", "/api/flow-runs/cor_missing")).status).toBe(404)
    expect((yield* call("GET", "/api/flow-runs/nope")).status).toBe(404)

    for (const [method, path] of [
      ["GET", "/api/flow"],
      ["POST", "/api/flow"],
      ["POST", "/api/flow/greet/run"],
      ["GET", "/api/flow-runs"],
    ] as const)
      expect((yield* call(method, path, method === "POST" ? {} : undefined, {})).status).toBe(401)
  }),
)
