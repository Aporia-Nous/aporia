// APORIA: pure helpers for the Attention panel, kept apart from the component so they are testable.

export type AttentionCard = {
  readonly id: string
  readonly title: string
  readonly body: string
  readonly state: "open" | "resolved"
  readonly createdAt: number
  readonly missionId?: string
  readonly taskId?: string
}

export type CoordinatorStatus = {
  readonly running: boolean
  readonly cursor: number
  readonly latest: number
  readonly drains: number
  readonly handled: number
  // The wire may carry null for an absent value; both mean "not yet".
  readonly lastDrainAt?: number | null
  readonly lastError?: string | null
}

/** "just now", "42s ago", "5m ago", "3h ago", "2d ago". Future times read as "just now". */
export function ago(at: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - at) / 1000))
  if (seconds < 5) return "just now"
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

/** One honest line about the coordinator for the panel footer. */
export function coordinatorLine(status: CoordinatorStatus | undefined, now: number): string {
  if (!status) return "Coordinator status unknown"
  if (!status.running) return "Coordinator is not running"
  if (status.lastError) return "Coordinator: last drain failed, retrying"
  const backlog = Math.max(0, status.latest - status.cursor)
  const caught = backlog === 0 ? "caught up" : `${backlog} event${backlog === 1 ? "" : "s"} behind`
  const last = status.lastDrainAt == null ? "no drain yet this run" : `last drain ${ago(status.lastDrainAt, now)}`
  return `Coordinator running · ${caught} · ${last}`
}

/** Badge text: nothing at 0, the count up to 99, then "99+". */
export function badge(count: number): string {
  if (count <= 0) return ""
  return count > 99 ? "99+" : String(count)
}

/**
 * One list request at a time, and never a stale answer. `invalidate()` marks every request already
 * in flight as stale (call it around a resolve): a stale answer is dropped, not applied, and one more
 * request runs as soon as the in-flight one finishes. Without this, a poll that left before a resolve
 * could land after it and put the resolved card back on screen.
 */
export function makeRefresher<T>(options: {
  readonly load: () => Promise<T>
  readonly apply: (value: T) => void
  readonly fail: (error: unknown) => void
  readonly done?: () => void
}) {
  let inflight = false
  let again = false
  let generation = 0
  const run = async (): Promise<void> => {
    if (inflight) {
      again = true
      return
    }
    inflight = true
    const ticket = generation
    try {
      const value = await options.load()
      if (ticket === generation) options.apply(value)
      else again = true
    } catch (error) {
      if (ticket === generation) options.fail(error)
      else again = true
    } finally {
      inflight = false
    }
    options.done?.()
    if (again) {
      again = false
      await run()
    }
  }
  return {
    run,
    invalidate: () => {
      generation++
    },
  }
}
