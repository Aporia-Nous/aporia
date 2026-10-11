// APORIA: Settings > Vault. Encrypted local vault (DPAPI). Values are masked; Reveal/Copy go through the
// desktop main process. Reference an entry from any config as {vault:NAME}.
import { createMemo, createResource, createSignal, For, Show } from "solid-js"
import { useServerSDK } from "@/runtime/server/client"
import { aporiaAlerts } from "./alerts"
import { ConnectorAccounts } from "./accounts"

type Meta = { id: string; name: string; category: string; kind: string; username?: string; url?: string; notes?: string; source?: string; updated: string }
const bridge = () => (globalThis as any).electron?.aporia?.vault as undefined | ((i: unknown) => Promise<any>)
const box = { padding: "6px 8px", "border-radius": "6px", border: "1px solid var(--border-base, #2a3550)", background: "transparent", color: "inherit" }
const btn = { ...box, cursor: "pointer" }

function useReload() {
  let sdk: any
  try { sdk = useServerSDK() } catch { sdk = undefined }
  return async () => {
    try {
      await sdk?.api?.location?.reload?.({})
      aporiaAlerts.push({ title: "Connections reloaded", detail: "MCPs, plugins, env vars and vault refs re-read. Open sessions kept.", level: "success" })
    } catch {
      aporiaAlerts.push({ title: "Reload failed", detail: "The background server did not answer. It also reloads on its own within 30s.", level: "error" })
    }
  }
}

export function ReloadConnectionsButton() {
  const reload = useReload()
  return <button type="button" style={btn} data-action="aporia-reload-connections" onClick={reload}>Reload connections</button>
}

export function SettingsVault() {
  const [data, { refetch }] = createResource(async () => (await bridge()?.({ action: "list" })) ?? { categories: ["Aporia Nous", "Perseus", "Personal"], entries: [] })
  const [query, setQuery] = createSignal("")
  const [cat, setCat] = createSignal("All")
  const [revealed, setRevealed] = createSignal<Record<string, string>>({})
  const [editing, setEditing] = createSignal<Partial<Meta & { value: string }>>()
  const [error, setError] = createSignal("")
  const list = createMemo(() => ((data()?.entries ?? []) as Meta[])
    .filter((e) => cat() === "All" || e.category === cat())
    .filter((e) => !query() || `${e.name} ${e.username ?? ""} ${e.url ?? ""} ${e.notes ?? ""}`.toLowerCase().includes(query().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name)))
  const call = async (input: unknown) => { setError(""); try { return await bridge()!(input) } catch (e) { setError(String((e as Error).message ?? e)) } }
  const reveal = async (id: string) => {
    if (revealed()[id]) { const { [id]: _, ...rest } = revealed(); return setRevealed(rest) }
    const r = await call({ action: "reveal", id }); if (r) setRevealed({ ...revealed(), [id]: r.value })
  }
  const save = async () => {
    const r = await call({ action: "save", entry: editing() })
    if (r) { setEditing(undefined); refetch(); aporiaAlerts.push({ title: "Vault entry saved", level: "success" }) }
  }
  return (
    <div data-component="aporia-vault" style={{ display: "flex", "flex-direction": "column", gap: "12px" }}>
      <div style={{ display: "flex", "justify-content": "space-between", "align-items": "center" }}>
        <div><h2 style={{ margin: 0 }}>Vault</h2><div style={{ opacity: 0.7, "font-size": "12px" }}>Encrypted on this PC with Windows DPAPI. Use <code>{"{vault:NAME}"}</code> in configs; it is resolved in memory, never written in plain text.</div></div>
        <div style={{ display: "flex", gap: "8px" }}><ReloadConnectionsButton /><button type="button" style={btn} onClick={() => setEditing({ category: cat() === "All" ? "Aporia Nous" : cat(), kind: "api-key" })}>Add</button></div>
      </div>
      <Show when={!bridge()}><div style={{ opacity: 0.7 }}>The vault is available in the Aporia desktop app.</div></Show>
      <div style={{ display: "flex", gap: "8px" }}>
        <input placeholder="Search vault" value={query()} onInput={(e) => setQuery(e.currentTarget.value)} style={{ ...box, flex: 1 }} />
        <For each={["All", ...((data()?.categories ?? []) as string[])]}>{(c) => (
          <button type="button" style={{ ...btn, background: cat() === c ? "var(--surface-raised-base, #1d2a44)" : "transparent" }} onClick={() => setCat(c)}>
            {c} ({c === "All" ? data()?.entries.length ?? 0 : (data()?.entries ?? []).filter((e: Meta) => e.category === c).length})
          </button>
        )}</For>
      </div>
      <Show when={error()}><div style={{ color: "#e5484d" }}>{error()}</div></Show>
      <Show when={editing()}>{(e) => (
        <div style={{ display: "grid", "grid-template-columns": "120px 1fr", gap: "8px", padding: "12px", border: "1px solid var(--border-base, #2a3550)", "border-radius": "8px" }}>
          <label>Name</label><input style={box} value={e().name ?? ""} onInput={(v) => setEditing({ ...e(), name: v.currentTarget.value })} />
          <label>Category</label><select style={box} value={e().category} onChange={(v) => setEditing({ ...e(), category: v.currentTarget.value })}><For each={data()?.categories ?? []}>{(c: string) => <option value={c}>{c}</option>}</For></select>
          <label>Type</label><select style={box} value={e().kind} onChange={(v) => setEditing({ ...e(), kind: v.currentTarget.value })}><For each={["api-key", "password", "token", "private-key", "secret"]}>{(k) => <option value={k}>{k}</option>}</For></select>
          <label>Username</label><input style={box} value={e().username ?? ""} onInput={(v) => setEditing({ ...e(), username: v.currentTarget.value })} />
          <label>URL</label><input style={box} value={e().url ?? ""} onInput={(v) => setEditing({ ...e(), url: v.currentTarget.value })} />
          <label>Value</label><input style={box} type="password" autocomplete="off" placeholder={e().id ? "Leave blank to keep current value" : ""} onInput={(v) => setEditing({ ...e(), value: v.currentTarget.value })} />
          <label>Notes</label><input style={box} value={e().notes ?? ""} onInput={(v) => setEditing({ ...e(), notes: v.currentTarget.value })} />
          <span /><div style={{ display: "flex", gap: "8px" }}><button type="button" style={btn} onClick={save}>Save</button><button type="button" style={btn} onClick={() => setEditing(undefined)}>Cancel</button></div>
        </div>
      )}</Show>
      <For each={list()} fallback={<div style={{ opacity: 0.7 }}>No entries</div>}>{(e) => (
        <div style={{ display: "flex", gap: "10px", "align-items": "center", padding: "8px 10px", border: "1px solid var(--border-base, #2a3550)", "border-radius": "8px" }}>
          <div style={{ flex: 1, "min-width": 0 }}>
            <div style={{ "font-weight": 600 }}>{e.name} <span style={{ opacity: 0.6, "font-weight": 400, "font-size": "11px" }}>{e.category} · {e.kind}</span></div>
            <code style={{ opacity: 0.85, "font-size": "12px", "word-break": "break-all" }}>{revealed()[e.id] ?? "••••••••••••"}</code>
          </div>
          <button type="button" style={btn} onClick={() => reveal(e.id)}>{revealed()[e.id] ? "Hide" : "Reveal"}</button>
          <button type="button" style={btn} onClick={async () => (await call({ action: "copy", id: e.id })) && aporiaAlerts.push({ title: `Copied ${e.name}`, detail: "Clipboard clears in 30 seconds." })}>Copy</button>
          <button type="button" style={btn} onClick={() => setEditing({ ...e })}>Edit</button>
          <button type="button" style={btn} onClick={async () => { if (confirm(`Delete ${e.name}?`)) { await call({ action: "delete", id: e.id }); refetch() } }}>Delete</button>
        </div>
      )}</For>
      <ConnectorAccounts />
    </div>
  )
}
