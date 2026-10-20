export * as SkillInstructions from "./instructions.js"

import { makeLocationNode } from "@opencode/util/effect/app-node"
import { Context, Effect, Layer, Schema } from "effect"
import { Permission } from "../permission.js"
import { Skill } from "../skill.js"
import { Instructions } from "../instructions/index.js"

const Summary = Schema.Struct({
  id: Skill.ID,
  name: Skill.Name,
  description: Schema.String,
})
type Summary = typeof Summary.Type

// The index only has to make a skill discoverable; the full description and content load with it.
// Keep the opening sentence, then prefer the first trigger sentence, so the listing stays a search key.
const SUMMARY_LIMIT = 220
const Trigger =
  /\b(?:use when|use this|use for|load when|applies when|applies to|triggers?|must use|you must|only when)\b/i

const summarize = (description: string) => {
  const text = description.replace(/\s+/g, " ").trim()
  if (text.length <= SUMMARY_LIMIT) return text
  const sentences = text.split(/(?<=[.!?])\s+/)
  const opening = sentences[0] ?? text
  const trigger = sentences.slice(1).find((sentence) => Trigger.test(sentence))
  const candidate =
    trigger !== undefined && opening.length + trigger.length + 1 <= SUMMARY_LIMIT ? `${opening} ${trigger}` : opening
  if (candidate.length <= SUMMARY_LIMIT) return candidate
  const clipped = candidate.slice(0, SUMMARY_LIMIT)
  const boundary = clipped.lastIndexOf(" ")
  return `${(boundary > SUMMARY_LIMIT - 30 ? clipped.slice(0, boundary) : clipped).trimEnd()}...`
}

const entry = (skill: Summary) =>
  `- ${skill.id}${skill.name === String(skill.id) ? "" : ` (${skill.name})`}: ${summarize(skill.description)}`

const entries = (skills: ReadonlyArray<Summary>) => skills.map(entry)

const render = (skills: ReadonlyArray<Summary>) =>
  [
    "Skills provide specialized instructions for specific tasks. Use the skill tool to load one when a task matches its description; a skill already present as <skill_content> in the conversation needs no reload.",
    ...(skills.length === 0
      ? ["No skills are currently available."]
      : ["<available_skills>", ...entries(skills), "</available_skills>"]),
  ].join("\n")

const update = (previous: ReadonlyArray<Summary>, current: ReadonlyArray<Summary>) => {
  const diff = Instructions.diffByKey(
    previous,
    current,
    (skill) => skill.id,
    (before, after) => before.name !== after.name || before.description !== after.description,
  )
  // Additions and removals render as small deltas; anything else restates the full list.
  if (diff.changed.length > 0 || (diff.added.length === 0 && diff.removed.length === 0))
    return [
      "The available skills have changed. This list supersedes the previous available skills list.",
      render(current),
    ].join("\n")
  return [
    ...(diff.added.length === 0
      ? []
      : ["New skills are available in addition to those previously listed:", ...entries(diff.added)]),
    ...(diff.removed.length === 0
      ? []
      : [
          `The following skill IDs are no longer available and must not be used: ${diff.removed.map((skill) => skill.id).join(", ")}.`,
        ]),
  ].join("\n")
}

export interface Interface {
  /** Lists skills the given ruleset does not deny; callers pass the merged agent and Session permissions. */
  readonly load: (permissions: Permission.Ruleset) => Effect.Effect<Instructions.List>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/SkillInstructions") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const skills = yield* Skill.Service

    return Service.of({
      load: Effect.fn("SkillInstructions.load")(function* (permissions) {
        const available = Skill.available(yield* skills.list(), permissions)
          .flatMap((skill) =>
            skill.description === undefined || skill.autoinvoke === false
              ? []
              : [{ id: skill.id, name: skill.name, description: skill.description }],
          )
          .toSorted((a, b) => a.id.localeCompare(b.id))
        return Instructions.make<ReadonlyArray<Summary>>({
          key: Instructions.Key.make("core/skill-guidance"),
          codec: Schema.toCodecJson(Schema.Array(Summary)),
          read: Effect.succeed(available.length === 0 ? Instructions.removed : available),
          render: {
            initial: render,
            changed: update,
            removed: () => "Skill guidance is no longer available. Do not use any previously listed skill.",
          },
        })
      }),
    })
  }),
)

export const node = makeLocationNode({ service: Service, layer, deps: [Skill.node] })
