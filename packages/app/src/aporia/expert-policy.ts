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
    `You are an expert. Before you answer, RESEARCH ${scope} using web search and the context store, ` +
    `and store at least one sourced finding. Do not answer until a finding is stored.\n\nQuestion: ${question}`
  )
}
