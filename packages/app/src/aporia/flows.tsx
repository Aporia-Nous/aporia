// APORIA: native Flows (flow engine stage 1). Lists the flows saved in the server's mission log,
// starts one, and shows its run history and step timeline. Flows run inside the server, with no
// model call, so every step shows 0 tokens. There is no visual editor yet: a flow is added by
// pasting its JSON definition. The n8n section below it is unchanged.
import { createSignal, For, onCleanup, Show } from "solid-js"
import { useServerSDK } from "@/runtime/server/client"
import { useCommand } from "@/shell/commands/command"
import { showToast } from "@/shell/notifications/toast"
import { EmptyState, Icon } from "./icons"
import {
  errorText,
  isOpen,
  parseDefinition,
  requestId,
  runLabel,
  slashInput,
  slashName,
  startedToast,
  stepLine,
  type FlowRunDetail,
  type FlowRunSummary,
  type FlowSummary,
} from "./flows-util"

const POLL_MS = 2000

const useSdk = () => {
  try {
    return useServerSDK() as any
  } catch {
    return undefined
  }
}

export function FlowsSection() {
  const sdk = useSdk()
  const [flows, setFlows] = createSignal<FlowSummary[]>([])
  const [loaded, setLoaded] = createSignal(false)
  const [error, setError] = createSignal("")
  const [selected, setSelected] = createSignal<string>()
  const [runs, setRuns] = createSignal<FlowRunSummary[]>([])
  const [detail, setDetail] = createSignal<FlowRunDetail>()
  const [busy, setBusy] = createSignal<string>()
  const [adding, setAdding] = createSignal(false)
  const [draft, setDraft] = createSignal("")
  const [draftError, setDraftError] = createSignal("")

  const api = () => sdk?.api?.flow

  const refresh = async () => {
    if (!api()) return
    try {
      const listed = await api().list()
      setFlows([...(listed?.data ?? [])])
      setError("")
      const id = selected()
      if (id) {
        const history = await api().run.list({ flowID: id, limit: "10" })
        setRuns([...(history?.data ?? [])])
      }
      const open = detail()
      if (open && isOpen(open.status)) {
        const next = await api().run.get({ runID: open.runId })
        if (next?.data) setDetail(next.data)
      }
    } catch (e) {
      setError(errorText(e))
    } finally {
      setLoaded(true)
    }
  }
  void refresh()
  const timer = setInterval(() => void refresh(), POLL_MS)
  onCleanup(() => clearInterval(timer))

  const select = async (id: string) => {
    setSelected(selected() === id ? undefined : id)
    setDetail(undefined)
    setRuns([])
    await refresh()
  }

  const showRun = async (runId: string) => {
    try {
      const next = await api().run.get({ runID: runId })
      setDetail(next?.data)
    } catch (e) {
      setError(errorText(e))
    }
  }

  const run = async (flow: FlowSummary) => {
    setBusy(flow.id)
    setError("")
    try {
      const started = await api().start({ flowID: flow.id, requestId: requestId("panel"), input: {}, trigger: "manual" })
      setSelected(flow.id)
      await showRun(started.data.runId)
      await refresh()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(undefined)
    }
  }

  const save = async () => {
    const parsed = parseDefinition(draft())
    if (!parsed.ok) return setDraftError(parsed.error)
    setDraftError("")
    try {
      const saved = await api().save({ definition: parsed.definition })
      setDraft("")
      setAdding(false)
      showToast(saved.data.created ? `Saved flow ${saved.data.id} (version ${saved.data.version})` : `Flow ${saved.data.id} is unchanged`)
      await refresh()
    } catch (e) {
      setDraftError(errorText(e))
    }
  }

  return (
    <section class="ap-flows" data-component="aporia-flows">
      <div class="ap-flows-head">
        <strong>Flows</strong>
        <span class="ap-muted ap-small">Run in Aporetic, no model, 0 tokens</span>
        <button type="button" class="ap-btn ap-btn-ghost" onClick={() => setAdding(!adding())} data-action="flow-add">
          <Icon name={adding() ? "x" : "file"} size={12} />
          {adding() ? "Cancel" : "Add flow from JSON"}
        </button>
      </div>
      <Show when={!sdk}>
        <div class="ap-card ap-card-err">Flows need the Aporetic server.</div>
      </Show>
      <Show when={error()}>
        <div class="ap-card ap-card-err" role="alert">
          {error()}
        </div>
      </Show>
      <Show when={adding()}>
        <div class="ap-card">
          <textarea
            class="ap-flow-json"
            rows={8}
            spellcheck={false}
            placeholder='{"id": "my-flow", "name": "My flow", "steps": [...], "connections": [...]}'
            value={draft()}
            onInput={(e) => setDraft(e.currentTarget.value)}
            data-field="flow-json"
          />
          <Show when={draftError()}>
            <span class="ap-small ap-flow-err" role="alert">
              {draftError()}
            </span>
          </Show>
          <button type="button" class="ap-btn" onClick={() => void save()} data-action="flow-save">
            <Icon name="check" size={12} /> Save flow
          </button>
        </div>
      </Show>
      <Show when={loaded()}>
        <ul class="ap-files">
          <For
            each={flows()}
            fallback={<EmptyState icon="sparkles" title="No flows yet" hint="Add one from JSON to start." />}
          >
            {(flow) => (
              <li classList={{ "ap-flow-selected": selected() === flow.id }}>
                <span class="ap-status-dot" classList={{ "ap-busy": !!flow.lastRun && isOpen(flow.lastRun.status) }} />
                <button type="button" class="ap-app-text ap-flow-name" onClick={() => void select(flow.id)}>
                  <strong class="ap-ellipsis">{flow.name}</strong>
                  <span class="ap-muted ap-small">
                    /{slashName(flow)} · v{flow.version} · {flow.steps} steps
                    {flow.lastRun ? ` · last: ${runLabel(flow.lastRun.status)}` : " · never run"}
                  </span>
                </button>
                <button
                  type="button"
                  class="ap-btn ap-btn-ghost"
                  disabled={busy() === flow.id}
                  onClick={() => void run(flow)}
                  data-action="flow-run"
                >
                  <Icon name="sparkles" size={12} />
                  Run
                </button>
              </li>
            )}
          </For>
        </ul>
      </Show>
      <Show when={selected()}>
        <div class="ap-flow-history">
          <span class="ap-muted ap-small">Recent runs</span>
          <ul class="ap-files">
            <For each={runs()} fallback={<li class="ap-muted ap-small">No runs yet</li>}>
              {(entry) => (
                <li>
                  <button type="button" class="ap-app-text ap-flow-name" onClick={() => void showRun(entry.runId)}>
                    <strong>{runLabel(entry.status)}</strong>
                    <span class="ap-muted ap-small">
                      {new Date(entry.requestedAt).toLocaleString()} · {entry.trigger} · v{entry.version} · {entry.tokens} tokens
                    </span>
                  </button>
                </li>
              )}
            </For>
          </ul>
        </div>
      </Show>
      <Show when={detail()}>
        {(run) => (
          <div class="ap-card ap-flow-timeline" data-component="aporia-flow-timeline">
            <strong>
              {run().flowName} · {runLabel(run().status)} · {run().tokens} tokens
            </strong>
            <Show when={run().error}>
              <span class="ap-small ap-flow-err">{run().error}</span>
            </Show>
            <ol class="ap-flow-steps">
              <For each={run().steps}>
                {(step) => (
                  <li classList={{ [`ap-step-${step.status}`]: true }} title={step.error ?? step.output ?? ""}>
                    {stepLine(step)}
                  </li>
                )}
              </For>
            </ol>
            <Show when={run().status === "needs-attention"}>
              <span class="ap-muted ap-small">
                A step may or may not have run. Resolve its card under Needs your attention: "run-again" repeats it,
                anything else stops the run.
              </span>
            </Show>
          </div>
        )}
      </Show>
    </section>
  )
}

/** Registers `/<flow id> [input]` for every saved flow. Input is a JSON object, or text as { text }. */
export function FlowCommands() {
  const sdk = useSdk()
  let command: ReturnType<typeof useCommand> | undefined
  try {
    command = useCommand()
  } catch {
    command = undefined
  }
  const [flows, setFlows] = createSignal<FlowSummary[]>([])
  const load = async () => {
    if (!sdk?.api?.flow) return
    try {
      const listed = await sdk.api.flow.list()
      const next = [...(listed?.data ?? [])] as FlowSummary[]
      // Only replace the list when the set of flows changed, so the command registry is not churned every poll.
      const key = (list: FlowSummary[]) => list.map((f) => `${f.id}:${f.name}`).join("|")
      if (key(next) !== key(flows())) setFlows(next)
    } catch {
      // The Flows tab shows errors; the slash list just keeps what it had.
    }
  }
  void load()
  const timer = setInterval(() => void load(), 10_000)
  onCleanup(() => clearInterval(timer))

  command?.register("aporia.flows", () =>
    flows().map((flow) => ({
      id: `flow.${flow.id}`,
      title: `Run flow: ${flow.name}`,
      description: "Runs in Aporetic with no model call. Input: a JSON object, or text.",
      category: "Flows",
      slash: slashName(flow),
      slashArguments: true,
      onSelect: async (_source?: unknown, input?: string) => {
        try {
          const started = await sdk.api.flow.start({
            flowID: flow.id,
            requestId: requestId("slash"),
            input: slashInput(input),
            trigger: "slash",
          })
          showToast({ title: startedToast(flow.name, started.data.created), variant: "success" } as never)
        } catch (e) {
          showToast({ title: `Flow ${flow.name} did not start`, description: errorText(e), variant: "error" } as never)
        }
      },
    })),
  )
  return null
}
