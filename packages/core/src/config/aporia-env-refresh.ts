// APORIA: the background server is long-lived, so user/system env vars saved after it started (API keys
// from Connect apps, PATH entries from newly installed CLIs) were invisible until a restart. On Windows,
// re-read HKCU/HKLM Environment and merge into process.env before every config reload.
import { execFile } from "node:child_process"

const read = (key: string) =>
  new Promise<Record<string, string>>((resolve) =>
    execFile("reg", ["query", key], { windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (error, stdout) => {
      if (error) return resolve({})
      const out: Record<string, string> = {}
      for (const line of String(stdout).split(/\r?\n/)) {
        const match = /^\s{4}(\S[^\t]*?)\s{4}(REG_SZ|REG_EXPAND_SZ)\s{4}(.*)$/.exec(line)
        if (match) out[match[1]] = match[3]
      }
      resolve(out)
    }),
  )

const expand = (value: string) => value.replace(/%([^%]+)%/g, (all, name: string) => process.env[name] ?? all)

let fingerprint = ""

/** Returns true when anything changed. Never logs values. */
export async function refreshEnv() {
  if (process.platform !== "win32") return false
  const [machine, user] = await Promise.all([
    read("HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment"),
    read("HKCU\\Environment"),
  ])
  const next = JSON.stringify([machine, user])
  if (next === fingerprint) return false
  const first = fingerprint === ""
  fingerprint = next
  for (const [name, value] of Object.entries({ ...machine, ...user })) {
    if (/^path$/i.test(name)) continue
    process.env[name] = expand(value)
  }
  const pathKey = Object.keys(process.env).find((key) => /^path$/i.test(key)) ?? "Path"
  const merged = [machine.Path ?? machine.PATH, user.Path ?? user.PATH, process.env[pathKey]]
    .filter(Boolean)
    .flatMap((value) => expand(value!).split(";"))
    .filter(Boolean)
  process.env[pathKey] = [...new Set(merged)].join(";")
  return !first
}
