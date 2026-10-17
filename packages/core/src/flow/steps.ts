// The deterministic steps that need no clock and no network: pure functions from input items to
// named outputs. `wait`, `http` and `run-flow` are carried out by the runner.
import { FORBIDDEN_FIELD, type Step } from "./definition.js"
import { resolve, test, type Condition, type Item, type Json, type Scope } from "./expr.js"

export type Outputs = Record<string, Item[]>

export interface StepInput {
  /** Items per input index (only merge has more than one). */
  readonly inputs: ReadonlyArray<ReadonlyArray<Item>>
  readonly input: Item
  readonly steps: Readonly<Record<string, Item | undefined>>
}

const all = (input: StepInput): Item[] => input.inputs.flatMap((items) => [...items])

const scopeFor = (input: StepInput, items: ReadonlyArray<Item>, item: Item): Scope => ({
  item,
  items,
  input: input.input,
  steps: input.steps,
})

const asItem = (value: Json): Item =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value : { value }

const field = (item: Item, name: string): Json | undefined =>
  Object.prototype.hasOwnProperty.call(item, name) ? item[name] : undefined

export const runPure = (step: Step, input: StepInput): Outputs => {
  const p = step.params as Record<string, Json>
  const items = all(input)
  switch (step.type) {
    case "set": {
      const fields = p.fields as Record<string, Json>
      const keep = p.keepOnlySet === true
      // A set on no items still produces one item, so a flow can start from constants.
      const base = items.length > 0 ? items : [{}]
      return {
        main: base.map((item) => {
          const scope = scopeFor(input, base, item)
          const out: Item = keep ? {} : { ...item }
          for (const [name, value] of Object.entries(fields)) {
            // Refused at save too; checked here for definitions saved before that check existed.
            if (name === FORBIDDEN_FIELD) throw new Error(`set may not write the field "${FORBIDDEN_FIELD}"`)
            out[name] = resolve(value, scope)
          }
          return out
        }),
      }
    }
    case "transform": {
      let out = items
      if (p.filter !== undefined) out = out.filter((item) => test(p.filter as unknown as Condition, scopeFor(input, items, item)))
      const sortBy = p.sortBy as { field: string; order?: string } | undefined
      if (sortBy) {
        const sign = sortBy.order === "desc" ? -1 : 1
        out = [...out].sort((a, b) => {
          const x = field(a, sortBy.field)
          const y = field(b, sortBy.field)
          if (typeof x === "number" && typeof y === "number") return (x - y) * sign
          return String(x ?? "").localeCompare(String(y ?? "")) * sign
        })
      }
      if (typeof p.limit === "number") out = out.slice(0, p.limit)
      const rename = p.rename as Record<string, string> | undefined
      const pick = p.pick as string[] | undefined
      const omit = p.omit as string[] | undefined
      return {
        main: out.map((item) => {
          let next: Item = { ...item }
          if (rename)
            for (const [from, to] of Object.entries(rename))
              if (to === FORBIDDEN_FIELD) throw new Error(`rename may not write the field "${FORBIDDEN_FIELD}"`)
              else if (Object.prototype.hasOwnProperty.call(next, from)) {
                next[to] = next[from]!
                delete next[from]
              }
          if (pick)
            next = Object.fromEntries(
              pick.filter((name) => Object.prototype.hasOwnProperty.call(next, name)).map((name) => [name, next[name]!]),
            )
          if (omit) for (const name of omit) delete next[name]
          return next
        }),
      }
    }
    case "if": {
      const yes: Item[] = []
      const no: Item[] = []
      for (const item of items) (test(p.condition as unknown as Condition, scopeFor(input, items, item)) ? yes : no).push(item)
      return { true: yes, false: no }
    }
    case "switch": {
      const cases = p.cases as unknown as ReadonlyArray<{ output: string; when: Condition }>
      const fallback = typeof p.fallback === "string" ? p.fallback : "default"
      const out: Outputs = { [fallback]: [] }
      for (const entry of cases) out[entry.output] = []
      for (const item of items) {
        const hit = cases.find((entry) => test(entry.when, scopeFor(input, items, item)))
        out[hit ? hit.output : fallback]!.push(item)
      }
      return out
    }
    case "merge": {
      if (p.mode !== "combine") return { main: items }
      // Combine by position: item n of every input merged into one item; later inputs win on a clash.
      const length = Math.max(0, ...input.inputs.map((list) => list.length))
      return {
        main: Array.from({ length }, (_, index) =>
          input.inputs.reduce<Item>((acc, list) => ({ ...acc, ...(list[index] ?? {}) }), {}),
        ),
      }
    }
    default:
      throw new Error(`${step.type} is not a pure step`)
  }
}

export const isPure = (step: Step) =>
  step.type === "set" || step.type === "transform" || step.type === "if" || step.type === "switch" || step.type === "merge"

export { asItem }
