// APORIA: grounded answers. A bot may answer only from sourced context entries and must
// cite them; anything else is caught and flagged. Pure functions so they are testable.
export type GroundEntry = { id: string; topic: string; text: string }
export type GroundVerdict = { ok: boolean; reason: "ok" | "no-source" | "uncited" | "bad-cite" }

const NO_SOURCE = "No source is available for this. If you cannot answer from a stored source, say plainly that you have no source. Do not guess."

export function buildGroundedPrompt(
  question: string,
  entries: GroundEntry[],
  cap = 20,
): { prompt: string; allowedIds: string[] } {
  const chosen = entries.slice(0, cap)
  const allowedIds = chosen.map((e) => e.id)
  if (chosen.length === 0) return { prompt: `Question: ${question}\n\n${NO_SOURCE}`, allowedIds }
  const list = chosen.map((e) => `- [${e.id}] (${e.topic}): ${e.text}`).join("\n")
  return {
    prompt:
      "Answer ONLY from these sourced facts. Cite the id(s) you used in square brackets, e.g. [id]. " +
      "If none fit, say you have no source. Do not guess.\n\n" +
      `${list}\n\nQuestion: ${question}`,
    allowedIds,
  }
}

export function extractCitations(reply: string): string[] {
  const ids = new Set<string>()
  for (const match of reply.matchAll(/\[([0-9a-f]{8,})\]/gi)) ids.add(match[1].toLowerCase())
  for (const match of reply.matchAll(/(?<![0-9a-z])([0-9a-f]{8,})(?![0-9a-z])/gi)) ids.add(match[1].toLowerCase())
  return [...ids]
}

export function verifyGrounded(reply: string, allowedIds: string[]): GroundVerdict {
  const allowed = new Set(allowedIds.map((id) => id.toLowerCase()))
  const cites = extractCitations(reply)
  if (allowed.size === 0) return { ok: false, reason: "no-source" }
  if (cites.length === 0) return { ok: false, reason: "uncited" }
  if (cites.some((cite) => !allowed.has(cite))) return { ok: false, reason: "bad-cite" }
  return { ok: true, reason: "ok" }
}
