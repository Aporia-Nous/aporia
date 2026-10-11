// APORIA: per-target scheduler for the bot dispatcher.
//
// The dispatcher used to serialize the whole inbox on a single module-global `running` flag, so one
// slow bot or room round (turns are polled every 3 s and run up to a 15-min timeout) blocked every
// other bot. This module keeps that "never deliver the same target twice at once" guarantee, but
// scopes it to the target: each bot slug and each room gets its own in-flight lock, and independent
// targets are scheduled concurrently.
//
// It is deliberately free of Solid/SDK/desktop-bridge imports so the concurrency contract is testable
// with injected `load`/`deliver`.

/** A per-target identity: one bot slug, or one room. */
export type TargetKey = string

export type SchedulerDeps<M, C> = {
  /** Fetch the pending messages plus the per-tick context (e.g. the bot list) handed to `deliver`. */
  load: () => Promise<{ messages: M[]; context: C } | null | undefined>
  /** Deliver one message. Only ever called with a target's lock held, in queue order. */
  deliver: (m: M, context: C) => Promise<void>
  /** The in-flight identity of a message (e.g. `bot:<slug>` or `room:<slug>`). */
  target: (m: M) => TargetKey
  /** Priority messages are ordered ahead of non-priority ones within a target. Defaults to false. */
  priority?: (m: M) => boolean | undefined
  /** Called when a delivery throws. If it throws too, that target's remaining queue is abandoned. */
  onError?: (m: M, err: unknown, context: C) => void | Promise<void>
}

export type DispatchScheduler<M> = {
  /** Load pending messages and schedule independent targets. Targets already in flight are skipped. */
  tick: () => Promise<void>
  /** Resolve once every currently-scheduled target worker has finished. */
  idle: () => Promise<void>
  /** Target keys currently being delivered. */
  inFlight: () => TargetKey[]
  /** Whether a target is currently in flight. */
  isLocked: (key: TargetKey) => boolean
}

export function createDispatchScheduler<M, C = unknown>(deps: SchedulerDeps<M, C>): DispatchScheduler<M> {
  const locked = new Set<TargetKey>()
  const workers = new Set<Promise<void>>()
  let ticking = false

  async function tick(): Promise<void> {
    // Re-entrancy guard for the load phase only; turns run detached so the next tick can pick up
    // messages for targets that are not already in flight.
    if (ticking) return
    ticking = true
    try {
      const loaded = await deps.load()
      const messages = loaded?.messages ?? []
      if (!messages.length) return
      const context = loaded!.context as C

      // Priority first, preserving the original stable sort; queue order is kept within a target.
      const order = [...messages].sort((a, b) => Number(deps.priority?.(b) ?? false) - Number(deps.priority?.(a) ?? false))

      const groups = new Map<TargetKey, M[]>()
      for (const m of order) {
        const key = deps.target(m)
        if (locked.has(key)) continue // a message for an in-flight target queues until its lock frees
        const bucket = groups.get(key)
        if (bucket) bucket.push(m)
        else groups.set(key, [m])
      }

      for (const [key, queue] of groups) {
        locked.add(key)
        const worker = (async () => {
          try {
            for (const m of queue) {
              try {
                await deps.deliver(m, context)
              } catch (err) {
                try {
                  await deps.onError?.(m, err, context)
                } catch {
                  return // error reporting itself failed; abandon this target rather than spin
                }
              }
            }
          } finally {
            locked.delete(key)
          }
        })()
        workers.add(worker)
        void worker.then(
          () => workers.delete(worker),
          () => workers.delete(worker),
        )
      }
    } finally {
      ticking = false
    }
  }

  async function idle(): Promise<void> {
    while (workers.size) await Promise.allSettled([...workers])
  }

  return {
    tick,
    idle,
    inFlight: () => [...locked],
    isLocked: (key) => locked.has(key),
  }
}
