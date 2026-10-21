import { describe, expect, test } from "bun:test"
import {
  anTeammateSlugify,
  archiveTeammateCopy,
  cancelCreateLeavesNoHalfBot,
  emptyTeammateDraft,
  parseTeammateTemplate,
  permissionsCostNote,
  resolveImportIdentity,
  templateToDraft,
  validateTeammateDraft,
} from "./lifecycle"

describe("AP-STAGE4-NEW-TEAMMATE lifecycle", () => {
  test("cancel create leaves no half bot (no save side effect)", () => {
    expect(cancelCreateLeavesNoHalfBot()).toBe(true)
  })

  test("validate create requires name and role; blocks duplicate slug", () => {
    const base = emptyTeammateDraft({ name: "Probe Bot", role: "Tests lifecycle" })
    const ok = validateTeammateDraft(base, ["grok"])
    expect(ok.ok).toBe(true)
    if (ok.ok) expect(ok.slug).toBe("probe-bot")

    const dup = validateTeammateDraft(emptyTeammateDraft({ name: "Grok", role: "x" }), ["grok"])
    expect(dup.ok).toBe(false)
    if (!dup.ok) expect(dup.error).toContain("already exists")

    const edit = validateTeammateDraft(
      emptyTeammateDraft({ name: "Grok", role: "Main", slug: "grok" }),
      ["grok"],
      { editingSlug: "grok" },
    )
    expect(edit.ok).toBe(true)
  })

  test("import detects invalid schema and duplicate identities", () => {
    expect(parseTeammateTemplate({ format: "nope" }).ok).toBe(false)
    const parsed = parseTeammateTemplate({
      format: "aporia-bot",
      name: "Grok",
      role: "import",
      instructions: "i",
    })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const identity = resolveImportIdentity(["grok"], parsed.desiredName)
    expect(identity.duplicate).toBe(true)
    if (identity.duplicate) {
      expect(identity.conflictSlug).toBe("grok")
      expect(identity.suggestedName).toBe("Grok 2")
      expect(anTeammateSlugify(identity.suggestedName)).toBe("grok-2")
    }
    const draft = templateToDraft(parsed.template, identity.duplicate ? identity.suggestedName : parsed.desiredName)
    expect(draft.folder).toBe("Imported")
    expect(draft.name).toBe("Grok 2")
  })

  test("archive copy preserves history honesty", () => {
    const soft = archiveTeammateCopy({ name: "Probe", sessions: ["s1", "s2"] })
    expect(soft.preservesHistory).toBe(true)
    expect(soft.detail).toContain("Memory folder")
    expect(soft.detail).toContain("not automated")
    expect(permissionsCostNote(emptyTeammateDraft({ model: "opencode/big-pickle" }))).toContain(
      "does not grant new provider access",
    )
    expect(emptyTeammateDraft().model).toBe("opencode/big-pickle")
  })
})
