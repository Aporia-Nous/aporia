// APORIA: bot scopes + duplicate check. A bot owns topics and must not create a fact that
// already exists — one source of truth, no duplicates. Pure, so it is testable.
export function scopedEntries<T extends { topic: string }>(entries: T[], scopes: string[] | undefined): T[] {
  if (scopes === undefined) return entries.slice() // no scope configured yet: keep Phase-2 behaviour
  const allowed = new Set(scopes)
  return entries.filter((entry) => allowed.has(entry.topic))
}

export function normaliseFact(text: string): string {
  return String(text ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

export function isDuplicate(
  candidate: { topic: string; text: string },
  existing: { topic: string; text: string }[],
): boolean {
  const normalised = normaliseFact(candidate.text)
  return existing.some((entry) => entry.topic === candidate.topic && normaliseFact(entry.text) === normalised)
}
