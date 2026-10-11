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
  // Output goes to updates\\spawn.log (an apply that dies before logging used to leave no trace), and the
  // Electron-inherited env is cleaned so Windows PowerShell 5 doesn't load PowerShell 7 modules or run as node.
  fs.mkdirSync(ROOT, { recursive: true })
  const env = { ...process.env }
  for (const k of ["PSModulePath", "ELECTRON_RUN_AS_NODE", "NODE_OPTIONS", "ELECTRON_NO_ATTACH_CONSOLE"]) delete env[k]
  const log = fs.openSync(path.join(ROOT, "spawn.log"), "a")
  fs.writeSync(log, `\n${new Date().toISOString()} spawn ${args.join(" ")} (from pid ${process.pid})\n`)
  const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", script(), ...args], {
    detached: true,
    windowsHide: true,
    stdio: ["ignore", log, log],
    env,
  })
  child.unref()
  return child.pid
}

// Guard so a broken hand-off can never stop Aporia from opening: the launch-time apply is attempted once per staged
// build; if that attempt didn't finish (staged still there, no live apply pid), the next launch opens normally.
const ATTEMPT = path.join(ROOT, "apply-attempt.json")
const alive = (pid?: number) => { if (!pid) return false; try { process.kill(pid, 0); return true } catch { return false } }

/** Call at the very top of main: if a build is staged, hand off to the updater and quit before any window. */
export function applyStagedUpdateOnLaunch(): boolean {
  if (process.platform !== "win32" || process.env.APORIA_SKIP_UPDATE === "1") return false
  if (!fs.existsSync(path.join(ROOT, "staged", "Aporia.exe"))) { fs.rmSync(ATTEMPT, { force: true }); return false }
  const staged = String(readState().staged?.commit ?? "")
  let attempt: any = {}
  try { attempt = JSON.parse(fs.readFileSync(ATTEMPT, "utf8")) } catch {}
  if (attempt.commit === staged) {
    // An apply for this build is still running: let it finish instead of starting a second one.
    if (alive(attempt.updaterPid) && Date.now() - Date.parse(attempt.at) < 3 * 60_000) { app.exit(0); return true }
    // It already failed once: open normally; the bell still offers "Restart now".
    return false
  }
  const updaterPid = run(["apply", "-WaitForExit", String(process.pid)])
  fs.writeFileSync(ATTEMPT, JSON.stringify({ commit: staged, at: new Date().toISOString(), updaterPid }))
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
        // -Restart -ByUser: Ali clicked, so apply even though this instance is still closing.
        fs.rmSync(ATTEMPT, { force: true })
        run(["apply", "-Restart", "-ByUser", "-WaitForExit", String(process.pid)])
        setTimeout(() => app.exit(0), 500)
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
