import { createHash } from "node:crypto"

/**
 * One persistent browser profile per server and session, so a sign-in survives closing the pane and closing the app.
 * An Electron partition without the `persist:` prefix lives only in memory, which is why every pane used to start
 * signed out. The key is hashed to keep the partition name filesystem-safe on every platform.
 */
export const browserProfile = (storageKey: string) =>
  `persist:opencode-browser-${createHash("sha256").update(storageKey).digest("hex").slice(0, 32)}`
