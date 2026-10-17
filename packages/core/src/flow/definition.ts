// A flow definition is data: an id, a name, steps, connections and the hosts it may call. It is
// validated completely before it is saved, so the runner never meets a step it cannot run.
import { checkCondition, parsePath, templatePaths, type Condition, type Json } from "./expr.js"

export const STEP_TYPES = ["set", "transform", "if", "switch", "merge", "wait", "http", "run-flow"] as const
export type StepType = (typeof STEP_TYPES)[number]

/** What happens when a step that was started has no recorded result (the crash window). */
export type Safety = "pure" | "idempotent" | "unsafe"

export interface Step {
  readonly id: string
  readonly type: StepType
  readonly name?: string
  readonly params: { readonly [key: string]: Json }
}

export interface Connection {
  readonly from: string
  /** Named output of `from`: `main`, `true`/`false` for if, a case name for switch. Default `main`. */
  readonly output?: string
  readonly to: string
  /** Input index of `to`; only merge has more than one input. Default 0. */
  readonly input?: number
}

export interface Definition {
  readonly id: string
  readonly name: string
  readonly description?: string
  readonly steps: ReadonlyArray<Step>
  readonly connections: ReadonlyArray<Connection>
  readonly permissions?: { readonly hosts?: ReadonlyArray<string> }
}

export const ID = /^[a-z][a-z0-9-]{0,39}$/
const STEP_ID = /^[A-Za-z][A-Za-z0-9_-]{0,39}$/
const HOST = /^[a-z0-9.-]{1,253}(:\d{1,5})?$/
export const MAX_STEPS = 100
export const MAX_WAIT_SECONDS = 7 * 24 * 3600
export const MAX_HTTP_ATTEMPTS = 5
export const HTTP_METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"] as const

export const safety = (step: Step): Safety => {
  if (step.type !== "http") return "pure"
  const method = String(step.params.method ?? "GET").toUpperCase()
  if (method === "GET" || method === "HEAD") return "idempotent"
  return step.params.idempotent === true ? "idempotent" : "unsafe"
}

/** Named outputs a step can produce, so a connection can be checked. */
export const outputs = (step: Step): ReadonlyArray<string> => {
  if (step.type === "if") return ["true", "false"]
  if (step.type === "switch") {
    const cases = Array.isArray(step.params.cases) ? step.params.cases : []
    const names = cases.map((entry) => (entry && typeof entry === "object" && !Array.isArray(entry) ? String(entry.output) : ""))
    return [...names, String(step.params.fallback ?? "default")]
  }
  return ["main"]
}

/** `host` or `host:port` of a URL, lower-cased, the form `permissions.hosts` uses. */
export const hostOf = (url: string): string | undefined => {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined
    return parsed.host.toLowerCase()
  } catch {
    return undefined
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)

const paths = (value: unknown, where: string) =>
  templatePaths(value)
    .map(parsePath)
    .flatMap((parsed) => (parsed.ok ? [] : [`${where}: ${parsed.error}`]))

const checkParams = (step: Step, hosts: ReadonlySet<string>): string[] => {
  const where = `step ${step.id}`
  const p = step.params as Record<string, unknown>
  switch (step.type) {
    case "set": {
      if (!isRecord(p.fields) || Object.keys(p.fields).length === 0) return [`${where}: set needs "fields"`]
      return paths(p.fields, where)
    }
    case "transform": {
      const problems: string[] = []
      for (const key of ["pick", "omit"] as const)
        if (p[key] !== undefined && !(Array.isArray(p[key]) && (p[key] as unknown[]).every((x) => typeof x === "string")))
          problems.push(`${where}: ${key} is a list of field names`)
      if (p.rename !== undefined && !(isRecord(p.rename) && Object.values(p.rename).every((x) => typeof x === "string")))
        problems.push(`${where}: rename maps field names to field names`)
      if (p.limit !== undefined && !(Number.isInteger(p.limit) && (p.limit as number) >= 0))
        problems.push(`${where}: limit is a whole number`)
      if (p.sortBy !== undefined && !(isRecord(p.sortBy) && typeof p.sortBy.field === "string"))
        problems.push(`${where}: sortBy needs a field`)
      if (p.filter !== undefined) problems.push(...checkCondition(p.filter, `${where}.filter`))
      return problems
    }
    case "if":
      return checkCondition(p.condition, `${where}.condition`)
    case "switch": {
      if (!Array.isArray(p.cases) || p.cases.length === 0) return [`${where}: switch needs "cases"`]
      const names = new Set<string>()
      const problems: string[] = []
      p.cases.forEach((entry, index) => {
        if (!isRecord(entry) || typeof entry.output !== "string" || !STEP_ID.test(entry.output))
          problems.push(`${where}: case ${index} needs an "output" name`)
        else if (names.has(entry.output)) problems.push(`${where}: case output "${entry.output}" is repeated`)
        else names.add(entry.output)
        if (isRecord(entry)) problems.push(...checkCondition(entry.when, `${where}.cases[${index}].when`))
      })
      if (p.fallback !== undefined && (typeof p.fallback !== "string" || names.has(p.fallback)))
        problems.push(`${where}: fallback is an output name different from every case`)
      return problems
    }
    case "merge":
      return p.mode === undefined || p.mode === "append" || p.mode === "combine"
        ? []
        : [`${where}: merge mode is "append" or "combine"`]
    case "wait":
      return typeof p.seconds === "number" && p.seconds >= 0 && p.seconds <= MAX_WAIT_SECONDS
        ? []
        : [`${where}: wait needs "seconds" between 0 and ${MAX_WAIT_SECONDS}`]
    case "http": {
      const problems: string[] = []
      const method = String(p.method ?? "GET").toUpperCase()
      if (!(HTTP_METHODS as ReadonlyArray<string>).includes(method)) problems.push(`${where}: unsupported method ${method}`)
      if (typeof p.url !== "string" || p.url.length === 0) return [...problems, `${where}: http needs a "url"`]
      if (templatePaths(p.url).length === 0) {
        const host = hostOf(p.url)
        if (!host) problems.push(`${where}: url must be http or https`)
        else if (!hosts.has(host)) problems.push(`${where}: host ${host} is not declared in permissions.hosts`)
      } else if (!/^https?:\/\/[^{}/]+\//.test(p.url) && !/^https?:\/\/[^{}/]+$/.test(p.url)) {
        // A template may fill the path or query, never the host: the host must stay checkable.
        problems.push(`${where}: a template may not decide the host of a url`)
      } else {
        const host = hostOf(p.url.replace(/\{\{[^}]*\}\}/g, "x"))
        if (!host || !hosts.has(host)) problems.push(`${where}: host ${host ?? "?"} is not declared in permissions.hosts`)
      }
      if (p.headers !== undefined && !isRecord(p.headers)) problems.push(`${where}: headers is an object`)
      if (isRecord(p.headers))
        for (const name of Object.keys(p.headers))
          if (/^(authorization|cookie|proxy-authorization)$/i.test(name))
            problems.push(`${where}: header ${name} carries a credential; credentials arrive with the vault (F2)`)
      if (p.timeoutSeconds !== undefined && !(typeof p.timeoutSeconds === "number" && p.timeoutSeconds > 0 && p.timeoutSeconds <= 60))
        problems.push(`${where}: timeoutSeconds is between 1 and 60`)
      if (p.maxAttempts !== undefined && !(Number.isInteger(p.maxAttempts) && (p.maxAttempts as number) >= 1 && (p.maxAttempts as number) <= MAX_HTTP_ATTEMPTS))
        problems.push(`${where}: maxAttempts is between 1 and ${MAX_HTTP_ATTEMPTS}`)
      if (p.idempotent !== undefined && typeof p.idempotent !== "boolean") problems.push(`${where}: idempotent is true or false`)
      problems.push(...paths([p.url, p.headers, p.body, p.query], where))
      return problems
    }
    case "run-flow": {
      if (typeof p.flowId !== "string" || !ID.test(p.flowId)) return [`${where}: run-flow needs a "flowId"`]
      if (p.input !== undefined && !isRecord(p.input)) return [`${where}: run-flow input is an object`]
      return paths(p.input, where)
    }
  }
}

/** Every problem with a definition; empty when it can be saved. */
export const validate = (value: unknown): string[] => {
  if (!isRecord(value)) return ["a flow definition is an object"]
  const problems: string[] = []
  if (typeof value.id !== "string" || !ID.test(value.id))
    problems.push("id: lowercase letters, digits and dashes, starting with a letter, at most 40 characters")
  if (typeof value.name !== "string" || value.name.trim().length === 0 || value.name.length > 120)
    problems.push("name: 1 to 120 characters")
  if (value.description !== undefined && (typeof value.description !== "string" || value.description.length > 2000))
    problems.push("description: at most 2000 characters")
  const permissions = value.permissions
  const hostList = isRecord(permissions) ? permissions.hosts : undefined
  if (permissions !== undefined && !isRecord(permissions)) problems.push("permissions is an object")
  if (hostList !== undefined && !(Array.isArray(hostList) && hostList.every((h) => typeof h === "string" && HOST.test(h))))
    problems.push("permissions.hosts: exact host or host:port names, no wildcards")
  const hosts = new Set(Array.isArray(hostList) ? (hostList as string[]).map((h) => h.toLowerCase()) : [])
  if (!Array.isArray(value.steps) || value.steps.length === 0) return [...problems, "steps: at least one step"]
  if (value.steps.length > MAX_STEPS) return [...problems, `steps: at most ${MAX_STEPS}`]
  const byId = new Map<string, Step>()
  value.steps.forEach((raw, index) => {
    if (!isRecord(raw)) return void problems.push(`steps[${index}] is an object`)
    if (typeof raw.id !== "string" || !STEP_ID.test(raw.id)) return void problems.push(`steps[${index}]: bad id`)
    if (byId.has(raw.id)) return void problems.push(`step ${raw.id}: id is repeated`)
    if (!(STEP_TYPES as ReadonlyArray<string>).includes(raw.type as string))
      return void problems.push(`step ${raw.id}: unknown type ${JSON.stringify(raw.type)}`)
    if (raw.params !== undefined && !isRecord(raw.params)) return void problems.push(`step ${raw.id}: params is an object`)
    const step = { id: raw.id, type: raw.type as StepType, params: (raw.params ?? {}) as Step["params"] }
    byId.set(raw.id, step)
    problems.push(...checkParams(step, hosts))
  })
  const connections = value.connections ?? []
  if (!Array.isArray(connections)) return [...problems, "connections is a list"]
  const incoming = new Map<string, number>()
  const next = new Map<string, string[]>()
  connections.forEach((raw, index) => {
    if (!isRecord(raw)) return void problems.push(`connections[${index}] is an object`)
    const from = byId.get(String(raw.from))
    const to = byId.get(String(raw.to))
    if (!from || !to) {
      const missing = !from ? raw.from : raw.to
      return void problems.push(`connections[${index}]: unknown step ${JSON.stringify(String(missing)).slice(0, 60)}`)
    }
    const output = raw.output === undefined ? "main" : String(raw.output)
    if (!outputs(from).includes(output)) problems.push(`connections[${index}]: ${from.id} has no output "${output}"`)
    const input = raw.input === undefined ? 0 : raw.input
    if (!Number.isInteger(input) || (input as number) < 0 || (to.type !== "merge" && input !== 0) || (input as number) > 9)
      problems.push(`connections[${index}]: input ${String(input)} is not valid for ${to.id}`)
    incoming.set(to.id, (incoming.get(to.id) ?? 0) + 1)
    next.set(from.id, [...(next.get(from.id) ?? []), to.id])
  })
  if (byId.size > 0 && [...byId.keys()].every((id) => incoming.has(id))) problems.push("no entry step: every step has an input")
  // Cycles: a run executes each step at most once, so a loop could never finish.
  const state = new Map<string, "visiting" | "done">()
  const visit = (id: string): boolean => {
    if (state.get(id) === "done") return false
    if (state.get(id) === "visiting") return true
    state.set(id, "visiting")
    const cyclic = (next.get(id) ?? []).some(visit)
    state.set(id, "done")
    return cyclic
  }
  if ([...byId.keys()].some(visit)) problems.push("connections form a cycle")
  return problems
}

/** A stable text form, so "the same definition" means the same bytes. */
export const canonical = (value: unknown): string =>
  JSON.stringify(value, (_, entry) =>
    entry && typeof entry === "object" && !Array.isArray(entry)
      ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : entry,
  )

export type { Condition }
