// APORIA: startup sequencing for Aporia's main-process subsystems.
//
// Aporia's IPC handlers are cheap to register, so they go up before the first window paints. The
// expensive bots init (seed + migrate + memory-MCP config write + regenerate every agent file +
// install the memory watchers) must NOT sit on the ready -> window critical path, so it is deferred
// to a later tick. A failure in either half is reported through `onError` instead of being swallowed
// to console.error, and the caller also records it on the bots health flag.
//
// Ordering: register() -> createWindow() -> (later tick) start().
export interface AporiaStartupOptions {
  /** Registers IPC handlers. Cheap and synchronous; safe to run before the window. */
  readonly register: () => void
  /** Creates the first window. Runs after register and before start. */
  readonly createWindow: () => void
  /** Expensive Aporia init. Deferred so the window is on screen before it runs. */
  readonly start: () => void
  /** Records/logs a failure from either half. Must not throw. */
  readonly onError: (stage: "register" | "start", error: Error) => void
  /** Schedules the deferred start. Injectable for tests; defaults to a macrotask. */
  readonly defer?: (run: () => void) => void
}

export function runAporiaStartup(options: AporiaStartupOptions): void {
  try {
    options.register()
  } catch (error) {
    options.onError("register", error instanceof Error ? error : new Error(String(error)))
  }

  options.createWindow()

  const defer = options.defer ?? ((run: () => void) => void setTimeout(run, 0))
  defer(() => {
    try {
      options.start()
    } catch (error) {
      options.onError("start", error instanceof Error ? error : new Error(String(error)))
    }
  })
}
