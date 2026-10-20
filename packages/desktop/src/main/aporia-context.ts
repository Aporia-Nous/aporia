// APORIA: shared memory. One local, append-only fact index where every entry carries its SOURCE
// (a chat message, url, or file), so the memory can be trusted and bots don't repeat each other.
// Bots MAY use it as background; they are never required to answer only from it. See
// docs/superpowers/specs/2026-10-12-bot-system-design.md.
import { createHash } from "node:crypto"
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

export type EntrySource =
  | { kind: "session"; ref: string; sessionID?: string; messageID?: string }
  | { kind: "url"; ref: string }
  | { kind: "file"; ref: string }

export type Entry = {
  id: string
  topic: string
  tags: string[]
  text: string
  source: EntrySource
  created: number
}

export type EntryInput = Omit<Entry, "id" | "created">

export type ContextStore = {
  add(e: EntryInput): Entry
  all(): Entry[]
  query(q: { topic?: string; tag?: string; text?: string }): Entry[]
  has(id: string): boolean
}

/** Where the store lives. Mirrors aporia-bots.ts: APORIA_HOME, else ~/Aporia. Never the CWD. */
export function contextDir(home: string | undefined): string {
  const base = home && home.trim() ? home : join(homedir(), "Aporia")
  return join(base, "context")
}

/** Stable id for an entry: same source+topic+text always yields the same id, so import is idempotent. */
export function entryId(e: Omit<Entry, "id" | "created">): string {
  return createHash("sha256").update(`${e.source.ref}\n${e.topic}\n${e.text}`).digest("hex")
}

export function createContextStore(dir: string): ContextStore {
  const file = join(dir, "entries.jsonl")
  mkdirSync(dir, { recursive: true })
  let entries: Entry[] = []
  let loadedSize = 0
  const index = new Map<string, Entry>()
  const load = () => {
    entries = []
    index.clear()
    if (!existsSync(file)) { loadedSize = 0; return }
    const raw = readFileSync(file, "utf8")
    for (const line of raw.split("\n")) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const e = JSON.parse(trimmed) as Entry
        entries.push(e)
        index.set(e.id, e)
      } catch {
        // skip a corrupt line rather than lose the whole store
      }
    }
    // Track the bytes we ACTUALLY read (not a fresh stat): a write that lands after this read leaves
    // the file larger than loadedSize, so the next refresh reloads instead of absorbing the bytes.
    loadedSize = Buffer.byteLength(raw)
  }
  load()
  // The store is shared with the aporia-memory MCP (and the importer); another writer can append
  // while we are running, so re-read when the file changed instead of serving a stale snapshot.
  const refresh = () => {
    try {
      if (statSync(file).size !== loadedSize) load()
    } catch {
      loadedSize = 0
      load()
    }
  }
  return {
    add(input) {
      if (!input || typeof input.topic !== "string" || typeof input.text !== "string" || !Array.isArray(input.tags)) {
        throw new Error("context entry requires a string topic, string text, and array tags")
      }
      if (!input.source || typeof input.source.ref !== "string" || !input.source.ref.trim()) {
        throw new Error("context entry requires a non-empty source ref")
      }
      refresh()
      const id = entryId(input)
      const existing = index.get(id)
      if (existing) return existing
      const entry: Entry = { ...input, id, created: Date.now() }
      entries.push(entry)
      index.set(id, entry)
      appendFileSync(file, JSON.stringify(entry) + "\n")
      // Re-read so loadedSize reflects exactly what is on disk (and any concurrent external write).
      load()
      return entry
    },
    all() {
      refresh()
      return [...entries]
    },
    has(id) {
      refresh()
      return index.has(id)
    },
    query({ topic, tag, text }) {
      refresh()
      const needle = text?.toLowerCase()
      return entries.filter(
        (e) =>
          (topic === undefined || e.topic === topic) &&
          (tag === undefined || e.tags.includes(tag)) &&
          (needle === undefined || e.text.toLowerCase().includes(needle)),
      )
    },
  }
}

export type ContextInput =
  | { op: "all" }
  | { op: "add"; entry: EntryInput }
  | { op: "query"; q: { topic?: string; tag?: string; text?: string } }

export type ContextResult = { entries?: Entry[]; entry?: Entry }

/** Pure op dispatcher, extracted so it is testable without Electron. */
export function handleContext(store: ContextStore, input: ContextInput): ContextResult {
  switch (input?.op) {
    case "all":
      return { entries: store.all() }
    case "add":
      if (!input.entry?.source?.ref) throw new Error("context add requires an entry with a source")
      return { entry: store.add(input.entry) }
    case "query":
      return { entries: store.query(input.q ?? {}) }
    default:
      throw new Error(`Unknown context op: ${String((input as { op?: string })?.op)}`)
  }
}

