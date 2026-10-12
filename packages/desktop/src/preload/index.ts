import { contextBridge, ipcRenderer, webUtils } from "electron"
import {
  DragCancelEvent,
  IpcTransportPort,
  WindowSnapshotChannel,
  storageSnapshotNames,
  type WindowSnapshot,
} from "../shared/ipc-transport"
import { windowBootstrapFromArguments } from "../shared/window-bootstrap"

ipcRenderer.on(IpcTransportPort, (event) => {
  const port = event.ports[0]

  if (port) window.postMessage(IpcTransportPort, "*", [port])
})

ipcRenderer.on(DragCancelEvent, () => window.dispatchEvent(new Event(DragCancelEvent)))

const bootstrap = windowBootstrapFromArguments(process.argv)

// Asked before the page runs, so the stores the shell reads are hydrated on the first render.
const snapshot: Promise<WindowSnapshot> = ipcRenderer
  .invoke(WindowSnapshotChannel, storageSnapshotNames(bootstrap.id))
  .catch(() => ({ storage: {} }))

contextBridge.exposeInMainWorld("electron", {
  windowID: bootstrap.id,
  bootstrap,
  storageSnapshot: snapshot.then((snapshot) => snapshot.storage),
  extensions: snapshot.then((snapshot) => snapshot.extensions),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  // APORIA: persist a Connect-apps MCP server into the global opencode config ({env:NAME} refs only).
  aporia: {
    persistMcp: (name: string, config: unknown) => ipcRenderer.invoke("aporia:mcp-persist", { name, config }),
    n8n: (input: unknown) => ipcRenderer.invoke("aporia:n8n", input),
    setEnv: (name: string, value: string) => ipcRenderer.invoke("aporia:set-env", { name, value }),
    which: (command: string) => ipcRenderer.invoke("aporia:which", { command }),
    votel: (input: unknown) => ipcRenderer.invoke("aporia:votel", input),
    owner: (input: unknown) => ipcRenderer.invoke("aporia:owner", input),
    vault: (input: unknown) => ipcRenderer.invoke("aporia:vault", input),
    update: (input: unknown) => ipcRenderer.invoke("aporia:update", input),
    accounts: (input: unknown) => ipcRenderer.invoke("aporia:accounts", input),
    bots: (input: unknown) => ipcRenderer.invoke("aporia:bots", input),
    routines: (input: unknown) => ipcRenderer.invoke("aporia:routines", input),
    tts: (input: unknown) => ipcRenderer.invoke("aporia:tts", input),
    ttsVoices: () => ipcRenderer.invoke("aporia:tts-voices"),
    stt: (input: unknown) => ipcRenderer.invoke("aporia:stt", input),
  },
})
