// APORIA: Settings > Context. The grounded context store: existing chats imported as
// topic-tagged, source-linked entries. Import only ADDS entries — it never changes a chat.
import { createSignal, For, onMount, Show } from "solid-js"
import { useServerSDK } from "@/runtime/server/client"
import { aporiaAlerts } from "./alerts"
import { topicCounts } from "./context-stats"

type Entry = { id: string; topic: string; tags: string[]; text: string; source: { ref: string } }
const bridge = () => (globalThis as any).electron?.aporia?.context as undefined | ((input: unknown) => Promise<any>)
const box = { padding: "6px 8px", "border-radius": "6px", border: "1px solid var(--border-base, #2a3550)", background: "transparent", color: "inherit" }

export function SettingsContext() {
  // Defensive: useServerSDK() throws outside the server scope and would crash settings (see vault.tsx).
  let sdk: any
  try {
    sdk = useServerSDK()
  } catch {
    sdk = undefined
  }
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
      // A missing handler (e.g. APORIA_HOME unset) must be visible, not a silent empty list.
      setError(String((e as Error)?.message ?? e))
    }
  }
  onMount(() => { void load() })

  const topics = () =>
    topicCounts(entries()).filter((t) => !query() || t.topic.toLowerCase().includes(query().toLowerCase()))

  const textOf = (m: any) => (m?.content ?? []).filter((c: any) => c?.type === "text").map((c: any) => c.text).join("\n").trim()

  const importChats = async () => {
    if (!bridge()) return
    if (!sdk?.api?.session?.list) {
      aporiaAlerts.push({ title: "Context needs the app server", detail: "The server connection isn't ready yet. Try again in a moment.", level: "error" })
      return
    }
    setBusy(true)
    try {
      const sessions = (((await (sdk.api as any).session.list({ limit: 2000 }))?.data) ?? []) as any[]
      const payload: unknown[] = []
      let truncated = 0
      for (const s of sessions) {
        const msgs = (((await (sdk.api as any).message.list({ sessionID: s.id, limit: 100, order: "asc" }))?.data) ?? []) as any[]
        if (msgs.length >= 100) truncated++
        payload.push({
          id: s.id,
          title: s.title ?? "",
          messages: msgs.map((m) => ({ id: m.id, role: m.type === "assistant" ? "assistant" : "user", text: textOf(m) })),
        })
      }
      const r = await bridge()!({ op: "import", sessions: payload })
      setEntries((r?.entries ?? []) as Entry[])
      aporiaAlerts.push({
        title: "Chats imported",
        detail: `${r?.added ?? 0} entries added, ${r?.skipped ?? 0} skipped${truncated ? `, ${truncated} long chats capped at 100 messages` : ""}.`,
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
            One grounded store of facts, each linked to its source. Bots answer only from these.
          </div>
        </div>
        <button type="button" style={{ ...box, cursor: "pointer" }} disabled={busy()} onClick={importChats}>
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
