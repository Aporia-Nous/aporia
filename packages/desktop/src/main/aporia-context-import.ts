// APORIA: read-only import. Turns existing chats into topic-tagged, source-linked context
// entries. It only PLANS and writes entries — it never modifies, moves, or deletes a session.
import { entryId, type ContextStore, type Entry } from "./aporia-context"

export type SessionMessageLike = { id: string; role: "user" | "assistant"; text: string }
export type SessionLike = { id: string; title: string; messages: SessionMessageLike[] }

export type ImportPlan = { planned: Omit<Entry, "id" | "created">[]; skipped: number }

export function planImport(sessions: SessionLike[], store: ContextStore): ImportPlan {
  const planned: Omit<Entry, "id" | "created">[] = []
  const seen = new Set<string>()
  let skipped = 0
  for (const session of sessions) {
    const topic = session.title?.trim() || "untitled"
    for (const message of session.messages ?? []) {
      const text = (message.text ?? "").trim()
      if (!text) {
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
