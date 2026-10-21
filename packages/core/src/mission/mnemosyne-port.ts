/**
 * FLOW-GENIUS-04 / AP-STAGE6-IJ / AP-STAGE6-HOST-DB / Stage 6 — Aporetic MnemosynePort.
 *
 * Owns the retrieval → CitedRetrieval path for SessionRunner lean packs.
 * Product default is built-in DEV-local shared memory (file-backed under Aporetic
 * isolated DEV paths). Does **not** open host `~/.config/opencode/mnemosyne/mnemosyne.db`,
 * does not install, does not stop shared services. External tree at C:\Perseus\mnemosyne
 * remains a discovery lead; this port is the Aporetic product boundary.
 *
 * I/J gates live in packages/core/test/session-stage6-i.test.ts + session-runner J fixtures.
 */
export * as MnemosynePortModule from "./mnemosyne-port.js"

import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import type { CitedRetrieval } from "../session/lean-pack.js"

/** Bound how many cited hits enter the lean pack (Stage 6 budget). */
export const DEFAULT_RETRIEVAL_LIMIT = 4

/** Bound excerpt chars per hit (honest truncate via lean-pack artifactPointer later). */
export const DEFAULT_EXCERPT_CHARS = 280

/** Host opencode plugin DB — never auto-opened by Aporetic DEV default. */
export const HOST_OPENCODE_MNEMOSYNE_DB = path.join(
  os.homedir(),
  ".config",
  "opencode",
  "mnemosyne",
  "mnemosyne.db",
)

export type MnemosyneScope = "project" | "team" | "bot" | "user" | "private" | string

export type MnemosyneHit = {
  readonly id: string
  readonly body: string
  readonly scope: MnemosyneScope
  readonly kind?: string
  /** Optional authority / supersession marker (I-3). */
  readonly supersededBy?: string
  /** false = untrusted evidence only; never an instruction (I-5). */
  readonly trusted?: boolean
  /** Team-scope eligibility (I-2); absent = all bots in that team scope. */
  readonly eligibleBots?: ReadonlyArray<string>
  readonly score?: number
  readonly createdAt?: string
}

export type MnemosyneSearchInput = {
  readonly query: string
  readonly limit?: number
  /** When set, only hits in this scope are returned (I-2). */
  readonly scope?: MnemosyneScope
  /** When true, include superseded rows (default false — correction wins). */
  readonly includeSuperseded?: boolean
  /** Caller bot id for team eligibility (I-2). */
  readonly botId?: string
  /** When true, omit trusted:false evidence rows (instruction path). */
  readonly instructionsOnly?: boolean
}

export type MnemosyneRememberInput = {
  readonly body: string
  readonly scope?: MnemosyneScope
  readonly kind?: string
  readonly id?: string
  /** Prior memory id this fact corrects (I-3). */
  readonly supersedes?: string
  /** false stores evidence-only; instruction kind + untrusted is rejected (I-5). */
  readonly trusted?: boolean
  readonly eligibleBots?: ReadonlyArray<string>
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
  /** Present on DEV-local / fixture stores for diagnostics (optional). */
  readonly storePath?: () => string | undefined
}

export type MnemosyneSeed = {
  readonly id: string
  readonly body: string
  readonly scope?: MnemosyneScope
  readonly kind?: string
  readonly supersededBy?: string
  readonly trusted?: boolean
  readonly eligibleBots?: ReadonlyArray<string>
  readonly createdAt?: string
}

/** Reject promoting adversarial / injection-shaped text into instruction memories (I-5). */
export function canRememberAsInstruction(body: string): boolean {
  const lower = body.toLowerCase()
  if (lower.includes("ignore the owner")) return false
  if (lower.includes("send secrets")) return false
  if (lower.includes("disregard previous instructions")) return false
  return true
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
    readonly botId?: string
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
    botId: input.botId,
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
  trusted: boolean
  eligibleBots?: ReadonlyArray<string>
  createdAt: string
  deleted: boolean
}

type PersistFile = {
  readonly version: 1
  readonly rows: ReadonlyArray<MutableRow>
}

function normalizePath(p: string): string {
  return path.normalize(p).toLowerCase()
}

/** Refuse host opencode plugin DB and other non-DEV product paths. */
export function isForbiddenHostMnemosynePath(candidate: string): boolean {
  const n = normalizePath(candidate)
  if (n === normalizePath(HOST_OPENCODE_MNEMOSYNE_DB)) return true
  if (n.includes(`${path.sep}opencode${path.sep}mnemosyne${path.sep}`) && n.endsWith("mnemosyne.db")) return true
  return false
}

/**
 * Resolve isolated-DEV store path for built-in shared memory.
 * Priority: APORETIC_MNEMOSYNE_PATH → XDG_STATE_HOME/aporetic/mnemosyne → ~/.local/share/aporetic-dev/mnemosyne.
 * Returns undefined when unit-test ephemeral mode (OPENCODE_DB=:memory: without explicit path).
 */
export function resolveDevLocalMnemosynePath(): string | undefined {
  const explicit = process.env.APORETIC_MNEMOSYNE_PATH?.trim()
  if (explicit) {
    if (isForbiddenHostMnemosynePath(explicit)) {
      throw new Error(
        `APORETIC_MNEMOSYNE_PATH refuses host opencode mnemosyne.db (${explicit}). Use an Aporetic DEV-local path.`,
      )
    }
    return explicit
  }
  if (process.env.APORETIC_MNEMOSYNE_EPHEMERAL === "1") return undefined
  const db = process.env.OPENCODE_DB ?? ""
  if (db === ":memory:") return undefined

  const xdgState = process.env.XDG_STATE_HOME?.trim()
  if (xdgState) return path.join(xdgState, "aporetic", "mnemosyne", "store.json")

  return path.join(os.homedir(), ".local", "share", "aporetic-dev", "mnemosyne", "store.json")
}

function loadRows(persistPath: string | undefined, seeds: ReadonlyArray<MnemosyneSeed>): Map<string, MutableRow> {
  const rows = new Map<string, MutableRow>()
  if (persistPath && fs.existsSync(persistPath)) {
    try {
      const raw = fs.readFileSync(persistPath, "utf8")
      const parsed = JSON.parse(raw) as PersistFile
      if (parsed?.version === 1 && Array.isArray(parsed.rows)) {
        for (const row of parsed.rows) {
          if (!row?.id) continue
          rows.set(row.id, {
            id: row.id,
            body: row.body ?? "",
            scope: row.scope ?? "project",
            kind: row.kind ?? "note",
            supersededBy: row.supersededBy,
            trusted: row.trusted !== false,
            eligibleBots: row.eligibleBots,
            createdAt: row.createdAt ?? "restored",
            deleted: Boolean(row.deleted),
          })
        }
        return rows
      }
    } catch {
      // Corrupt/partial file: start empty; do not invent memories.
    }
  }
  for (const seed of seeds) {
    rows.set(seed.id, {
      id: seed.id,
      body: seed.body,
      scope: seed.scope ?? "project",
      kind: seed.kind ?? "note",
      supersededBy: seed.supersededBy,
      trusted: seed.trusted !== false,
      eligibleBots: seed.eligibleBots,
      createdAt: seed.createdAt ?? "fixture",
      deleted: false,
    })
  }
  return rows
}

function flushRows(persistPath: string | undefined, rows: Map<string, MutableRow>): void {
  if (!persistPath) return
  fs.mkdirSync(path.dirname(persistPath), { recursive: true })
  const payload: PersistFile = {
    version: 1,
    rows: [...rows.values()],
  }
  const tmp = `${persistPath}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2) + "\n", { encoding: "utf8", mode: 0o600 })
  fs.renameSync(tmp, persistPath)
}

type MemoryPortOpts = {
  readonly availability: MnemosyneAvailability
  readonly seeds?: ReadonlyArray<MnemosyneSeed>
  readonly persistPath?: string
}

/**
 * In-memory / optional file-backed MnemosynePort.
 * Keyword overlap ranking — no host opencode DB, no install, no embeddings substrate.
 */
function createMemoryBackedMnemosynePort(opts: MemoryPortOpts): MnemosynePort {
  const persistPath = opts.persistPath
  if (persistPath && isForbiddenHostMnemosynePath(persistPath)) {
    throw new Error(`Refusing forbidden host Mnemosyne path: ${persistPath}`)
  }
  const rows = loadRows(persistPath, opts.seeds ?? [])
  let seq = 0

  return {
    availability: () => opts.availability,
    storePath: () => persistPath,
    search(input) {
      const limit = Math.max(0, Math.floor(input.limit ?? DEFAULT_RETRIEVAL_LIMIT))
      const scored: MnemosyneHit[] = []
      for (const row of rows.values()) {
        if (row.deleted) continue
        if (!input.includeSuperseded && row.supersededBy) continue
        if (input.scope && row.scope !== input.scope) continue
        if (input.instructionsOnly && !row.trusted) continue
        if (
          row.eligibleBots &&
          row.eligibleBots.length > 0 &&
          input.botId &&
          !row.eligibleBots.includes(input.botId)
        ) {
          continue
        }
        const score = overlapScore(input.query, row.body)
        if (score <= 0) continue
        scored.push({
          id: row.id,
          body: row.body,
          scope: row.scope,
          kind: row.kind,
          supersededBy: row.supersededBy,
          trusted: row.trusted,
          eligibleBots: row.eligibleBots,
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
      const kind = input.kind ?? "note"
      const trusted = input.trusted !== false
      if ((kind === "instruction" || kind === "preference") && (!trusted || !canRememberAsInstruction(body))) {
        return { ok: false, reason: "untrusted evidence cannot become instruction" }
      }
      seq += 1
      const id = input.id?.trim() || `mem_${opts.availability === "mocked" ? "fix" : "dev"}_${seq}`
      if (input.supersedes) {
        const prior = rows.get(input.supersedes)
        if (prior && !prior.deleted) prior.supersededBy = id
      }
      rows.set(id, {
        id,
        body,
        scope: input.scope ?? "project",
        kind,
        trusted,
        eligibleBots: input.eligibleBots,
        createdAt: new Date().toISOString(),
        deleted: false,
      })
      flushRows(persistPath, rows)
      return { id, ok: true }
    },
    forget(id) {
      const row = rows.get(id)
      if (!row || row.deleted) return { ok: true, forgotten: false }
      row.deleted = true
      flushRows(persistPath, rows)
      return { ok: true, forgotten: true }
    },
  }
}

/**
 * In-memory / fixture MnemosynePort for isolated DEV unit tests.
 * Keyword overlap ranking — no substrate, no host DB, no install.
 */
export function createFixtureMnemosynePort(seeds: ReadonlyArray<MnemosyneSeed> = []): MnemosynePort {
  return createMemoryBackedMnemosynePort({ availability: "mocked", seeds })
}

/**
 * Built-in shared memory for isolated DEV — durable JSON store under Aporetic paths.
 * Auto-opens (creates parent dirs) on first write; reads empty store when file missing.
 */
export function createDevLocalMnemosynePort(
  persistPath: string,
  seeds: ReadonlyArray<MnemosyneSeed> = [],
): MnemosynePort {
  return createMemoryBackedMnemosynePort({
    availability: "available",
    persistPath,
    seeds,
  })
}

/** Ephemeral available port (unit tests / :memory: DB) — built-in shape without durable file. */
export function createEphemeralAvailableMnemosynePort(
  seeds: ReadonlyArray<MnemosyneSeed> = [],
): MnemosynePort {
  return createMemoryBackedMnemosynePort({ availability: "available", seeds })
}

/** Unavailable adapter — I-6 foundation; writes fail truthfully; search empty. */
export function createUnavailableMnemosynePort(reason = "Mnemosyne unavailable in isolated DEV"): MnemosynePort {
  return {
    availability: () => "unavailable",
    search: () => [],
    remember: () => ({ ok: false, reason }),
    forget: () => ({ ok: false, reason }),
    storePath: () => undefined,
  }
}

/**
 * Open the product-default MnemosynePort for SessionRunner auto-wire.
 * Built-in DEV-local shared memory (available). Never opens host opencode mnemosyne.db.
 */
export function openProductDefaultMnemosynePort(): MnemosynePort {
  const resolved = resolveDevLocalMnemosynePath()
  if (!resolved) return createEphemeralAvailableMnemosynePort()
  return createDevLocalMnemosynePort(resolved)
}

/**
 * Process default for SessionRunner auto-wire.
 * Lazy product default = built-in DEV-local (available). Tests may replace via setDefaultMnemosynePort.
 */
let defaultPort: MnemosynePort | undefined

export function getDefaultMnemosynePort(): MnemosynePort {
  if (!defaultPort) defaultPort = openProductDefaultMnemosynePort()
  return defaultPort
}

export function setDefaultMnemosynePort(port: MnemosynePort): void {
  defaultPort = port
}

/** Restore product-default built-in port (tests). */
export function resetDefaultMnemosynePort(): void {
  defaultPort = openProductDefaultMnemosynePort()
}
