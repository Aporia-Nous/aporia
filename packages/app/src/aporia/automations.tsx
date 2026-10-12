// APORIA: Automations tab. Talks to local n8n through the desktop bridge (key stays in the main process).
import { createResource, createSignal, For, Show } from "solid-js"
import { EmptyState, Icon, Skeleton } from "./icons"

type Workflow = { id: string; name: string; active: boolean; lastRun?: { startedAt: string; status?: string } }
type Bridge = { aporia?: { n8n?: (input: unknown) => Promise<unknown> } }

const n8n = (input: unknown) => {
  const fn = (globalThis as { electron?: Bridge }).electron?.aporia?.n8n
  return fn ? fn(input) : Promise.reject(new Error("Automations need the Aporetic desktop app"))
}

export function AutomationsTab() {
  const [status] = createResource(() => n8n({ op: "status" }) as Promise<{ configured: boolean; base: string }>)
  const [list, { refetch }] = createResource(
    () => status()?.configured,
    () => n8n({ op: "list" }) as Promise<Workflow[]>,
  )
  const [error, setError] = createSignal("")

  const toggle = async (wf: Workflow) => {
    if (!globalThis.confirm(`${wf.active ? "Deactivate" : "Activate"} "${wf.name}" in n8n?`)) return
    setError("")
    try {
      await n8n({ op: "setActive", id: wf.id, active: !wf.active })
      await refetch()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div class="ap-automations">
      <Show when={status.error}>
        <EmptyState icon="sparkles" title="Automations unavailable" hint={String(status.error?.message ?? status.error)} />
      </Show>
      <Show when={status() && !status()!.configured}>
        <div class="ap-card">
          <strong>Connect n8n</strong>
          <span class="ap-muted ap-small">
            1. Open {status()!.base}/setup and create the owner account. 2. In n8n go to Settings, n8n API, Create an API
            key. 3. Save it as the Windows user environment variable N8N_API_KEY, then restart Aporia.
          </span>
        </div>
      </Show>
      <Show when={status()?.configured}>
        <Show when={error()}>
          <div class="ap-card ap-card-err" role="alert">
            {error()}
          </div>
        </Show>
        <Show when={!list.loading || list()} fallback={<Skeleton rows={3} />}>
          <Show when={!list.error} fallback={<div class="ap-card ap-card-err">{String(list.error?.message ?? list.error)}</div>}>
            <ul class="ap-files">
              <For each={list() ?? []} fallback={<EmptyState icon="sparkles" title="No workflows yet" />}>
                {(wf) => (
                  <li>
                    <span class="ap-status-dot" classList={{ "ap-busy": wf.active }} />
                    <span class="ap-app-text">
                      <strong class="ap-ellipsis">{wf.name}</strong>
                      <span class="ap-muted ap-small">
                        {wf.lastRun ? `Last run ${new Date(wf.lastRun.startedAt).toLocaleString()}` : "Never run"}
                      </span>
                    </span>
                    <button type="button" class="ap-btn ap-btn-ghost" onClick={() => toggle(wf)}>
                      <Icon name={wf.active ? "x" : "check"} size={12} />
                      {wf.active ? "Pause" : "Activate"}
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </Show>
      </Show>
    </div>
  )
}
