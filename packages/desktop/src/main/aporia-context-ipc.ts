// APORIA: IPC for the grounded context store. Kept out of aporia-context.ts so that file
// stays importable by unit tests without Electron.
import { ipcMain } from "electron"
import { join } from "node:path"
import { aporiaLog } from "./aporia-log"
import { createContextStore, handleContext, type ContextInput } from "./aporia-context"

export const AporiaContextChannel = "aporia:context"

export function registerAporiaContextHandler() {
  const home = process.env.APORIA_HOME
  if (!home) {
    // Fail loudly rather than writing to the CWD.
    aporiaLog.error("aporia context: APORIA_HOME is not set; the context store is disabled")
    return
  }
  const store = createContextStore(join(home, "context"))
  ipcMain.handle(AporiaContextChannel, (_event, input: ContextInput) => handleContext(store, input))
}
