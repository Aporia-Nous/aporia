// APORIA: read-only import. Turns existing chats into topic-tagged, source-linked context
// entries. It only PLANS and writes entries — it never modifies, moves, or deletes a session.
import { entryId, type ContextStore, type Entry } from "./aporia-context"

export type SessionMessageLike = { id: string; role: "user" | "assistant"; text: string }
export type SessionLike = { id: string; title: string; messages: SessionMessageLike[] }

export type ImportPlan = { planned: Omit<Entry, "id" | "created">[]; skipped: number }

// Defensive caps: the renderer limits itself, but the main process must not trust that.
const MAX_SESSIONS = 2000
const MAX_MESSAGES = 500

export function planImport(sessions: SessionLike[], store: ContextStore): ImportPlan {
  const planned: Omit<Entry, "id" | "created">[] = []
  const seen = new Set<string>()
  let skipped = 0
  for (const session of Array.isArray(sessions) ? sessions.slice(0, MAX_SESSIONS) : []) {
    // Null-safe: a malformed element is counted as skipped, never dereferenced.
    if (!session?.id) { skipped++; continue }
    const title = typeof session.title === "string" ? session.title.trim() : ""
    const topic = title || "untitled"
    const messages = Array.isArray(session.messages) ? session.messages.slice(0, MAX_MESSAGES) : []
    for (const message of messages) {
      const text = typeof message?.text === "string" ? message.text.trim() : ""
      if (!text || !message?.id) {
        // Never write an entry without a real source — skip and count it.
        skipped++
        continue
      }
      const input: Omit<Entry, "id" | "created"> = {
        topic,
        tags: [],
        text,
        source: { kind: "session", ref: `${session.id}:${message.id}`, sessionID: session.id, messageID: message.id },
      }
      const id = entryId(input)
      if (store.has(id) || seen.has(id)) continue
      seen.add(id)
      planned.push(input)
    }
  }
  return { planned, skipped }
}

/** Plan and write an import in one step. Read-only w.r.t. the source sessions. */
export function handleImport(store: ContextStore, sessions: SessionLike[]): { added: number; skipped: number } {
  const { planned, skipped } = planImport(sessions, store)
  for (const entry of planned) store.add(entry)
  return { added: planned.length, skipped }
}
