import path from "path"
import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { Agent } from "@opencode/core/agent"
import { AppNodeBuilder } from "@opencode/core/effect/app-node-builder"
import { AbsolutePath } from "@opencode/core/schema"
import { Skill } from "@opencode/core/skill"
import { SkillInstructions } from "@opencode/core/skill/instructions"
import { it } from "../lib/effect"
import { readInitial, readUpdate } from "../lib/instructions"

const build = Agent.ID.make("build")
const effect = Skill.Info.make({
  id: Skill.ID.make("effect"),
  name: Skill.Name.make("Effect"),
  description: "Build applications with Effect",
  path: AbsolutePath.make(path.resolve("/skills/effect/SKILL.md")),
  content: "Effect guidance",
})
const hidden = Skill.Info.make({
  id: Skill.ID.make("hidden"),
  name: Skill.Name.make("Hidden"),
  path: AbsolutePath.make(path.resolve("/skills/hidden/SKILL.md")),
  content: "Undescribed guidance",
})
const denied = Skill.Info.make({
  id: Skill.ID.make("denied"),
  name: Skill.Name.make("Denied"),
  description: "Must not be advertised",
  path: AbsolutePath.make(path.resolve("/skills/denied/SKILL.md")),
  content: "Denied guidance",
})
const manual = Skill.Info.make({
  id: Skill.ID.make("manual"),
  name: Skill.Name.make("Manual"),
  description: "Load only when explicitly selected",
  autoinvoke: false,
  path: AbsolutePath.make(path.resolve("/skills/manual/SKILL.md")),
  content: "Manual guidance",
})

const layer = (list: () => Skill.Info[]) =>
  AppNodeBuilder.build(SkillInstructions.node, [
    Skill.node.replace(Layer.mock(Skill.Service, { list: () => Effect.succeed(list()) })),
  ])

describe("SkillInstructions", () => {
  it.effect("renders described agent skills and updates the complete available list", () => {
    const agent = Agent.Info.make({
      ...Agent.Info.default(build),
      permissions: [{ action: "skill", resource: "denied", effect: "deny" }],
    })
    let skills = [hidden, denied, manual, effect]
    return Effect.gen(function* () {
      const instructions = yield* SkillInstructions.Service
      const initialized = yield* instructions.load(agent.permissions).pipe(Effect.flatMap(readInitial))

      expect(initialized.text).toBe(
        [
          "Skills provide specialized instructions for specific tasks. Use the skill tool to load one when a task matches its description; a skill already present as <skill_content> in the conversation needs no reload.",
          "<available_skills>",
          "- effect (Effect): Build applications with Effect",
          "</available_skills>",
        ].join("\n"),
      )
      expect(initialized.text).not.toContain("manual")

      skills = []
      expect(
        yield* instructions.load(agent.permissions).pipe(Effect.flatMap((context) => readUpdate(context, initialized))),
      ).toMatchObject({ text: "Skill guidance is no longer available. Do not use any previously listed skill." })
    }).pipe(Effect.provide(layer(() => skills)))
  })

  it.effect("announces added and removed skills as deltas without restating the list", () => {
    const agent = Agent.Info.make(Agent.Info.default(build))
    const debugging = Skill.Info.make({
      id: Skill.ID.make("debugging"),
      name: Skill.Name.make("Debugging"),
      description: "Diagnose hard bugs",
      path: AbsolutePath.make(path.resolve("/skills/debugging/SKILL.md")),
      content: "Debugging guidance",
    })
    let skills = [effect]
    return Effect.gen(function* () {
      const instructions = yield* SkillInstructions.Service
      const initialized = yield* instructions.load(agent.permissions).pipe(Effect.flatMap(readInitial))

      skills = [effect, debugging]
      const added = yield* instructions
        .load(agent.permissions)
        .pipe(Effect.flatMap((context) => readUpdate(context, initialized)))
      expect(added.text).toBe(
        [
          "New skills are available in addition to those previously listed:",
          "- debugging (Debugging): Diagnose hard bugs",
        ].join("\n"),
      )

      skills = [debugging]
      const removed = yield* instructions
        .load(agent.permissions)
        .pipe(Effect.flatMap((context) => readUpdate(context, added)))
      expect(removed.text).toBe("The following skill IDs are no longer available and must not be used: effect.")
    }).pipe(Effect.provide(layer(() => skills)))
  })

  it.effect("restates the full skill list when a description changes", () => {
    const agent = Agent.Info.make(Agent.Info.default(build))
    let skills = [effect]
    return Effect.gen(function* () {
      const instructions = yield* SkillInstructions.Service
      const initialized = yield* instructions.load(agent.permissions).pipe(Effect.flatMap(readInitial))

      skills = [Skill.Info.make({ ...effect, description: "Build applications with Effect v4" })]
      expect(
        yield* instructions.load(agent.permissions).pipe(Effect.flatMap((context) => readUpdate(context, initialized))),
      ).toMatchObject({
        text: expect.stringContaining(
          "The available skills have changed. This list supersedes the previous available skills list.",
        ),
      })
    }).pipe(Effect.provide(layer(() => skills)))
  })

  it.effect("omits instructions when the selected agent denies all skills", () => {
    const agent = Agent.Info.make({
      ...Agent.Info.default(build),
      permissions: [{ action: "skill", resource: "*", effect: "deny" }],
    })
    return Effect.gen(function* () {
      const instructions = yield* SkillInstructions.Service
      expect((yield* instructions.load(agent.permissions).pipe(Effect.flatMap(readInitial))).text).toBe("")
    }).pipe(Effect.provide(layer(() => [effect])))
  })

  it.effect("omits instructions when a resource-specific denial follows the global denial", () => {
    const agent = Agent.Info.make({
      ...Agent.Info.default(build),
      permissions: [
        { action: "skill", resource: "*", effect: "deny" },
        { action: "skill", resource: "hidden", effect: "deny" },
      ],
    })
    return Effect.gen(function* () {
      const instructions = yield* SkillInstructions.Service
      expect((yield* instructions.load(agent.permissions).pipe(Effect.flatMap(readInitial))).text).toBe("")
    }).pipe(Effect.provide(layer(() => [effect])))
  })

  it.effect("retains specifically allowed skills after a global denial", () => {
    const agent = Agent.Info.make({
      ...Agent.Info.default(build),
      permissions: [
        { action: "skill", resource: "*", effect: "deny" },
        { action: "skill", resource: "effect", effect: "allow" },
      ],
    })
    return Effect.gen(function* () {
      const instructions = yield* SkillInstructions.Service
      expect((yield* instructions.load(agent.permissions).pipe(Effect.flatMap(readInitial))).text).toContain(
        "- effect (Effect):",
      )
    }).pipe(Effect.provide(layer(() => [effect])))
  })

  it.effect("omits instructions when a specifically allowed skill is denied again", () => {
    const agent = Agent.Info.make({
      ...Agent.Info.default(build),
      permissions: [
        { action: "skill", resource: "*", effect: "deny" },
        { action: "skill", resource: "effect", effect: "allow" },
        { action: "skill", resource: "effect", effect: "deny" },
      ],
    })
    return Effect.gen(function* () {
      const instructions = yield* SkillInstructions.Service
      expect((yield* instructions.load(agent.permissions).pipe(Effect.flatMap(readInitial))).text).toBe("")
    }).pipe(Effect.provide(layer(() => [effect])))
  })

  it.effect("keeps listings compact while preserving the trigger sentence", () => {
    const agent = Agent.Info.make(Agent.Info.default(build))
    const verbose = Skill.Info.make({
      id: Skill.ID.make("verbose"),
      name: Skill.Name.make("verbose"),
      description:
        "Does a thing with many words that fill the opening sentence beyond the rest of the available listing. Use when the task touches the thing. Extra trailing detail that must not be rendered because the listing stops at the compiled budget.",
      path: AbsolutePath.make(path.resolve("/skills/verbose/SKILL.md")),
      content: "Verbose guidance",
    })
    return Effect.gen(function* () {
      const instructions = yield* SkillInstructions.Service
      const text = (yield* instructions.load(agent.permissions).pipe(Effect.flatMap(readInitial))).text
      expect(text).toContain("- verbose: Does a thing with many words")
      expect(text).toContain("Use when the task touches the thing.")
      expect(text).not.toContain("Extra trailing detail")
    }).pipe(Effect.provide(layer(() => [verbose])))
  })

  it.effect("clips a listing on a word boundary when no whole sentence fits", () => {
    const agent = Agent.Info.make(Agent.Info.default(build))
    const clipped = Skill.Info.make({
      id: Skill.ID.make("clipped"),
      name: Skill.Name.make("clipped"),
      description: "compress ".repeat(40).trim(),
      path: AbsolutePath.make(path.resolve("/skills/clipped/SKILL.md")),
      content: "Clipped guidance",
    })
    return Effect.gen(function* () {
      const instructions = yield* SkillInstructions.Service
      const text = (yield* instructions.load(agent.permissions).pipe(Effect.flatMap(readInitial))).text
      expect(text).toMatch(/^- clipped: (?:compress )*compress\.\.\.$/m)
      expect(text).not.toContain("compres...")
    }).pipe(Effect.provide(layer(() => [clipped])))
  })
})
