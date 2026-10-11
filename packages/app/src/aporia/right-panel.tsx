// APORIA: right panel with Details, Library and Computer tabs.
import { createMemo, createSignal, For, Match, Show, Switch } from "solid-js"
import type { SessionModel } from "@/session/model"
import { aporiaPrefs } from "./prefs"
import { formatTokens, tokenTotal, touchedFiles } from "./session-stats"
import { Avatar } from "./avatar"

type Tab = "details" | "library" | "computer"

export function AporiaRightPanel(props: { session: SessionModel }) {
  const [tab, setTab] = createSignal<Tab>("details")
  const info = () => props.session.data.info()
  const files = createMemo(() => touchedFiles(props.session.history.messages()))
  const agentName = () => info()?.agent ?? "build"

  return (
    <aside class="ap-right">
      <div class="ap-right-head">
        <Avatar name={agentName()} size={44} />
        <strong>{agentName()}</strong>
        <span class="ap-muted">{props.session.data.working() ? "Working…" : "Ready"}</span>
      </div>
      <div class="ap-tabs" role="tablist">
        <For each={["details", "library", "computer"] as Tab[]}>
          {(value) => (
            <button
              type="button"
              role="tab"
              aria-selected={tab() === value}
              classList={{ "ap-tab": true, "ap-tab-active": tab() === value }}
              onClick={() => setTab(value)}
            >
              {value[0]!.toUpperCase() + value.slice(1)}
            </button>
          )}
        </For>
      </div>
      <div class="ap-tab-body">
        <Switch>
          <Match when={tab() === "details"}>
            <dl class="ap-details">
              <dt>Session</dt>
              <dd>{info()?.title ?? "Untitled"}</dd>
              <dt>Model</dt>
              <dd>{info()?.model ? `${info()!.model!.providerID}/${info()!.model!.id}` : "Default"}</dd>
              <dt>Agent</dt>
              <dd>{agentName()}</dd>
              <dt>Folder</dt>
              <dd class="ap-break">{props.session.workspace.directory()}</dd>
              <dt>Created</dt>
              <dd>{info() ? new Date(info()!.time.created).toLocaleString() : ""}</dd>
              <dt>Tokens</dt>
              <dd>{formatTokens(tokenTotal(info()?.tokens))}</dd>
              <dt>Files touched</dt>
              <dd>{files().length}</dd>
            </dl>
          </Match>
          <Match when={tab() === "library"}>
            <ul class="ap-files">
              <For each={files()} fallback={<li class="ap-muted">No files created or edited yet</li>}>
                {(file) => (
                  <li title={file.path}>
                    <span class="ap-file-icon">▤</span>
                    <span class="ap-ellipsis">{file.path}</span>
                    <span class="ap-muted ap-small">{file.via}</span>
                  </li>
                )}
              </For>
            </ul>
          </Match>
          <Match when={tab() === "computer"}>
            <ComputerTab />
          </Match>
        </Switch>
      </div>
    </aside>
  )
}

function ComputerTab() {
  const [draft, setDraft] = createSignal(aporiaPrefs.computerUrl())
  return (
    <div class="ap-computer">
      <Show
        when={aporiaPrefs.computerUrl()}
        fallback={
          <div class="ap-computer-empty">
            <span class="ap-status-dot" />
            <strong>Not connected</strong>
            <span class="ap-muted ap-small">Paste the noVNC URL of the agent's computer to see it live here.</span>
          </div>
        }
      >
        <iframe class="ap-computer-frame" src={aporiaPrefs.computerUrl()} title="Agent computer" />
      </Show>
      <form
        class="ap-computer-form"
        onSubmit={(event) => {
          event.preventDefault()
          aporiaPrefs.setComputerUrl(draft())
        }}
      >
        <input
          class="ap-input"
          placeholder="https://…/vnc.html"
          value={draft()}
          onInput={(event) => setDraft(event.currentTarget.value)}
        />
        <button type="submit" class="ap-btn">
          Save
        </button>
      </form>
    </div>
  )
}
