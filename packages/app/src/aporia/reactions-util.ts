// APORIA: pure helpers for the reactions layer, kept out of the component so the idle-poll
// early-out is testable without the SDK/desktop bridge.
export type Reaction = { at: string; by: "ali" | "bot"; emoji: string; messageID?: string; excerpt?: string }

/**
 * Signature of everything a paint depends on: the reaction list and the currently visible
 * turn ids. When it is unchanged between polls, the paint can skip the fetch-derived map
 * build and the whole `[data-message-id]` DOM sweep / innerHTML writes.
 */
export function reactionSignature(list: readonly Reaction[] | undefined, visibleIDs: readonly string[]) {
  return `${JSON.stringify(list ?? [])}|${visibleIDs.join(",")}`
}
