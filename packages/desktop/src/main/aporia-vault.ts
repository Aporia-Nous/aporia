// APORIA: Vault IPC. The renderer only ever sees metadata; a value leaves the main process only on an
// explicit Reveal, or goes straight to the clipboard on Copy (auto-cleared after 30s). Nothing is logged.
import { clipboard, ipcMain } from "electron"
import { CATEGORIES, deleteEntry, readVault, revealEntry, upsertEntry, type VaultEntry } from "./aporia-vault-store"

const meta = ({ value: _value, ...rest }: VaultEntry) => rest

export function registerAporiaVaultHandler() {
  ipcMain.handle("aporia:vault", async (_event, input: { action?: string; id?: string; entry?: any }) => {
    switch (input?.action) {
      case "list":
        return { categories: CATEGORIES, entries: readVault().entries.map(meta) }
      case "reveal":
        return { value: await revealEntry(String(input.id)) }
      case "copy": {
        const value = await revealEntry(String(input.id))
        clipboard.writeText(value)
        setTimeout(async () => {
          if ((await clipboard.readText()) === value) clipboard.clear()
        }, 30_000)
        return { copied: true }
      }
      case "save": {
        const e = input.entry ?? {}
        const id = await upsertEntry({
          id: e.id || undefined,
          name: String(e.name ?? "").trim(),
          category: e.category,
          kind: e.kind ?? "secret",
          username: e.username || undefined,
          url: e.url || undefined,
          notes: e.notes || undefined,
          source: e.source || "manual",
          plain: typeof e.value === "string" && e.value.length ? e.value : undefined,
        })
        return { id }
      }
      case "delete":
        deleteEntry(String(input.id))
        return { deleted: true }
      default:
        throw new Error("Unknown vault action")
    }
  })
}
