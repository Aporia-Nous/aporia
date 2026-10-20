import { createEffect, type Accessor } from "solid-js"
import type { ServerConnectionStatus } from "../client"

/** E21 / PORT-03: coalesce global bootstrap refetch after reconnect blips. */
export const reconnectBootstrapDebounceMs = 300

export function createConnectionSync(input: {
  status: Accessor<ServerConnectionStatus>
  invalidate: () => void
  connected: (info: { reconnect: boolean }) => void
}) {
  createEffect(() => {
    if (input.status() === "connected") return
    input.invalidate()
  })

  let connectedOnce = false

  function handleEvent(event: { type: string }) {
    if (event.type !== "server.connected") return
    input.connected({ reconnect: connectedOnce })
    connectedOnce = true
  }

  return { handleEvent }
}

// Directories a mounted view holds refresh first; the rest keep their existing order behind them.
export function reconnectOrder(directories: string[], held: (directory: string) => boolean) {
  return [...directories.filter(held), ...directories.filter((directory) => !held(directory))]
}

/**
 * E21 + AP-ENGINE-PORT-03: shrink reconnect sync storm.
 * - First connect: held first, then remaining active (unchanged order policy).
 * - Reconnect: only held/pinned directories; inactive stay deferred until real access
 *   (child-store onBootstrap). Durable/live SSE + data.ts server.connected handle catch-up
 *   for open sessions without full all-dir bootstrapInstance fan-out.
 */
export function reconnectSyncDirectories(
  directories: string[],
  held: (directory: string) => boolean,
  opts: { reconnect: boolean },
): string[] {
  const ordered = reconnectOrder(directories, held)
  if (!opts.reconnect) return ordered
  return ordered.filter(held)
}

/** Debounce helper for reconnect bootstrap refetch (E21). */
export function createCoalescedRunner(delayMs: number, run: () => void) {
  let timer: ReturnType<typeof setTimeout> | undefined
  return {
    schedule() {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = undefined
        run()
      }, delayMs)
    },
    cancel() {
      if (!timer) return
      clearTimeout(timer)
      timer = undefined
    },
  }
}
