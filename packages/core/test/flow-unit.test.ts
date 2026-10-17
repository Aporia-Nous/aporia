import { describe, expect, test } from "bun:test"
import { FlowDefinition, FlowExpr, FlowHttp, FlowRun, FlowSteps } from "../src/flow.js"

// The pure parts of flow stage 1: the expression language, validation, the deterministic steps and
// the run planner. No database, no clock, no network.

const scope = (item: Record<string, unknown>, extra: Partial<FlowExpr.Scope> = {}): FlowExpr.Scope => ({
  item: item as FlowExpr.Item,
  items: [item as FlowExpr.Item],
  input: { who: "ali" },
  steps: { first: { id: 7 } },
  ...extra,
})

describe("expressions", () => {
  test("a whole template keeps the value's type; inline templates interpolate", () => {
    const s = scope({ n: 3, list: [1, { deep: "x" }], obj: { a: 1 } })
    expect(FlowExpr.resolve("{{ item.n }}", s)).toBe(3)
    expect(FlowExpr.resolve("{{item.list.1.deep}}", s)).toBe("x")
    expect(FlowExpr.resolve("n={{ item.n }} who={{ input.who }} step={{ steps.first.id }}", s)).toBe("n=3 who=ali step=7")
    expect(FlowExpr.resolve("{{ item.obj }}", s)).toEqual({ a: 1 })
    expect(FlowExpr.resolve("o={{ item.obj }}", s)).toBe('o={"a":1}')
    expect(FlowExpr.resolve({ k: ["{{ item.n }}"] }, s)).toEqual({ k: [3] })
    expect(FlowExpr.resolve("{{ item.missing }}", s)).toBeNull()
    expect(FlowExpr.resolve("[{{ item.missing }}]", s)).toBe("[]")
  })

  test("paths cannot reach code or the prototype", () => {
    const s = scope({ a: 1 })
    expect(FlowExpr.resolve("{{ item.constructor }}", s)).toBeNull()
    expect(FlowExpr.resolve("{{ item.__proto__ }}", s)).toBeNull()
    expect(FlowExpr.parsePath("process.env").ok).toBe(false)
    expect(FlowExpr.parsePath("item.a()").ok).toBe(false)
    expect(FlowExpr.parsePath("item['a']").ok).toBe(false)
    expect(FlowExpr.parsePath(["item", ...Array(16).fill("a")].join(".")).ok).toBe(false)
    // An expression is a path, not code: this is just text.
    expect(FlowExpr.resolve("{{ 1 + 1 }}", s)).toBeNull()
  })

  test("conditions compare, combine and never coerce", () => {
    const s = scope({ n: 3, name: "flow engine", tags: ["a", "b"], empty: [] })
    const t = (c: FlowExpr.Condition) => FlowExpr.test(c, s)
    expect(t({ left: "{{ item.n }}", op: "gt", right: 2 })).toBe(true)
    expect(t({ left: "{{ item.n }}", op: "lte", right: 2 })).toBe(false)
    expect(t({ left: "{{ item.n }}", op: "gt", right: "2" })).toBe(false)
    expect(t({ left: "{{ item.n }}", op: "equals", right: 3 })).toBe(true)
    expect(t({ left: "{{ item.name }}", op: "contains", right: "engine" })).toBe(true)
    expect(t({ left: "{{ item.name }}", op: "startsWith", right: "flow" })).toBe(true)
    expect(t({ left: "{{ item.name }}", op: "endsWith", right: "flow" })).toBe(false)
    expect(t({ left: "{{ item.tags }}", op: "contains", right: "b" })).toBe(true)
    expect(t({ left: "{{ item.empty }}", op: "isEmpty" })).toBe(true)
    expect(t({ left: "{{ item.nope }}", op: "notExists" })).toBe(true)
    expect(t({ all: [{ left: "{{ item.n }}", op: "exists" }, { not: { left: "{{ item.n }}", op: "equals", right: 4 } }] })).toBe(true)
    expect(t({ any: [{ left: 1, op: "equals", right: 2 }, { left: "a", op: "notEquals", right: "b" }] })).toBe(true)
    expect(FlowExpr.checkCondition({ left: 1, op: "matches" }, "c")).toHaveLength(1)
    expect(FlowExpr.checkCondition({ left: "{{ env.HOME }}", op: "exists" }, "c")).toHaveLength(1)
  })
})

const minimal = (extra: Record<string, unknown> = {}) => ({
  id: "ok",
  name: "OK",
  steps: [{ id: "a", type: "set", params: { fields: { x: 1 } } }],
  connections: [],
  ...extra,
})

describe("validation", () => {
  test("a minimal flow is valid", () => {
    expect(FlowDefinition.validate(minimal())).toEqual([])
  })

  test("ids, names, step types, connections and cycles are checked", () => {
    expect(FlowDefinition.validate(minimal({ id: "Bad id" })).join()).toContain("id:")
    expect(FlowDefinition.validate(minimal({ steps: [{ id: "a", type: "code", params: {} }] })).join()).toContain("code")
    const cycle = {
      id: "cyc",
      name: "Cycle",
      steps: [
        { id: "a", type: "set", params: { fields: { x: 1 } } },
        { id: "b", type: "set", params: { fields: { x: 1 } } },
      ],
      connections: [
        { from: "a", to: "b" },
        { from: "b", to: "a" },
      ],
    }
    const problems = FlowDefinition.validate(cycle).join("\n")
    expect(problems).toMatch(/cycle|entry/)
    const twice = minimal({
      steps: [
        { id: "a", type: "set", params: { fields: { x: 1 } } },
        { id: "a", type: "set", params: { fields: { x: 2 } } },
      ],
    })
    expect(FlowDefinition.validate(twice).join()).toContain("repeated")
    const dangling = minimal({ connections: [{ from: "a", to: "ghost" }] })
    expect(FlowDefinition.validate(dangling).join()).toContain("ghost")
    const badOutput = {
      ...minimal(),
      steps: [
        { id: "a", type: "if", params: { condition: { left: 1, op: "exists" } } },
        { id: "b", type: "set", params: { fields: { x: 1 } } },
      ],
      connections: [{ from: "a", output: "maybe", to: "b" }],
    }
    expect(FlowDefinition.validate(badOutput).join()).toContain("maybe")
    const toomany = minimal({
      steps: Array.from({ length: FlowDefinition.MAX_STEPS + 1 }, (_, i) => ({ id: `s${i}`, type: "set", params: { fields: { x: 1 } } })),
    })
    expect(FlowDefinition.validate(toomany).length).toBeGreaterThan(0)
  })

  test("http: declared exact hosts only, no template host, no credentials", () => {
    const http = (params: Record<string, unknown>, hosts?: string[]) =>
      FlowDefinition.validate({
        id: "h",
        name: "H",
        ...(hosts ? { permissions: { hosts } } : {}),
        steps: [{ id: "call", type: "http", params }],
        connections: [],
      }).join("\n")
    expect(http({ url: "https://api.example.com/x" }, ["api.example.com"])).toBe("")
    expect(http({ url: "https://api.example.com/x" })).toContain("not declared")
    expect(http({ url: "https://evil.example.com/x" }, ["api.example.com"])).toContain("not declared")
    expect(http({ url: "https://{{ input.host }}/x" }, ["api.example.com"])).toContain("host")
    expect(http({ url: "https://api.example.com/{{ item.id }}" }, ["api.example.com"])).toBe("")
    expect(http({ url: "file:///etc/passwd" }, ["api.example.com"])).toContain("http or https")
    expect(http({ url: "https://api.example.com/", headers: { Authorization: "Bearer x" } }, ["api.example.com"])).toContain(
      "credential",
    )
    expect(http({ url: "https://api.example.com/", headers: { cookie: "a=b" } }, ["api.example.com"])).toContain("credential")
    expect(http({ url: "https://api.example.com/", method: "TRACE" }, ["api.example.com"])).toContain("TRACE")
    expect(http({ url: "https://api.example.com/", maxAttempts: 9 }, ["api.example.com"])).toContain("maxAttempts")
  })

  test("safety: GET and HEAD are idempotent, other methods unsafe unless declared, the rest pure", () => {
    const step = (type: string, params: Record<string, unknown> = {}) => ({ id: "s", type, params }) as FlowDefinition.Step
    expect(FlowDefinition.safety(step("http", { method: "GET" }))).toBe("idempotent")
    expect(FlowDefinition.safety(step("http", { method: "HEAD" }))).toBe("idempotent")
    expect(FlowDefinition.safety(step("http", { method: "POST" }))).toBe("unsafe")
    expect(FlowDefinition.safety(step("http", { method: "DELETE", idempotent: true }))).toBe("idempotent")
    expect(FlowDefinition.safety(step("set"))).toBe("pure")
    expect(FlowDefinition.safety(step("merge"))).toBe("pure")
  })

  test("the canonical form ignores key order", () => {
    expect(FlowDefinition.canonical(minimal() as FlowDefinition.Definition)).toBe(
      FlowDefinition.canonical(Object.fromEntries(Object.entries(minimal()).reverse()) as unknown as FlowDefinition.Definition),
    )
  })
})

const run = (step: Record<string, unknown>, inputs: FlowExpr.Item[][]) =>
  FlowSteps.runPure(step as unknown as FlowDefinition.Step, { inputs, input: { who: "ali" }, steps: {} })

describe("verifier findings: headers, userinfo, scheme, __proto__", () => {
  const http = (params: Record<string, unknown>) => ({
    id: "f",
    name: "F",
    permissions: { hosts: ["h.example"] },
    steps: [{ id: "s", type: "http", params: { url: "https://h.example/", ...params } }],
  })

  test("routing, hop-by-hop and credential headers are refused; ordinary ones are not", () => {
    for (const name of ["Host", "connection", "Keep-Alive", "Transfer-Encoding", "TE", "Trailer", "Upgrade", "Content-Length", "Expect", "Forwarded", "Via", "X-Real-IP", "Proxy-Connection", "Proxy-Anything", "X-Forwarded-For", "x-forwarded-host", "X-HTTP-Method-Override", "Authorization", "Cookie"])
      expect(FlowDefinition.headerProblem(name)).toBeDefined()
    expect(FlowDefinition.headerProblem("bad name")).toContain("not a valid header name")
    for (const name of ["Accept", "Content-Type", "X-Request-Id", "User-Agent"]) expect(FlowDefinition.headerProblem(name)).toBeUndefined()
    const problems = FlowDefinition.validate(http({ headers: { Host: "evil.example", Accept: "x" } }))
    expect(problems.join(" ")).toContain("header Host decides where or how the request travels")
    expect(problems.join(" ")).not.toContain("Accept")
  })

  test("a url with a user name or password is refused, literal or templated", () => {
    expect(FlowDefinition.urlProblem("https://u:p@h.example/")).toContain("user name or password")
    expect(FlowDefinition.urlProblem("https://u@h.example/")).toContain("user name or password")
    expect(FlowDefinition.urlProblem("https://h.example/")).toBeUndefined()
    expect(FlowDefinition.urlProblem("ftp://h.example/")).toBe("url must be http or https")
    expect(FlowDefinition.validate(http({ url: "https://u:p@h.example/" })).join(" ")).toContain("user name or password")
    expect(FlowDefinition.validate(http({ url: "https://u:p@h.example/{{ item.id }}" })).join(" ")).toContain("user name or password")
    expect(FlowDefinition.validate(http({}))).toEqual([])
  })

  test("the scheme a url declares is the one it keeps", () => {
    expect(FlowDefinition.schemeOf("https://h.example/{{ item.p }}")).toBe("https")
    expect(FlowDefinition.schemeOf("HTTP://h.example/")).toBe("http")
    expect(FlowDefinition.schemeOf("{{ item.url }}")).toBeUndefined()
  })

  test("__proto__ is refused as a set or rename target, and stays a plain field when resolved", () => {
    const set = JSON.parse('{"id":"f","name":"F","steps":[{"id":"s","type":"set","params":{"fields":{"__proto__":{"x":1}}}}]}')
    expect(FlowDefinition.validate(set).join(" ")).toContain('set may not write the field "__proto__"')
    const rename = { id: "f", name: "F", steps: [{ id: "s", type: "transform", params: { rename: { a: "__proto__" } } }] }
    expect(FlowDefinition.validate(rename).join(" ")).toContain('rename may not write the field "__proto__"')
    const input = { inputs: [[{ a: 1 }]], input: {}, steps: {} }
    expect(() => FlowSteps.runPure(set.steps[0], input)).toThrow("__proto__")
    expect(() => FlowSteps.runPure(rename.steps[0] as unknown as FlowDefinition.Step, input)).toThrow("__proto__")
    const resolved = FlowExpr.resolve(JSON.parse('{"__proto__":{"polluted":true}}'), scope({})) as Record<string, unknown>
    expect(Object.getPrototypeOf(resolved)).toBe(Object.prototype)
    expect(Object.prototype.hasOwnProperty.call(resolved, "__proto__")).toBe(true)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })
})

describe("pure steps", () => {
  test("set adds fields per item, keeps or drops the rest, and starts from nothing", () => {
    expect(run({ id: "s", type: "set", params: { fields: { b: "{{ item.a }}!" } } }, [[{ a: 1 }, { a: 2 }]]).main).toEqual([
      { a: 1, b: "1!" },
      { a: 2, b: "2!" },
    ])
    expect(run({ id: "s", type: "set", params: { fields: { b: 1 }, keepOnlySet: true } }, [[{ a: 1 }]]).main).toEqual([{ b: 1 }])
    expect(run({ id: "s", type: "set", params: { fields: { who: "{{ input.who }}" } } }, [[]]).main).toEqual([{ who: "ali" }])
  })

  test("transform filters, sorts, limits, renames and picks", () => {
    const items = [{ n: 2, x: "b" }, { n: 1, x: "a" }, { n: 3, x: "c" }, { n: 0, x: "z" }]
    const out = run(
      {
        id: "t",
        type: "transform",
        params: {
          filter: { left: "{{ item.n }}", op: "gt", right: 0 },
          sortBy: { field: "n", order: "desc" },
          limit: 2,
          rename: { x: "letter" },
          pick: ["letter"],
        },
      },
      [items],
    )
    expect(out.main).toEqual([{ letter: "c" }, { letter: "b" }])
    expect(run({ id: "t", type: "transform", params: { omit: ["x"] } }, [[{ n: 1, x: "a" }]]).main).toEqual([{ n: 1 }])
  })

  test("if and switch split items by condition", () => {
    const items = [{ n: 1 }, { n: 5 }]
    const split = run({ id: "i", type: "if", params: { condition: { left: "{{ item.n }}", op: "gt", right: 2 } } }, [items])
    expect(split).toEqual({ true: [{ n: 5 }], false: [{ n: 1 }] })
    const routed = run(
      {
        id: "w",
        type: "switch",
        params: { cases: [{ output: "small", when: { left: "{{ item.n }}", op: "lt", right: 2 } }], fallback: "rest" },
      },
      [items],
    )
    expect(routed).toEqual({ small: [{ n: 1 }], rest: [{ n: 5 }] })
  })

  test("merge appends or combines by position", () => {
    const a = [{ a: 1 }, { a: 2 }]
    const b = [{ b: 1 }]
    expect(run({ id: "m", type: "merge", params: {} }, [a, b]).main).toEqual([{ a: 1 }, { a: 2 }, { b: 1 }])
    expect(run({ id: "m", type: "merge", params: { mode: "combine" } }, [a, b]).main).toEqual([{ a: 1, b: 1 }, { a: 2 }])
  })
})

describe("planner", () => {
  const def = {
    id: "p",
    name: "P",
    permissions: { hosts: ["h.example"] },
    steps: [
      { id: "a", type: "set", params: { fields: { x: 1 } } },
      { id: "send", type: "http", params: { method: "POST", url: "https://h.example/" } },
    ],
    connections: [{ from: "a", to: "send" }],
  } as unknown as FlowDefinition.Definition
  let seq = 0
  const ev = (type: string, payload: Record<string, unknown>, id = `evt_${++seq}`): FlowRun.RunEvent => ({
    seq,
    id,
    type,
    payload: payload as FlowRun.RunEvent["payload"],
    createdAt: seq,
  })
  const requested = ev("flow.run.requested", { flowId: "p", version: 1, input: {}, trigger: "manual", depth: 0 })
  const aDone = [
    ev("flow.step.started", { step: "a", attempt: 1, type: "set" }),
    ev("flow.step.succeeded", { step: "a", attempt: 1, outputs: { main: [{ x: 1 }] }, tokens: 0 }),
  ]
  const sendStarted = ev("flow.step.started", { step: "send", attempt: 1, type: "http" })

  test("starts the entry step, then the next one, then completes", () => {
    expect(FlowRun.plan(def, FlowRun.fold("cor_r", [requested])!, 0)).toMatchObject({ kind: "start", attempt: 1 })
    const afterA = FlowRun.plan(def, FlowRun.fold("cor_r", [requested, ...aDone])!, 0)
    expect(afterA.kind === "start" && afterA.step.id).toBe("send")
  })

  test("an unsafe step with no result raises a card, waits for it, and obeys the resolution", () => {
    const cut = [requested, ...aDone, sendStarted]
    expect(FlowRun.plan(def, FlowRun.fold("cor_r", cut)!, 0).kind).toBe("raise-card")
    const card = ev("coordination.attention", { flowRun: "cor_r", step: "send", attempt: 1, title: "t", body: "b" }, "evt_card")
    expect(FlowRun.plan(def, FlowRun.fold("cor_r", [...cut, card])!, 0).kind).toBe("idle")
    // A card for another run does not count.
    const other = ev("coordination.attention", { flowRun: "cor_other", step: "send", attempt: 1 })
    expect(FlowRun.plan(def, FlowRun.fold("cor_r", [...cut, other])!, 0).kind).toBe("raise-card")
    const again = ev("attention.resolved", { card: "evt_card", resolution: FlowRun.RUN_AGAIN })
    expect(FlowRun.plan(def, FlowRun.fold("cor_r", [...cut, card, again])!, 0)).toMatchObject({ kind: "start", attempt: 2 })
    const stop = ev("attention.resolved", { card: "evt_card", resolution: "no" })
    expect(FlowRun.plan(def, FlowRun.fold("cor_r", [...cut, card, stop])!, 0).kind).toBe("give-up")
    const silent = ev("attention.resolved", { card: "evt_card" })
    expect(FlowRun.plan(def, FlowRun.fold("cor_r", [...cut, card, silent])!, 0).kind).toBe("give-up")
  })

  test("a retryable failure waits for its time; a final one fails the run", () => {
    const failed = ev("flow.step.failed", { step: "send", attempt: 1, error: "HTTP 503", final: false, retryAt: 1000 })
    const state = FlowRun.fold("cor_r", [requested, ...aDone, sendStarted, failed])!
    expect(FlowRun.plan(def, state, 999)).toMatchObject({ kind: "idle", until: 1000 })
    expect(FlowRun.plan(def, state, 1000)).toMatchObject({ kind: "start", attempt: 2 })
    const final = ev("flow.step.failed", { step: "send", attempt: 1, error: "HTTP 404", final: true })
    expect(FlowRun.plan(def, FlowRun.fold("cor_r", [requested, ...aDone, sendStarted, final])!, 0).kind).toBe("fail")
  })

  test("duplicate events fold once and a finished run plans nothing", () => {
    const state = FlowRun.fold("cor_r", [requested, ...aDone, ...aDone])!
    expect(state.steps.get("a")).toHaveLength(1)
    const done = ev("flow.run.completed", { output: [], tokens: 0 })
    expect(FlowRun.plan(def, FlowRun.fold("cor_r", [requested, done])!, 0).kind).toBe("none")
  })

  test("a started step whose owner is still running it waits; once it is not, it is a crash", () => {
    const owned = ev("flow.step.started", { step: "send", attempt: 1, type: "http", owner: "r1", boot: "b1" })
    const state = FlowRun.fold("cor_r", [requested, ...aDone, owned])!
    const live: FlowRun.InFlight = (_step, attempt) => attempt.payload.owner === "r1" && attempt.payload.boot === "b1"
    expect(FlowRun.plan(def, state, 0, live)).toMatchObject({ kind: "idle", reason: "send is running" })
    expect(FlowRun.plan(def, state, 0, () => false).kind).toBe("raise-card")
    expect(FlowRun.plan(def, state, 0).kind).toBe("raise-card")
  })

  test("http backoff doubles to a cap and unsafe calls get one attempt", () => {
    expect([1, 2, 3, 6, 10].map(FlowHttp.backoff)).toEqual([1000, 2000, 4000, 30000, 30000])
    expect(FlowHttp.maxAttempts({ id: "s", type: "http", params: { method: "POST" } } as FlowDefinition.Step)).toBe(1)
    expect(FlowHttp.maxAttempts({ id: "s", type: "http", params: {} } as FlowDefinition.Step)).toBe(3)
  })
})

