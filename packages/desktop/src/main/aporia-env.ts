// APORIA: save a key the user typed in Connect apps as a Windows USER env var (never in opencode.json),
// and check whether a local MCP command exists. Values are never logged or returned.
import { execFile } from "node:child_process"
import { ipcMain } from "electron"

const NAME = /^[A-Za-z_][A-Za-z0-9_]{0,99}$/
const CMD = /^[A-Za-z0-9._-]{1,64}$/

const run = (file: string, args: string[]) =>
  new Promise<{ ok: boolean; out: string }>((resolve) =>
    execFile(file, args, { windowsHide: true }, (error, stdout) => resolve({ ok: !error, out: String(stdout) })),
  )

export function registerAporiaEnvHandler() {
  ipcMain.handle("aporia:set-env", async (_event, input: { name?: unknown; value?: unknown }) => {
    if (typeof input?.name !== "string" || !NAME.test(input.name)) throw new Error("Invalid variable name")
    if (typeof input.value !== "string" || !input.value || input.value.length > 4096) throw new Error("Empty or too-long value")
    process.env[input.name] = input.value
    if (process.platform !== "win32") return { saved: "process" }
    const result = await run("reg", ["add", "HKCU\\Environment", "/v", input.name, "/t", "REG_SZ", "/d", input.value, "/f"])
    if (!result.ok) throw new Error("Could not save the Windows user variable")
    return { saved: "user" }
  })
  ipcMain.handle("aporia:which", async (_event, input: { command?: unknown }) => {
    if (typeof input?.command !== "string" || !CMD.test(input.command)) throw new Error("Invalid command")
    const result = await run(process.platform === "win32" ? "where" : "which", [input.command])
    return { found: result.ok, path: result.out.split(/\r?\n/)[0]?.trim() || undefined }
  })
}
