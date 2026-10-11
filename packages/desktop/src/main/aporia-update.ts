// APORIA: local self-update. The heavy lifting (background build, staging, swap, health check, rollback)
// lives in scripts/aporia-update.ps1 so it can run while this app is closed. This module only:
//  - applies a staged build on launch (before any window) by handing off to the script and exiting,
//  - exposes status / build / restart-now / prefs to the renderer,
//  - records how many agent runs are busy so "apply when idle" never restarts mid-task.
import { app, ipcMain } from "electron"
import { spawn } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

const ROOT = path.join(process.env.LOCALAPPDATA ?? path.join(app.getPath("home"), "AppData", "Local"), "Aporia", "updates")
const STATE = path.join(ROOT, "state.json")
const SOURCE = process.env.APORIA_SOURCE ?? "C:\\Tools\\aporia"

const readState = (): any => {
  try { return JSON.parse(fs.readFileSync(STATE, "utf8").replace(/^\uFEFF/, "")) } catch { return {} }
}
const writeState = (s: any) => {
  fs.mkdirSync(ROOT, { recursive: true })
  fs.writeFileSync(STATE + ".tmp", JSON.stringify(s, null, 2))
  fs.renameSync(STATE + ".tmp", STATE)
}
const script = () => {
  const staged = path.join(ROOT, "aporia-update.ps1")
  const source = path.join(SOURCE, "scripts", "aporia-update.ps1")
  return fs.existsSync(source) ? source : staged
}
function run(args: string[]) {
  // Detached + hidden so it outlives this process (needed for the swap) and never flashes a console.
  const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", script(), ...args], {
    detached: true,
    windowsHide: true,
    stdio: "ignore",
  })
  child.unref()
}

/** Call at the very top of main: if a build is staged, hand off to the updater and quit before any window. */
export function applyStagedUpdateOnLaunch(): boolean {
  if (process.platform !== "win32" || process.env.APORIA_SKIP_UPDATE === "1") return false
  if (!fs.existsSync(path.join(ROOT, "staged", "Aporia.exe"))) return false
  run(["apply", "-WaitForExit", String(process.pid)])
  app.exit(0)
  return true
}

export function registerAporiaUpdateHandler() {
  ipcMain.handle("aporia:update", async (_event, input: { action?: string; busy?: number; applyWhenIdle?: boolean; ids?: string[] }) => {
    switch (input?.action) {
      case "status": {
        const s = readState()
        return { ...s, version: app.getVersion(), staged: s.staged ?? null, buildRunning: fs.existsSync(path.join(ROOT, "build.lock")) }
      }
      case "build":
        run(["build", "-Force"])
        return { started: true }
      case "restart":
        // Ali clicked "Restart now". The renderer already waited for in-flight runs; sessions/chats are in the DB.
        run(["apply", "-WaitForExit", String(process.pid)])
        setTimeout(() => app.quit(), 300)
        return { restarting: true }
      case "busy":
        fs.mkdirSync(ROOT, { recursive: true })
        fs.writeFileSync(path.join(ROOT, "busy.json"), JSON.stringify({ busy: Number(input.busy) || 0, at: new Date().toISOString() }))
        return { ok: true }
      case "prefs": {
        const s = readState()
        s.prefs = { ...(s.prefs ?? {}), applyWhenIdle: !!input.applyWhenIdle }
        writeState(s)
        return s.prefs
      }
      case "seen": {
        const s = readState()
        if (s.lastResult) s.lastResult.seen = true
        writeState(s)
        return { ok: true }
      }
      default:
        throw new Error("Unknown update action")
    }
  })
}
