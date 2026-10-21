// APORIA: Settings > Vault > Context. Shows the grounded context store and imports existing
// chats as topic-tagged, sourced entries. Import only ADDS — it never changes a chat.
// The real importer (which needs the server client) is registered by the sidebar, where the
// server context exists; this panel just calls it. Settings runs outside that scope.
import { createSignal, For, onMount, Show } from "solid-js"
import { aporiaAlerts } from "./alerts"
import { topicCounts } from "./context-stats"

type Entry = { id: string; topic: string; tags: string[]; text: string; source: { ref: string } }
type ImportResult = { added: number; skipped: number; entries: Entry[]; truncated?: number }
const bridge = () => (globalThis as any).electron?.aporia?.context as undefined | ((input: unknown) => Promise<any>)
const box = { padding: "6px 8px", "border-radius": "6px", border: "1px solid var(--border-base, #2a3550)", background: "transparent", color: "inherit" }

let importer: (() => Promise<ImportResult>) | undefined
/** Registered by the shell (which has the server client) so the panel can trigger a real import. */
export function setContextImporter(fn: () => Promise<ImportResult>) {
  importer = fn
}

export function SettingsContext() {
  const [entries, setEntries] = createSignal<Entry[]>([])
  const [busy, setBusy] = createSignal(false)
  const [query, setQuery] = createSignal("")
  const [error, setError] = createSignal("")

  const load = async () => {
    try {
      const result = await bridge()?.({ op: "all" })
      setEntries((result?.entries ?? []) as Entry[])
      setError("")
    } catch (e) {
      setError(String((e as Error)?.message ?? e))
    }
  }
  onMount(() => { void load() })

  const topics = () => topicCounts(entries()).filter((t) => !query() || t.topic.toLowerCase().includes(query().toLowerCase()))

  const runImport = async () => {
    if (!bridge()) {
      aporiaAlerts.push({ title: "Context store unavailable", detail: "Available in the Aporetic desktop app.", level: "error" })
      return
    }
    if (!importer) {
      aporiaAlerts.push({ title: "Import not ready", detail: "The app server is still starting. Try again in a moment.", level: "error" })
      return
    }
    setBusy(true)
    try {
      const r = await importer()
      setEntries(r?.entries ?? [])
      aporiaAlerts.push({
        title: "Chats imported",
        detail: `${r?.added ?? 0} entries added, ${r?.skipped ?? 0} skipped${r?.truncated ? `, ${r.truncated} long chats capped at 100 messages` : ""}.`,
        level: "success",
      })
    } catch (e) {
      aporiaAlerts.push({ title: "Import failed", detail: String((e as Error)?.message ?? e), level: "error" })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div data-component="aporia-context" style={{ display: "flex", "flex-direction": "column", gap: "12px" }}>
      <div style={{ display: "flex", "justify-content": "space-between", "align-items": "center" }}>
        <div>
          <h2 style={{ margin: 0 }}>Context</h2>
          <div style={{ opacity: 0.7, "font-size": "12px" }}>
            Shared memory: facts with their sources, so bots don't repeat each other or contradict what you've already settled.
          </div>
        </div>
        <button type="button" style={{ ...box, cursor: "pointer" }} data-action="aporia-context-import" disabled={busy()} onClick={runImport}>
          {busy() ? "Importing…" : "Import chats"}
        </button>
      </div>
      <Show when={!bridge()}>
        <div style={{ opacity: 0.7 }}>The context store is available in the Aporetic desktop app.</div>
      </Show>
      <Show when={error()}>
        <div style={{ color: "#e5484d" }}>Context store unavailable: {error()}</div>
      </Show>
      <div style={{ display: "flex", gap: "8px", "align-items": "center" }}>
        <input placeholder="Search topics" value={query()} onInput={(e) => setQuery(e.currentTarget.value)} style={{ ...box, flex: 1 }} />
        <span style={{ opacity: 0.7, "font-size": "12px" }}>{entries().length} entries</span>
      </div>
      <For each={topics()} fallback={<div style={{ opacity: 0.7 }}>No context yet. Import your chats to build it.</div>}>
        {(t) => (
          <div style={{ display: "flex", "justify-content": "space-between", padding: "8px 10px", border: "1px solid var(--border-base, #2a3550)", "border-radius": "8px" }}>
            <span>{t.topic}</span>
            <span style={{ opacity: 0.7 }}>{t.count}</span>
          </div>
        )}
      </For>
    </div>
  )
}
