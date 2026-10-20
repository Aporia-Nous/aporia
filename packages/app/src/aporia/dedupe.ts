/**
 * Two messages are the same message when the same sender addresses the same target with the same words, however the
 * whitespace differs. Used to drop a repeat instead of running another agent turn for it.
 */
export const fingerprint = (from: string, to: string, body: string) =>
  `${from}\u0000${to}\u0000${body.trim().replace(/\s+/g, " ")}`

export type Dedupe = ReturnType<typeof createDedupe>

/**
 * Remembers fingerprints for a window. A retry of the *same* message is never a duplicate — only a different message
 * that repeats the same words inside the window is, so a message waiting on its target's turn is not eaten by its own
 * next tick.
 */
export function createDedupe(windowMs: number) {
  const seen = new Map<string, { id: string; at: number }>()

  return {
    duplicate(key: string, id: string, now = Date.now()) {
      for (const [existing, seenAt] of seen) if (now - seenAt.at >= windowMs) seen.delete(existing)

      const before = seen.get(key)
      seen.set(key, { id, at: now })

      return before !== undefined && before.id !== id
    },
    get size() {
      return seen.size
    },
  }
}
