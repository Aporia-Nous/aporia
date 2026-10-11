// Imported first so its evaluation stamps the moment Electron handed control to this module.
import { marks } from "./lifecycle/marks"
import { app } from "electron"
import { acquireApplicationLock, configureApplication } from "./lifecycle/configure"
import { startSidecarProbe } from "./service/sidecar-probe"
import { registerStorageSnapshotHandler } from "./storage/snapshot"
import { registerAporiaMcpHandler } from "./aporia-mcp" // APORIA
import { registerAporiaOwnerHandler } from "./aporia-owner"
import { registerAporiaVotelHandler } from "./aporia-votel"
import { registerAporiaEnvHandler } from "./aporia-env"
import { registerAporiaVaultHandler } from "./aporia-vault"
import { registerAporiaAccountsHandler } from "./aporia-accounts"
import { registerAporiaN8nHandler } from "./aporia-n8n" // APORIA
import { registerAporiaBotsHandler } from "./aporia-bots" // APORIA
import { registerAporiaRoutinesHandler } from "./aporia-routines" // APORIA
import { applyStagedUpdateOnLaunch, registerAporiaUpdateHandler } from "./aporia-update" // APORIA
import { createEarlyWindow } from "./windows/early"
import { rendererAssetsServed } from "./windows/protocol"
import { registerRendererScheme } from "./windows/scheme"

// APORIA: keep the bundled server on its own DB copy so the stock OpenCode install is never migrated.
process.env.OPENCODE_DB ??= "opencode-aporia.db"
// APORIA: a staged self-update is applied before any window opens (the updater swaps, relaunches, health-checks).
let aporiaUpdating = false
process.env.OPENCODE_DISABLE_CHANNEL_DB ??= "1"

// This module stays small on purpose. Electron holds the ready event until the entry module has
// finished, and the first window should be on screen before the rest of the main process — a few
// hundred milliseconds of module evaluation and layers — loads. Configuration and the scheme must
// precede ready; the window is created the moment ready fires; everything else is imported after.
configureApplication()

if (acquireApplicationLock()) {
  // Only the primary instance may hand off to the updater (a second launch must never stop the running app).
  aporiaUpdating = applyStagedUpdateOnLaunch()
  registerRendererScheme()
  // Window first, then the bundle: starting the import before ready delays ready itself, because the
  // module graph evaluates on the same thread Chromium needs to finish initialising.
  void app.whenReady().then(async () => {
    marks.ready = Date.now()
    registerStorageSnapshotHandler()
    registerAporiaMcpHandler() // APORIA
    if (aporiaUpdating) return
    registerAporiaN8nHandler() // APORIA
    registerAporiaUpdateHandler() // APORIA
    registerAporiaEnvHandler() // APORIA
    registerAporiaVaultHandler() // APORIA
    registerAporiaAccountsHandler() // APORIA
    registerAporiaVotelHandler() // APORIA
    registerAporiaOwnerHandler() // APORIA
    try { registerAporiaBotsHandler() } catch (e) { console.error("aporia bots", e) } // APORIA
    try { registerAporiaRoutinesHandler() } catch (e) { console.error("aporia routines", e) } // APORIA
    createEarlyWindow()
    marks.window = Date.now()
    startSidecarProbe()

    // The window's renderer is already loading. Its HTML and preloaded chunks are served from this
    // thread, so the bundle waits for that burst to be answered (or a cap) before it evaluates.
    if (!process.env.ELECTRON_RENDERER_URL) await rendererAssetsServed({ quietMs: 40, capMs: 400 })
    marks.served = Date.now()

    return import("./desktop")
  })
}
