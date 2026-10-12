// APORIA: the grounded context store. One local, append-only fact index where every entry
// carries its SOURCE (a chat message, url, or file), so bots can answer only from cited
// facts and never from guesswork. See docs/superpowers/specs/2026-10-12-bot-system-design.md.
import { createHash } from "node:crypto"
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs"
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

/** Stable id for an entry: same source+topic+text always yields the same id, so import is idempotent. */
export function entryId(e: Omit<Entry, "id" | "created">): string {
  return createHash("sha256").update(`${e.source.ref}\n${e.topic}\n${e.text}`).digest("hex")
}

export function createContextStore(dir: string): ContextStore {
  const file = join(dir, "entries.jsonl")
  mkdirSync(dir, { recursive: true })
  let entries: Entry[] = []
  const index = new Map<string, Entry>()
  if (existsSync(file)) {
    for (const line of readFileSync(file, "utf8").split("\n")) {
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
  }
  return {
    add(input) {
      const id = entryId(input)
      const existing = index.get(id)
      if (existing) return existing
      const entry: Entry = { ...input, id, created: Date.now() }
      entries.push(entry)
      index.set(id, entry)
      appendFileSync(file, JSON.stringify(entry) + "\n")
      return entry
    },
    all() {
      return [...entries]
    },
    has(id) {
      return index.has(id)
    },
    query({ topic, tag, text }) {
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
