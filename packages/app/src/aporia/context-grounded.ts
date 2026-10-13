// APORIA: shared-memory prompt for bots. The store is BACKGROUND a bot MAY use — it is not a gate.
// Bots are never told to refuse just because memory is empty, and citations are optional. The only
// hard rule lives on the WRITE side (see scripts/aporia-memory-mcp.mjs remember_finding): a fact is
// only stored when it came from a real source. Pure, so it is testable.
export type GroundEntry = { id: string; topic: string; text: string }

/** Give the bot whatever memory is relevant, then the task. Empty memory leaves the task untouched. */
export function buildMemoryPrompt(
  question: string,
  entries: GroundEntry[],
  cap = 20,
): { prompt: string; ids: string[] } {
  const chosen = entries.slice(0, cap)
  const ids = chosen.map((e) => e.id)
  if (chosen.length === 0) return { prompt: question, ids }
  const list = chosen.map((e) => `- [${e.id}] (${e.topic}): ${e.text}`).join("\n")
  return {
    prompt:
      "Relevant notes from shared memory. Each has a source; if you use one, cite its id in square " +
      "brackets — that is optional. If none of these help, just do the task normally.\n\n" +
      `${list}\n\nTask: ${question}`,
    ids,
  }
}

export function extractCitations(reply: string): string[] {
  const ids = new Set<string>()
  for (const match of reply.matchAll(/\[([0-9a-f]{8,})\]/gi)) ids.add(match[1].toLowerCase())
  for (const match of reply.matchAll(/(?<![0-9a-z])([0-9a-f]{8,})(?![0-9a-z])/gi)) ids.add(match[1].toLowerCase())
  return [...ids]
}
