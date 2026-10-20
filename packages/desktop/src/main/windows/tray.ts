// APORIA: system tray. The app deliberately keeps running when its window is closed (so background
// bot-message delivery never stops); the tray is how you reopen it or quit for real.
import { app, Menu, nativeImage, Tray } from "electron"
import path from "node:path"
import { getLastFocusedWindow, setAppQuitting } from "./index"

let tray: Tray | undefined

function trayIcon() {
  const candidates = [
    path.join(app.getAppPath(), "resources", "icons", "icon.ico"),
    path.join(app.getAppPath(), "resources", "icons", "icon.png"),
    path.join(process.resourcesPath ?? "", "icons", "icon.ico"),
  ]
  for (const file of candidates) {
    try {
      const image = nativeImage.createFromPath(file)
      if (!image.isEmpty()) return image
    } catch {
      // try the next candidate
    }
  }
  return undefined
}

function showWindow() {
  const win = getLastFocusedWindow()
  if (win && !win.isDestroyed()) {
    win.show()
    win.focus()
  }
}

/** Create the tray once. Best-effort: a missing icon must never break startup. */
export function createAporiaTray() {
  if (tray) return tray
  try {
    const image = trayIcon()
    if (!image) return undefined
    tray = new Tray(image.resize({ width: 16, height: 16 }))
    tray.setToolTip("Aporetic")
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "Open Aporetic", click: showWindow },
        { type: "separator" },
        {
          label: "Quit Aporetic",
          click: () => {
            setAppQuitting()
            app.quit()
          },
        },
      ]),
    )
    tray.on("double-click", showWindow)
    return tray
  } catch {
    tray = undefined
    return undefined
  }
}
