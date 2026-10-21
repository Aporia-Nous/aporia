/**
 * AP-STAGE4-NEW-TEAMMATE — pure create/import/edit/cancel/archive helpers.
 * No Electron side effects. Cancel never calls save; archive is soft-retire semantics.
 */

import { AN_FREE_PATH_DEFAULT_MODEL } from "../models-free-path"

export const AN_TEAMMATE_TEMPLATE_FORMAT = "aporia-bot" as const
/** Free-path default (OpenCode Free). See AP-MODELS-01b. */
export const AN_TEAMMATE_DEFAULT_MODEL = AN_FREE_PATH_DEFAULT_MODEL

export type AnTeammateDraft = {
  slug?: string
  name: string
  avatar?: string
  role: string
  instructions: string
  model: string
  tools: string[]
  mcps: string[]
  skills: string[]
  folder?: string
  scopes?: string[]
  kind?: "expert" | "worker"
  sessions?: string[]
}

export type AnTeammateTemplate = {
  format: typeof AN_TEAMMATE_TEMPLATE_FORMAT
  version?: number
  name?: string
  avatar?: string
  role?: string
  instructions?: string
  model?: string
  skills?: string[]
  tools?: string[]
  mcps?: string[]
  voice?: string
  routines?: Array<{ name?: string; cron?: string; prompt?: string }>
}

export type AnTeammateValidation =
  | { ok: true; draft: AnTeammateDraft; slug: string }
  | { ok: false; error: string; field?: "name" | "role" | "model" | "slug" }

export type AnImportParse =
  | { ok: true; template: AnTeammateTemplate; desiredName: string }
  | { ok: false; error: string }

export type AnImportIdentity =
  | { duplicate: false; slug: string; name: string }
  | { duplicate: true; slug: string; name: string; conflictSlug: string; suggestedName: string }

/** Match desktop `slugify` — keep renderer preview aligned with saveBot. */
export function anTeammateSlugify(raw: string): string {
  const slug = String(raw ?? "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48)
  return slug || "bot"
}

export function emptyTeammateDraft(partial?: Partial<AnTeammateDraft>): AnTeammateDraft {
  return {
    name: "",
    role: "",
    instructions: "",
    model: AN_TEAMMATE_DEFAULT_MODEL,
    tools: [],
    mcps: [],
    skills: [],
    folder: "Teammates",
    kind: "worker",
    ...partial,
  }
}

export function draftFromBot(bot: Partial<AnTeammateDraft> & { slug?: string }): AnTeammateDraft {
  return emptyTeammateDraft({
    slug: bot.slug,
    name: bot.name ?? "",
    avatar: bot.avatar,
    role: bot.role ?? "",
    instructions: bot.instructions ?? "",
    model: bot.model || AN_TEAMMATE_DEFAULT_MODEL,
    tools: [...(bot.tools ?? [])],
    mcps: [...(bot.mcps ?? [])],
    skills: [...(bot.skills ?? [])],
    folder: bot.folder ?? "Teammates",
    scopes: bot.scopes ? [...bot.scopes] : undefined,
    kind: bot.kind ?? "worker",
    sessions: bot.sessions ? [...bot.sessions] : undefined,
  })
}

export function validateTeammateDraft(
  draft: AnTeammateDraft,
  existingSlugs: readonly string[],
  opts?: { editingSlug?: string },
): AnTeammateValidation {
  const name = draft.name.trim()
  if (!name) return { ok: false, error: "Name is required.", field: "name" }
  if (!draft.role.trim()) return { ok: false, error: "Role / responsibility is required.", field: "role" }
  const model = (draft.model || AN_TEAMMATE_DEFAULT_MODEL).trim()
  if (!model.includes("/")) {
    return { ok: false, error: "Model must look like provider/model.", field: "model" }
  }
  const slug = opts?.editingSlug ?? draft.slug ?? anTeammateSlugify(name)
  if (!/^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/.test(slug)) {
    return { ok: false, error: "Derived id is invalid — adjust the name.", field: "slug" }
  }
  const clash = existingSlugs.some((s) => s === slug && s !== opts?.editingSlug)
  if (clash) {
    return {
      ok: false,
      error: `A teammate id "${slug}" already exists — rename to avoid corrupting it.`,
      field: "slug",
    }
  }
  return {
    ok: true,
    slug,
    draft: {
      ...draft,
      name,
      role: draft.role.trim(),
      instructions: draft.instructions.trim(),
      model,
      slug: opts?.editingSlug ?? slug,
    },
  }
}

/** Cancel create: no durable write was issued while the sheet held an unsaved draft. */
export function cancelCreateLeavesNoHalfBot(): true {
  return true
}

export function parseTeammateTemplate(raw: unknown): AnImportParse {
  if (raw == null || typeof raw !== "object") {
    return { ok: false, error: "Import is not a JSON object." }
  }
  const t = raw as Record<string, unknown>
  if (t.format !== AN_TEAMMATE_TEMPLATE_FORMAT) {
    return { ok: false, error: 'Not an .aporia-bot.json template (format must be "aporia-bot").' }
  }
  const desiredName = String(t.name || "").trim() || "Imported bot"
  return {
    ok: true,
    desiredName,
    template: {
      format: AN_TEAMMATE_TEMPLATE_FORMAT,
      version: typeof t.version === "number" ? t.version : 1,
      name: typeof t.name === "string" ? t.name : desiredName,
      avatar: typeof t.avatar === "string" ? t.avatar : undefined,
      role: typeof t.role === "string" ? t.role : "",
      instructions: typeof t.instructions === "string" ? t.instructions : "",
      model: typeof t.model === "string" ? t.model : AN_TEAMMATE_DEFAULT_MODEL,
      skills: Array.isArray(t.skills) ? t.skills.map(String) : [],
      tools: Array.isArray(t.tools) ? t.tools.map(String) : [],
      mcps: Array.isArray(t.mcps) ? t.mcps.map(String) : [],
      voice: typeof t.voice === "string" ? t.voice : undefined,
      routines: Array.isArray(t.routines)
        ? t.routines.map((r) => {
            const row = (r ?? {}) as Record<string, unknown>
            return {
              name: typeof row.name === "string" ? row.name : undefined,
              cron: typeof row.cron === "string" ? row.cron : undefined,
              prompt: typeof row.prompt === "string" ? row.prompt : undefined,
            }
          })
        : [],
    },
  }
}

export function resolveImportIdentity(
  existingSlugs: readonly string[],
  desiredName: string,
): AnImportIdentity {
  const baseSlug = anTeammateSlugify(desiredName)
  if (!existingSlugs.includes(baseSlug)) {
    return { duplicate: false, slug: baseSlug, name: desiredName }
  }
  let n = 2
  let suggestedName = `${desiredName} ${n}`
  while (existingSlugs.includes(anTeammateSlugify(suggestedName))) {
    n += 1
    suggestedName = `${desiredName} ${n}`
  }
  return {
    duplicate: true,
    slug: anTeammateSlugify(suggestedName),
    name: suggestedName,
    conflictSlug: baseSlug,
    suggestedName,
  }
}

export function templateToDraft(
  template: AnTeammateTemplate,
  name: string,
): AnTeammateDraft {
  return emptyTeammateDraft({
    name,
    avatar: template.avatar,
    role: String(template.role ?? ""),
    instructions: String(template.instructions ?? ""),
    model: String(template.model || AN_TEAMMATE_DEFAULT_MODEL),
    skills: [...(template.skills ?? [])],
    tools: [...(template.tools ?? [])],
    mcps: [...(template.mcps ?? [])],
    folder: "Imported",
  })
}

/**
 * Archive = soft retire (desktop deleteBot): roster drops; memory folder + bot.json backup kept.
 * Pending mission reassignment is not automated in Stage 4 — surface honesty in the UI.
 */
export function archiveTeammateCopy(input: {
  name: string
  sessions?: readonly string[]
}): { title: string; detail: string; preservesHistory: true } {
  const linked = input.sessions?.length ?? 0
  const detail =
    linked > 0
      ? `${input.name} leaves the roster. Their memory folder and a backup stay on disk (${linked} linked conversation(s) kept). Open work is not moved automatically — reassign it yourself if needed.`
      : `${input.name} leaves the roster. Their memory folder and a backup stay on disk. Past messages are not deleted.`
  return { title: `Archive ${input.name}?`, detail, preservesHistory: true }
}

export function permissionsCostNote(draft: AnTeammateDraft): string {
  const tools = draft.tools.length
    ? `tools limited to: ${draft.tools.join(", ")}`
    : "tools default to all allowed for this bot (no silent wider OS install)"
  return `Model ${draft.model || AN_TEAMMATE_DEFAULT_MODEL}. ${tools}. Creating a teammate reuses existing credentials only within authorized scope — it does not grant new provider access or install services.`
}
