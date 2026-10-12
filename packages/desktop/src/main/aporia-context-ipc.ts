// APORIA: IPC for the grounded context store. Kept out of aporia-context.ts so that file
// stays importable by unit tests without Electron.
import { ipcMain } from "electron"
import { aporiaLog } from "./aporia-log"
import { contextDir, createContextStore, handleContext, type ContextInput } from "./aporia-context"
import { handleImport, type SessionLike } from "./aporia-context-import"

export const AporiaContextChannel = "aporia:context"

export function registerAporiaContextHandler() {
  const dir = contextDir(process.env.APORIA_HOME)
  if (!dir) {
    // Fail loudly rather than writing to the CWD.
    aporiaLog.error("aporia context: APORIA_HOME is not set; the context store is disabled")
    return
  }
  const store = createContextStore(dir)
  ipcMain.handle(AporiaContextChannel, (_event, input: ContextInput | { op: "import"; sessions?: SessionLike[] }) => {
    if (input?.op === "import") {
      const result = handleImport(store, input.sessions ?? [])
      return { ...result, entries: store.all() }
    }
    return handleContext(store, input as ContextInput)
  })
}
