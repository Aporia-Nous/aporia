// APORIA: alerts. Bell in the top bar with unread badge, dismissable toasts (X, auto-hide 5s),
// and a panel listing alerts with per-item dismiss and Clear all. Persisted in localStorage.
import { createSignal, For, onCleanup, Show } from "solid-js"

export type Alert = { id: string; title: string; detail?: string; level?: "info" | "success" | "warning" | "error"; at: number; read?: boolean }
const KEY = "aporia.alerts"
const load = (): Alert[] => {
  try { return JSON.parse(globalThis.localStorage?.getItem(KEY) ?? "[]") } catch { return [] }
}
const [alerts, setAlertsRaw] = createSignal<Alert[]>(load())
const [toasts, setToasts] = createSignal<string[]>([])
const setAlerts = (next: Alert[]) => {
  setAlertsRaw(next.slice(-100))
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(next.slice(-100))) } catch {}
}
const hideToast = (id: string) => setToasts(toasts().filter((t) => t !== id))

export const aporiaAlerts = {
  list: alerts,
  unread: () => alerts().filter((a) => !a.read).length,
  push(input: Omit<Alert, "id" | "at">) {
    const alert: Alert = { ...input, id: crypto.randomUUID(), at: Date.now() }
    setAlerts([...alerts(), alert])
    setToasts([...toasts(), alert.id])
    setTimeout(() => hideToast(alert.id), 5000)
    return alert.id
  },
  dismiss: (id: string) => { setAlerts(alerts().filter((a) => a.id !== id)); hideToast(id) },
  clear: () => { setAlerts([]); setToasts([]) },
  markRead: () => setAlerts(alerts().map((a) => ({ ...a, read: true }))),
}
;(globalThis as any).aporiaAlerts = aporiaAlerts

const color = (level?: Alert["level"]) =>
  level === "error" ? "#e5484d" : level === "warning" ? "#f5a524" : level === "success" ? "#30a46c" : "#5b8def"
const X = (p: { onClick: () => void; label: string }) => (
  <button type="button" aria-label={p.label} onClick={p.onClick} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", "font-size": "16px", "line-height": "1", padding: "2px 4px" }}>×</button>
)

export function AlertBell() {
  const [open, setOpen] = createSignal(false)
  let root: HTMLDivElement | undefined
  const outside = (e: MouseEvent) => open() && root && !root.contains(e.target as Node) && setOpen(false)
  document.addEventListener("mousedown", outside)
  onCleanup(() => document.removeEventListener("mousedown", outside))
  return (
    <div ref={root} style={{ position: "relative" }} data-component="aporia-alert-bell">
      <button type="button" aria-label={`Alerts (${aporiaAlerts.unread()} unread)`} title="Alerts"
        onClick={() => { setOpen(!open()); if (!open()) return; aporiaAlerts.markRead() }}
        style={{ position: "relative", background: "none", border: "none", cursor: "pointer", color: "inherit", padding: "4px" }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
        <Show when={aporiaAlerts.unread() > 0}>
          <span style={{ position: "absolute", top: "-2px", right: "-4px", background: "#e5484d", color: "#fff", "border-radius": "9px", "font-size": "10px", "min-width": "16px", height: "16px", display: "flex", "align-items": "center", "justify-content": "center", padding: "0 4px" }}>
            {aporiaAlerts.unread() > 99 ? "99+" : aporiaAlerts.unread()}
          </span>
        </Show>
      </button>
      <Show when={open()}>
        <div role="dialog" aria-label="Alerts" style={{ position: "absolute", right: 0, top: "32px", width: "340px", "max-height": "420px", overflow: "auto", background: "var(--background-base, #0f1a2e)", border: "1px solid var(--border-base, #2a3550)", "border-radius": "10px", "box-shadow": "0 10px 30px rgba(0,0,0,.35)", "z-index": 1000 }}>
          <div style={{ display: "flex", "justify-content": "space-between", padding: "10px 12px", "border-bottom": "1px solid var(--border-base, #2a3550)" }}>
            <strong>Alerts</strong>
            <button type="button" onClick={() => aporiaAlerts.clear()} disabled={!aporiaAlerts.list().length} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", opacity: 0.8 }}>Clear all</button>
          </div>
          <Show when={aporiaAlerts.list().length} fallback={<div style={{ padding: "16px", opacity: 0.7 }}>No alerts</div>}>
            <For each={[...aporiaAlerts.list()].reverse()}>{(a) => (
              <div style={{ display: "flex", gap: "8px", padding: "10px 12px", "border-left": `3px solid ${color(a.level)}`, "border-bottom": "1px solid var(--border-base, #2a3550)" }}>
                <div style={{ flex: 1, "min-width": 0 }}>
                  <div style={{ "font-weight": 600 }}>{a.title}</div>
                  <Show when={a.detail}><div style={{ opacity: 0.8, "font-size": "12px" }}>{a.detail}</div></Show>
                  <div style={{ opacity: 0.5, "font-size": "11px" }}>{new Date(a.at).toLocaleString()}</div>
                </div>
                <X label="Dismiss alert" onClick={() => aporiaAlerts.dismiss(a.id)} />
              </div>
            )}</For>
          </Show>
        </div>
      </Show>
    </div>
  )
}

export function AlertToasts() {
  const shown = () => toasts().map((id) => alerts().find((a) => a.id === id)).filter(Boolean) as Alert[]
  return (
    <div aria-live="polite" style={{ position: "fixed", right: "16px", bottom: "16px", display: "flex", "flex-direction": "column", gap: "8px", "z-index": 2000 }}>
      <For each={shown()}>{(a) => (
        <div role="status" style={{ display: "flex", gap: "8px", "align-items": "flex-start", width: "320px", padding: "10px 12px", background: "var(--background-base, #0f1a2e)", border: "1px solid var(--border-base, #2a3550)", "border-left": `3px solid ${color(a.level)}`, "border-radius": "8px", "box-shadow": "0 8px 24px rgba(0,0,0,.3)" }}>
          <div style={{ flex: 1 }}><div style={{ "font-weight": 600 }}>{a.title}</div><Show when={a.detail}><div style={{ "font-size": "12px", opacity: 0.8 }}>{a.detail}</div></Show></div>
          <X label="Dismiss notification" onClick={() => hideToast(a.id)} />
        </div>
      )}</For>
    </div>
  )
}
