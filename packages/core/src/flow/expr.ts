// The flow expression language: paths and conditions, nothing else. There is no JavaScript, no
// function call and no regular expression, so an expression can neither run code nor hang.
//
//   "{{ item.name }}"           -> the value itself (number, object, ...) when it is the whole string
//   "Hello {{ input.who }}!"    -> string interpolation; objects are JSON-encoded
//   paths start at `item` (the current item), `items` (all input items), `input` (the run's input)
//   or `steps.<id>` (the first item of that step's main output); `.0` indexes an array.

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
export type Item = { [key: string]: Json }

export interface Scope {
  readonly item: Item
  readonly items: ReadonlyArray<Item>
  readonly input: Item
  readonly steps: Readonly<Record<string, Item | undefined>>
}

const ROOTS = new Set(["item", "items", "input", "steps"])
const SEGMENT = /^[A-Za-z0-9_$-]{1,64}$/
const WHOLE = /^\{\{\s*([^{}]+?)\s*\}\}$/
const ANY = /\{\{\s*([^{}]+?)\s*\}\}/g

/** Parse `item.a.0.b` into segments, or explain why it is not a path. */
export const parsePath = (path: string): { ok: true; segments: string[] } | { ok: false; error: string } => {
  const segments = path.trim().split(".")
  if (segments.length > 16) return { ok: false, error: `path is too deep: ${path}` }
  if (!ROOTS.has(segments[0]!)) return { ok: false, error: `a path starts with item, items, input or steps: ${path}` }
  for (const segment of segments) if (!SEGMENT.test(segment)) return { ok: false, error: `not a path segment: "${segment}"` }
  return { ok: true, segments }
}

export const lookup = (scope: Scope, path: string): Json | undefined => {
  const parsed = parsePath(path)
  if (!parsed.ok) return undefined
  let value: unknown = scope
  for (const segment of parsed.segments) {
    if (value === null || typeof value !== "object") return undefined
    if (Array.isArray(value)) {
      if (!/^\d+$/.test(segment)) return undefined
      value = value[Number(segment)]
      continue
    }
    if (!Object.prototype.hasOwnProperty.call(value, segment)) return undefined
    value = (value as Record<string, unknown>)[segment]
  }
  return value as Json | undefined
}

const show = (value: Json | undefined): string =>
  value === undefined || value === null ? "" : typeof value === "string" ? value : JSON.stringify(value)

/** Resolve templates anywhere inside a JSON value. Missing paths become null (whole) or "" (inline). */
export const resolve = (value: Json, scope: Scope): Json => {
  if (typeof value === "string") {
    const whole = WHOLE.exec(value)
    if (whole) return lookup(scope, whole[1]!) ?? null
    if (!value.includes("{{")) return value
    return value.replace(ANY, (_, path: string) => show(lookup(scope, path)))
  }
  if (Array.isArray(value)) return value.map((entry) => resolve(entry, scope))
  if (value !== null && typeof value === "object") {
    const out: Item = {}
    // Defined, not assigned: a "__proto__" key stays a plain field instead of replacing the prototype.
    for (const [key, entry] of Object.entries(value))
      Object.defineProperty(out, key, { value: resolve(entry, scope), enumerable: true, writable: true, configurable: true })
    return out
  }
  return value
}

/** Every template path inside a value, so a definition can be checked before it ever runs. */
export const templatePaths = (value: unknown, found: string[] = []): string[] => {
  if (typeof value === "string") for (const match of value.matchAll(ANY)) found.push(match[1]!.trim())
  else if (Array.isArray(value)) for (const entry of value) templatePaths(entry, found)
  else if (value !== null && typeof value === "object") for (const entry of Object.values(value)) templatePaths(entry, found)
  return found
}

export const OPERATORS = [
  "equals",
  "notEquals",
  "gt",
  "gte",
  "lt",
  "lte",
  "contains",
  "startsWith",
  "endsWith",
  "exists",
  "notExists",
  "isEmpty",
  "isNotEmpty",
] as const
export type Operator = (typeof OPERATORS)[number]

export type Condition =
  | { readonly left: Json; readonly op: Operator; readonly right?: Json }
  | { readonly all: ReadonlyArray<Condition> }
  | { readonly any: ReadonlyArray<Condition> }
  | { readonly not: Condition }

const empty = (value: Json | undefined) =>
  value === undefined ||
  value === null ||
  value === "" ||
  (Array.isArray(value) && value.length === 0) ||
  (typeof value === "object" && value !== null && !Array.isArray(value) && Object.keys(value).length === 0)

const same = (a: Json | undefined, b: Json | undefined) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

const order = (a: Json | undefined, b: Json | undefined): number | undefined => {
  if (typeof a === "number" && typeof b === "number") return a - b
  if (typeof a === "string" && typeof b === "string") return a < b ? -1 : a > b ? 1 : 0
  return undefined
}

export const test = (condition: Condition, scope: Scope): boolean => {
  if ("all" in condition) return condition.all.every((entry) => test(entry, scope))
  if ("any" in condition) return condition.any.some((entry) => test(entry, scope))
  if ("not" in condition) return !test(condition.not, scope)
  const left = resolve(condition.left, scope)
  const right = condition.right === undefined ? undefined : resolve(condition.right, scope)
  switch (condition.op) {
    case "equals":
      return same(left, right)
    case "notEquals":
      return !same(left, right)
    case "gt":
      return (order(left, right) ?? Number.NaN) > 0
    case "gte":
      return (order(left, right) ?? Number.NaN) >= 0
    case "lt":
      return (order(left, right) ?? Number.NaN) < 0
    case "lte":
      return (order(left, right) ?? Number.NaN) <= 0
    case "contains":
      if (typeof left === "string") return typeof right === "string" && left.includes(right)
      if (Array.isArray(left)) return left.some((entry) => same(entry, right ?? null))
      return false
    case "startsWith":
      return typeof left === "string" && typeof right === "string" && left.startsWith(right)
    case "endsWith":
      return typeof left === "string" && typeof right === "string" && left.endsWith(right)
    case "exists":
      return left !== null && left !== undefined
    case "notExists":
      return left === null || left === undefined
    case "isEmpty":
      return empty(left)
    case "isNotEmpty":
      return !empty(left)
  }
}

/** Structural check of a condition; returns problems, empty when it is well formed. */
export const checkCondition = (value: unknown, where: string, depth = 0): string[] => {
  if (depth > 8) return [`${where}: condition is nested too deeply`]
  if (value === null || typeof value !== "object" || Array.isArray(value)) return [`${where}: a condition is an object`]
  const record = value as Record<string, unknown>
  if ("all" in record || "any" in record) {
    const list = record.all ?? record.any
    if (!Array.isArray(list) || list.length === 0) return [`${where}: all/any needs a non-empty list`]
    return list.flatMap((entry, index) => checkCondition(entry, `${where}[${index}]`, depth + 1))
  }
  if ("not" in record) return checkCondition(record.not, `${where}.not`, depth + 1)
  if (!("left" in record)) return [`${where}: a comparison needs "left"`]
  if (!OPERATORS.includes(record.op as Operator)) return [`${where}: unknown operator ${JSON.stringify(record.op)}`]
  return [...templatePaths(record.left), ...templatePaths(record.right)]
    .map(parsePath)
    .flatMap((parsed) => (parsed.ok ? [] : [`${where}: ${parsed.error}`]))
}
