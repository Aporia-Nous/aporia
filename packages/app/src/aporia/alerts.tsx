// APORIA: alerts. Bell in the top bar with unread badge, dismissable toasts (X, auto-hide 5s),
// and a panel listing alerts with per-item dismiss and Clear all. Persisted in localStorage.
import { createMemo, createSignal, For, onCleanup, Show } from "solid-js"

export type AlertAction = { label: string; action: string }
export type Alert = { id: string; title: string; detail?: string; level?: "info" | "success" | "warning" | "error"; at: number; read?: boolean; sticky?: boolean; actions?: AlertAction[] }
const handlers = new Map<string, () => void>()
const KEY = "aporia.alerts"
const load = (): Alert[] => {
  try { return JSON.parse(globalThis.localStorage?.getItem(KEY) ?? "[]") } catch { return [] }
}
const initial = load()
const [alerts, setAlertsRaw] = createSignal<Alert[]>(initial)
// Kept as a signal so the badge reads an O(1) value instead of filtering the list ~3x per render.
const [unread, setUnread] = createSignal(initial.filter((a) => !a.read).length)
// Toasts hold the Alert objects directly so rendering needs no id -> Alert lookup.
const [toasts, setToasts] = createSignal<Alert[]>([])
const setAlerts = (next: Alert[]) => {
  const kept = next.slice(-100)
  setAlertsRaw(kept)
  setUnread(kept.filter((a) => !a.read).length)
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(kept)) } catch {}
}
const hideToast = (id: string) => setToasts(toasts().filter((t) => t.id !== id))

export const aporiaAlerts = {
  list: alerts,
  unread,
  push(input: Omit<Alert, "id" | "at">) {
    const alert: Alert = { ...input, id: crypto.randomUUID(), at: Date.now() }
    setAlerts([...alerts(), alert])
    setToasts([...toasts(), alert])
    if (!alert.sticky) setTimeout(() => hideToast(alert.id), 5000)
    return alert.id
  },
  dismiss: (id: string) => { setAlerts(alerts().filter((a) => a.id !== id)); hideToast(id) },
  clear: () => { setAlerts([]); setToasts([]) },
  markRead: () => setAlerts(alerts().map((a) => ({ ...a, read: true }))),
  /** Register a handler for alert action buttons (actions are stored by name so they survive reloads). */
  on: (action: string, run: () => void) => { handlers.set(action, run) },
  act: (id: string, action: string) => { aporiaAlerts.dismiss(id); handlers.get(action)?.() },
}
;(globalThis as any).aporiaAlerts = aporiaAlerts

const color = (level?: Alert["level"]) =>
  level === "error" ? "#e5484d" : level === "warning" ? "#f5a524" : level === "success" ? "#30a46c" : "#5b8def"
const X = (p: { onClick: () => void; label: string }) => (
  <button type="button" aria-label={p.label} onClick={p.onClick} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", "font-size": "16px", "line-height": "1", padding: "2px 4px" }}>×</button>
)

import { Portal } from "solid-js/web"

export function AlertBell() {
  const [open, setOpen] = createSignal(false)
  // Newest-first list computed once per alert change, not per render.
  const list = createMemo(() => [...aporiaAlerts.list()].reverse())
  let root: HTMLDivElement | undefined
  const outside = (e: MouseEvent) => open() && root && !root.contains(e.target as Node) && setOpen(false)
  const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
  document.addEventListener("mousedown", outside)
  document.addEventListener("keydown", esc)
  onCleanup(() => { document.removeEventListener("mousedown", outside); document.removeEventListener("keydown", esc) })
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
        <Portal>
        <div role="dialog" aria-label="Alerts" style={{ position: "fixed", right: "16px", top: "48px", width: "340px", "max-height": "420px", overflow: "auto", background: "#0f1730", border: "1px solid #2a3550", "border-radius": "12px", "box-shadow": "0 10px 30px rgba(0,0,0,.4)", "z-index": 2147483600 }}>
          <div style={{ display: "flex", "justify-content": "space-between", padding: "10px 12px", "border-bottom": "1px solid var(--border-base, #2a3550)" }}>
            <strong>Alerts</strong>
            <button type="button" onClick={() => aporiaAlerts.clear()} disabled={!aporiaAlerts.list().length} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", opacity: 0.8 }}>Clear all</button>
          </div>
          <Show when={aporiaAlerts.list().length} fallback={<div style={{ padding: "16px", opacity: 0.7 }}>No alerts</div>}>
            <For each={list()}>{(a) => (
              <div style={{ display: "flex", gap: "8px", padding: "10px 12px", "border-left": `3px solid ${color(a.level)}`, "border-bottom": "1px solid var(--border-base, #2a3550)" }}>
                <div style={{ flex: 1, "min-width": 0 }}>
                  <div style={{ "font-weight": 600 }}>{a.title}</div>
                  <Show when={a.detail}><div style={{ opacity: 0.8, "font-size": "12px" }}>{a.detail}</div></Show>
                  <div style={{ opacity: 0.5, "font-size": "11px" }}>{new Date(a.at).toLocaleString()}</div>
                  <Show when={a.actions?.length}><div style={{ display: "flex", gap: "6px", "margin-top": "6px" }}><For each={a.actions}>{(x) => <button type="button" data-action={x.action} onClick={() => aporiaAlerts.act(a.id, x.action)} style={{ padding: "3px 8px", "border-radius": "6px", border: "1px solid var(--border-base, #2a3550)", background: "transparent", color: "inherit", cursor: "pointer", "font-size": "12px" }}>{x.label}</button>}</For></div></Show>
                </div>
                <X label="Dismiss alert" onClick={() => aporiaAlerts.dismiss(a.id)} />
              </div>
            )}</For>
          </Show>
        </div>
        </Portal>
      </Show>
    </div>
  )
}

export function AlertToasts() {
  const shown = toasts
  return (
    <div aria-live="polite" style={{ position: "fixed", left: "50%", "transform": "translateX(-50%)", top: "64px", "pointer-events": "none", display: "flex", "flex-direction": "column", "align-items": "center", gap: "8px", "z-index": 2147483600 }}>
      <For each={shown()}>{(a) => (
        <div role="status" style={{ "pointer-events": "auto", display: "flex", gap: "8px", "align-items": "flex-start", width: "320px", padding: "10px 12px", background: "var(--background-base, #0f1a2e)", border: "1px solid var(--border-base, #2a3550)", "border-left": `3px solid ${color(a.level)}`, "border-radius": "8px", "box-shadow": "0 8px 24px rgba(0,0,0,.3)" }}>
          <div style={{ flex: 1 }}><div style={{ "font-weight": 600 }}>{a.title}</div><Show when={a.detail}><div style={{ "font-size": "12px", opacity: 0.8 }}>{a.detail}</div></Show><Show when={a.actions?.length}><div style={{ display: "flex", gap: "6px", "margin-top": "6px" }}><For each={a.actions}>{(x) => <button type="button" data-action={x.action} onClick={() => aporiaAlerts.act(a.id, x.action)} style={{ padding: "3px 8px", "border-radius": "6px", border: "1px solid var(--border-base, #2a3550)", background: "transparent", color: "inherit", cursor: "pointer", "font-size": "12px" }}>{x.label}</button>}</For></div></Show></div>
          <X label="Dismiss notification" onClick={() => hideToast(a.id)} />
        </div>
      )}</For>
    </div>
  )
}
