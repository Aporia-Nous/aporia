// APORIA: Windows DPAPI (CurrentUser) protect/unprotect via a hidden PowerShell child.
// Secrets travel over stdin/stdout only (never argv, never logs). Non-Windows falls back to an
// AES-256-GCM key in ~/.config/aporia/vault.key (0600) so the vault still works on Linux/macOS.
import { execFile } from "node:child_process"
import crypto from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const SCRIPT = `
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.Encoding]::UTF8
Add-Type -AssemblyName System.Security
$ent=[Text.Encoding]::UTF8.GetBytes('aporia-vault-v1')
$req=[Console]::In.ReadToEnd() | ConvertFrom-Json
$out=@()
foreach($v in @($req.items)){
  if($req.mode -eq 'protect'){ $out += [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes([string]$v),$ent,'CurrentUser')) }
  else { $out += [Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String([string]$v),$ent,'CurrentUser')) }
}
ConvertTo-Json -InputObject @($out) -Compress
`
const ENCODED = Buffer.from(SCRIPT, "utf16le").toString("base64")

function powershell(mode: "protect" | "unprotect", items: string[]) {
  return new Promise<string[]>((resolve, reject) => {
    const child = execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", ENCODED],
      { windowsHide: true, maxBuffer: 64 * 1024 * 1024 },
      (error, stdout) => {
        if (error) return reject(new Error(`vault ${mode} failed`))
        try {
          const parsed = JSON.parse(String(stdout).trim() || "[]")
          resolve(Array.isArray(parsed) ? parsed.map(String) : [String(parsed)])
        } catch {
          reject(new Error(`vault ${mode} returned unreadable output`))
        }
      },
    )
    child.stdin?.end(JSON.stringify({ mode, items }))
  })
}

function fallbackKey() {
  const file = path.join(os.homedir(), ".config", "aporia", "vault.key")
  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, crypto.randomBytes(32), { mode: 0o600 })
  }
  return fs.readFileSync(file)
}

export async function protect(items: string[]) {
  if (items.length === 0) return []
  if (process.platform === "win32") return powershell("protect", items)
  const key = fallbackKey()
  return items.map((item) => {
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv)
    const data = Buffer.concat([cipher.update(item, "utf8"), cipher.final()])
    return "gcm:" + Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64")
  })
}

export async function unprotect(items: string[]) {
  if (items.length === 0) return []
  if (process.platform === "win32") return powershell("unprotect", items)
  const key = fallbackKey()
  return items.map((item) => {
    const raw = Buffer.from(item.replace(/^gcm:/, ""), "base64")
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12))
    decipher.setAuthTag(raw.subarray(12, 28))
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8")
  })
}
