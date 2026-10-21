// APORIA: expert policy. An "expert" bot must research and store a sourced finding BEFORE it
// answers; a "worker" answers directly. Pure, so it is testable.
export type BotKind = "expert" | "worker"

/** True when this bot must run a research pass before it may answer. */
export function needsResearch(kind: BotKind | undefined, hasFindings: boolean): boolean {
  return kind === "expert" && !hasFindings
}

export function researchPrompt(question: string, scopes: string[] | undefined): string {
  const scope = scopes && scopes.length ? scopes.join(", ") : "the general topic"
  return (
    `You are an expert on ${scope}. Before you answer, find it out — use web search or read the files. ` +
    `Then save what you learned with the remember_finding tool (topic, text, and the source: the url or ` +
    `file path you got it from — a finding without a real source is rejected). Then answer.\n\nQuestion: ${question}`
  )
}
