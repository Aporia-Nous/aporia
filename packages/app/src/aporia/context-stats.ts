// APORIA: pure helpers for the Context settings view.
export function topicCounts(entries: { topic: string }[]): { topic: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const entry of entries) counts.set(entry.topic, (counts.get(entry.topic) ?? 0) + 1)
  return [...counts.entries()]
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic))
}
