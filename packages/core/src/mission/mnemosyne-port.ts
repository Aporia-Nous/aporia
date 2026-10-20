/**
 * FLOW-GENIUS-04 / Stage 6 — Aporetic MnemosynePort (product wire into lean pack).
 *
 * Owns the retrieval → CitedRetrieval path for SessionRunner lean packs.
 * Does not open host `~/.config/opencode/mnemosyne/mnemosyne.db`, does not install,
 * does not stop shared services. External tree at C:\Perseus\mnemosyne remains a
 * discovery lead; this port is the Aporetic product boundary.
 *
 * Not Stage 6 complete / I tests 1–7 / J acceptance.
 */
export * as MnemosynePortModule from "./mnemosyne-port.js"

import type { CitedRetrieval } from "../session/lean-pack.js"

/** Bound how many cited hits enter the lean pack (Stage 6 budget). */
export const DEFAULT_RETRIEVAL_LIMIT = 4

/** Bound excerpt chars per hit (honest truncate via lean-pack artifactPointer later). */
export const DEFAULT_EXCERPT_CHARS = 280

export type MnemosyneScope = "project" | "team" | "bot" | "user" | "private" | string

export type MnemosyneHit = {
  readonly id: string
  readonly body: string
  readonly scope: MnemosyneScope
  readonly kind?: string
  /** Optional authority / supersession marker for later I-3 work. */
  readonly supersededBy?: string
  readonly score?: number
  readonly createdAt?: string
}

export type MnemosyneSearchInput = {
  readonly query: string
  readonly limit?: number
  /** When set, only hits in this scope are returned (I-2 foundation). */
  readonly scope?: MnemosyneScope
  /** When true, include superseded rows (default false — correction wins). */
  readonly includeSuperseded?: boolean
}

export type MnemosyneRememberInput = {
  readonly body: string
  readonly scope?: MnemosyneScope
  readonly kind?: string
  readonly id?: string
  /** Prior memory id this fact corrects (I-3 foundation). */
  readonly supersedes?: string
}

export type MnemosyneAvailability = "available" | "unavailable" | "mocked"

/**
 * Product boundary for durable recall used by Stage 6 lean pack assembly.
 * Implementations must be DEV-safe: no silent host-DB reads.
 */
export type MnemosynePort = {
  readonly availability: () => MnemosyneAvailability
  readonly search: (input: MnemosyneSearchInput) => ReadonlyArray<MnemosyneHit>
  readonly remember: (input: MnemosyneRememberInput) => { readonly id: string; readonly ok: true } | { readonly ok: false; readonly reason: string }
  readonly forget: (id: string) => { readonly ok: true; readonly forgotten: boolean } | { readonly ok: false; readonly reason: string }
}

export type MnemosyneSeed = {
  readonly id: string
  readonly body: string
  readonly scope?: MnemosyneScope
  readonly kind?: string
  readonly supersededBy?: string
  readonly createdAt?: string
}

const TOKEN = /[a-zA-Z][a-zA-Z0-9_]*/g

function tokens(text: string): Set<string> {
  const out = new Set<string>()
  const matched = text.toLowerCase().match(TOKEN) ?? []
  for (const t of matched) out.add(t)
  return out
}

function overlapScore(query: string, body: string): number {
  const q = tokens(query)
  if (q.size === 0) return 0
  const b = tokens(body)
  let hit = 0
  for (const t of q) if (b.has(t)) hit += 1
  return hit / q.size
}

function clipExcerpt(body: string, maxChars: number = DEFAULT_EXCERPT_CHARS): string {
  const trimmed = body.trim()
  if ([...trimmed].length <= maxChars) return trimmed
  let end = 0
  let kept = 0
  for (const char of trimmed) {
    if (kept === maxChars) break
    end += char.length
    kept++
  }
  return `${trimmed.slice(0, end)}…`
}

/** Map port hits → lean-pack CitedRetrieval (source required; mnemosyne:<id>). */
export function hitsToCitedRetrieval(
  hits: ReadonlyArray<MnemosyneHit>,
  opts?: { readonly excerptChars?: number },
): CitedRetrieval[] {
  const excerptChars = opts?.excerptChars ?? DEFAULT_EXCERPT_CHARS
  return hits
    .filter((h) => h.id.trim().length > 0 && h.body.trim().length > 0)
    .map((h) => ({
      source: `mnemosyne:${h.id.trim()}`,
      excerpt: clipExcerpt(h.body, excerptChars),
    }))
}

/** Build a cheap recall query from mission/task text (no model). */
export function buildRecallQuery(parts: {
  readonly objective?: string
  readonly taskTitle?: string
  readonly extra?: string
}): string {
  return [parts.objective, parts.taskTitle, parts.extra]
    .map((p) => p?.trim() ?? "")
    .filter((p) => p.length > 0)
    .join(" ")
}

/**
 * Search via port and convert to CitedRetrieval under Stage 6 budgets.
 * Unavailable / mocked-unavailable ports return [] (honest omit; no invented memory).
 */
export function recallCitedRetrieval(
  port: MnemosynePort,
  input: {
    readonly query: string
    readonly limit?: number
    readonly scope?: MnemosyneScope
    readonly excerptChars?: number
  },
): CitedRetrieval[] {
  const availability = port.availability()
  if (availability === "unavailable") return []
  const query = input.query.trim()
  if (query.length === 0) return []
  const hits = port.search({
    query,
    limit: input.limit ?? DEFAULT_RETRIEVAL_LIMIT,
    scope: input.scope,
    includeSuperseded: false,
  })
  return hitsToCitedRetrieval(hits, { excerptChars: input.excerptChars })
}

type MutableRow = {
  id: string
  body: string
  scope: MnemosyneScope
  kind: string
  supersededBy?: string
  createdAt: string
  deleted: boolean
}

/**
 * In-memory / fixture MnemosynePort for isolated DEV unit tests.
 * Keyword overlap ranking — no substrate, no host DB, no install.
 */
export function createFixtureMnemosynePort(seeds: ReadonlyArray<MnemosyneSeed> = []): MnemosynePort {
  const rows = new Map<string, MutableRow>()
  let seq = 0
  for (const seed of seeds) {
    rows.set(seed.id, {
      id: seed.id,
      body: seed.body,
      scope: seed.scope ?? "project",
      kind: seed.kind ?? "note",
      supersededBy: seed.supersededBy,
      createdAt: seed.createdAt ?? "fixture",
      deleted: false,
    })
  }

  return {
    availability: () => "mocked",
    search(input) {
      const limit = Math.max(0, Math.floor(input.limit ?? DEFAULT_RETRIEVAL_LIMIT))
      const scored: MnemosyneHit[] = []
      for (const row of rows.values()) {
        if (row.deleted) continue
        if (!input.includeSuperseded && row.supersededBy) continue
        if (input.scope && row.scope !== input.scope) continue
        const score = overlapScore(input.query, row.body)
        if (score <= 0) continue
        scored.push({
          id: row.id,
          body: row.body,
          scope: row.scope,
          kind: row.kind,
          supersededBy: row.supersededBy,
          score,
          createdAt: row.createdAt,
        })
      }
      scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.id.localeCompare(b.id))
      return scored.slice(0, limit)
    },
    remember(input) {
      const body = input.body.trim()
      if (body.length === 0) return { ok: false, reason: "empty body" }
      seq += 1
      const id = input.id?.trim() || `mem_fix_${seq}`
      if (input.supersedes) {
        const prior = rows.get(input.supersedes)
        if (prior && !prior.deleted) prior.supersededBy = id
      }
      rows.set(id, {
        id,
        body,
        scope: input.scope ?? "project",
        kind: input.kind ?? "note",
        createdAt: new Date().toISOString(),
        deleted: false,
      })
      return { id, ok: true }
    },
    forget(id) {
      const row = rows.get(id)
      if (!row || row.deleted) return { ok: true, forgotten: false }
      row.deleted = true
      return { ok: true, forgotten: true }
    },
  }
}

/** Unavailable adapter — I-6 foundation; writes fail truthfully; search empty. */
export function createUnavailableMnemosynePort(reason = "Mnemosyne unavailable in isolated DEV"): MnemosynePort {
  return {
    availability: () => "unavailable",
    search: () => [],
    remember: () => ({ ok: false, reason }),
    forget: () => ({ ok: false, reason }),
  }
}

/**
 * Process default for SessionRunner auto-wire.
 * Starts unavailable (no host DB). Tests / DEV can replace via setDefaultMnemosynePort.
 */
let defaultPort: MnemosynePort = createUnavailableMnemosynePort(
  "Default MnemosynePort is unavailable — inject fixture/DEV adapter; host mnemosyne.db not auto-opened",
)

export function getDefaultMnemosynePort(): MnemosynePort {
  return defaultPort
}

export function setDefaultMnemosynePort(port: MnemosynePort): void {
  defaultPort = port
}

/** Restore unavailable default (tests). */
export function resetDefaultMnemosynePort(): void {
  defaultPort = createUnavailableMnemosynePort(
    "Default MnemosynePort is unavailable — inject fixture/DEV adapter; host mnemosyne.db not auto-opened",
  )
}
