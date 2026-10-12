// APORIA: self-update UI. Settings > Updates ("Update Aporetic", apply-when-idle toggle) and a watcher that
// raises the "Update ready, restart to apply" bell alert, waits for in-flight agent runs before a restart,
// and reports the result (or an automatic rollback) after the swap. Builds/swaps run in scripts/aporia-update.ps1.
import { createResource, createSignal, onCleanup, onMount, Show } from "solid-js"
import { useData } from "@/runtime/server/current"
import { aporiaAlerts } from "./alerts"

const bridge = () => (globalThis as any).electron?.aporia?.update as undefined | ((i: unknown) => Promise<any>)
const call = (input: unknown) => bridge()?.(input).catch(() => undefined)
const btn = { padding: "6px 10px", "border-radius": "6px", border: "1px solid var(--border-base, #2a3550)", background: "transparent", color: "inherit", cursor: "pointer" }
const short = (c?: string) => (c ? c.slice(0, 10) : "unknown")

// Busy = sessions running or with queued (non-synthetic) work, same rule as the session tab spinner.
const [busy, setBusy] = createSignal(0)
const [waiting, setWaiting] = createSignal(false)

/** Restart only after in-flight runs finish (max 10 min); their messages are already saved in the DB. */
export async function restartForUpdate() {
  if (waiting()) return
  setWaiting(true)
  const started = Date.now()
  if (busy() > 0) aporiaAlerts.push({ title: "Restarting after current work", detail: `Waiting for ${busy()} agent run(s) to finish before applying the update.`, level: "info" })
  while (busy() > 0 && Date.now() - started < 10 * 60_000) await new Promise((r) => setTimeout(r, 2000))
  await call({ action: "restart" })
}
aporiaAlerts.on("update:restart", () => void restartForUpdate())
aporiaAlerts.on("update:later", () => aporiaAlerts.push({ title: "Update postponed", detail: "It installs automatically the next time Aporetic starts.", level: "info" }))

/** Mounted once in the Aporetic layout. */
export function UpdateWatcher() {
  let data: any
  try { data = useData() } catch { data = undefined }
  const countBusy = () => {
    try {
      const list = data?.session?.list?.() ?? []
      return list.filter((s: any) => data.session.status(s.id) === "running" || (data.session.pending?.list?.(s.id) ?? []).some((i: any) => i.type !== "synthetic")).length
    } catch { return 0 }
  }
  const tick = async () => {
    const n = countBusy(); setBusy(n)
    // Heartbeat, not a change notification: scripts/aporia-update.ps1 treats busy.json as stale after
    // 3 minutes, so this must be sent every tick (or "apply when idle" could restart mid-task). It is
    // also sent while hidden, since routines run with the window minimized.
    await call({ action: "busy", busy: n })
    // The status round-trip only drives drop-stale/notify alerts; skip that UI work while hidden.
    if (document.hidden) return
    const s = await call({ action: "status" }); if (!s) return
    // Drop stale update alerts: "Update ready" for a build that is no longer staged, and rollback/failure
    // notices that were already seen once a newer build is installed.
    for (const a of aporiaAlerts.list()) {
      const t = String(a.title ?? "")
      if (t.startsWith("Update ready") && !(s.staged?.commit && String(a.detail ?? "").includes(short(s.staged.commit)))) aporiaAlerts.dismiss(a.id)
      if (/rolled back/i.test(t) && s.lastResult?.seen && Date.now() - Number(a.at ?? 0) > 30 * 60_000) aporiaAlerts.dismiss(a.id)
    }
    const key = "aporia.update.notified"
    if (s.staged?.commit && localStorage.getItem(key) !== s.staged.commit) {
      localStorage.setItem(key, s.staged.commit)
      aporiaAlerts.push({ title: "Update ready, restart to apply", detail: `${s.staged.subject ?? "New build"} (${short(s.staged.commit)}). Your sessions and chats are kept.`, level: "info", sticky: true,
        actions: [{ label: "Restart now", action: "update:restart" }, { label: "Later", action: "update:later" }] })
    }
    if (s.staged?.commit && s.prefs?.applyWhenIdle && n === 0 && !waiting()) void restartForUpdate()
    if (s.lastResult && !s.lastResult.seen) {
      await call({ action: "seen" })
      if (s.lastResult.rolledBack) aporiaAlerts.push({ title: s.lastResult.manual ? "Rolled back to the previous build" : "Update failed its health check, rolled back", detail: `Build ${short(s.lastResult.commit)} didn't come up within 30s, so the previous build was restored. Nothing was lost. Log: %LOCALAPPDATA%\\Aporia\\updates\\update.log`, level: "error", sticky: true })
      else if (s.lastResult.ok) aporiaAlerts.push({ title: "Aporetic updated", detail: `Now on ${short(s.lastResult.commit)}; started in ${s.lastResult.loadSeconds}s.`, level: "success" })
    }
  }
  // 30s: staged-update detection does not need 15s granularity, and each tick does real IPC.
  onMount(() => { void tick(); const t = setInterval(() => void tick(), 30_000); onCleanup(() => clearInterval(t)) })
  return null
}

/** Settings > Updates */
export function SettingsUpdate() {
  const [s, { refetch }] = createResource(async () => (await call({ action: "status" })) ?? {})
  const t = setInterval(() => { if (!document.hidden) void refetch() }, 5000); onCleanup(() => clearInterval(t))
  return (
    <div style={{ display: "flex", "flex-direction": "column", gap: "14px", padding: "8px 2px" }} data-component="aporia-settings-update">
      <h2 style={{ margin: 0 }}>Updates</h2>
      <div style={{ opacity: 0.8 }}>Aporetic updates from its local source (C:\Tools\aporia). Builds run in the background at low priority; the previous build is kept for rollback.</div>
      <div>Installed: <code>{short(s()?.installed?.commit)}</code> · App version {s()?.version}</div>
      <Show when={s()?.staged} fallback={<div>No update staged.</div>}>
        <div>Staged: <code>{short(s()?.staged?.commit)}</code> {s()?.staged?.subject}</div>
      </Show>
      <div style={{ display: "flex", gap: "8px", "flex-wrap": "wrap" }}>
        <button type="button" style={btn} data-action="aporia-update-build" disabled={s()?.buildRunning}
          onClick={async () => { await call({ action: "build" }); aporiaAlerts.push({ title: "Building update", detail: "Runs in the background; you'll get an alert when it's ready.", level: "info" }); void refetch() }}>
          {s()?.buildRunning ? "Building…" : "Update Aporetic"}
        </button>
        <Show when={s()?.staged}>
          <button type="button" style={btn} data-action="aporia-update-restart" onClick={() => void restartForUpdate()}>{waiting() ? `Waiting for ${busy()} run(s)…` : "Restart now"}</button>
        </Show>
      </div>
      <label style={{ display: "flex", gap: "8px", "align-items": "center" }}>
        <input type="checkbox" checked={!!s()?.prefs?.applyWhenIdle} onChange={async (e) => { await call({ action: "prefs", applyWhenIdle: e.currentTarget.checked }); void refetch() }} />
        Apply updates automatically when idle (no agent runs busy)
      </label>
      <Show when={s()?.lastResult}>
        <div style={{ opacity: 0.8, "font-size": "12px" }}>Last update: {s()?.lastResult?.ok ? `OK (${s()?.lastResult?.loadSeconds}s)` : s()?.lastResult?.rolledBack ? "rolled back" : "failed"} · {s()?.lastResult?.at}</div>
      </Show>
      <div style={{ opacity: 0.6, "font-size": "12px" }}>Agents: run <code>C:\Tools\aporia\scripts\aporia-update.cmd build</code> after committing. It only stages; Aporia never restarts mid-task without your click.</div>
    </div>
  )
}
