// APORIA: IPC for the grounded context store. Kept out of aporia-context.ts so that file
// stays importable by unit tests without Electron.
import { ipcMain } from "electron"
import { contextDir, createContextStore, handleContext, type ContextInput } from "./aporia-context"
import { handleImport, type SessionLike } from "./aporia-context-import"

export const AporiaContextChannel = "aporia:context"

export function registerAporiaContextHandler() {
  // contextDir always resolves (APORIA_HOME, else ~/Aporia/context), so the store is always available;
  // the old "disabled / fail loudly" branch was unreachable dead code that logged a false status.
  const store = createContextStore(contextDir(process.env.APORIA_HOME))
  ipcMain.handle(AporiaContextChannel, (_event, input: ContextInput | { op: "import"; sessions?: SessionLike[] }) => {
    if (!input || typeof input !== "object") throw new Error("Invalid context request")
    if (input.op === "import") {
      // Validate the payload shape at the boundary; the main process does not trust the renderer.
      const sessions = Array.isArray((input as { sessions?: unknown }).sessions) ? (input as { sessions: SessionLike[] }).sessions : []
      const result = handleImport(store, sessions)
      return { ...result, entries: store.all() }
    }
    return handleContext(store, input as ContextInput)
  })
}
