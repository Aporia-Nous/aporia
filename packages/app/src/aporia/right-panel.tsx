// APORIA: right panel with Details, Library and Computer tabs.
import { createMemo, createSignal, For, Match, Show, Switch } from "solid-js"
import type { AporiaView } from "./layout"
import { aporiaPrefs } from "./prefs"
import { formatTokens, tokenTotal, touchedFiles } from "./session-stats"
import { Avatar } from "./avatar"
import { EmptyState, Icon, type IconName } from "./icons"

type Tab = "details" | "library" | "computer"

const TAB_ICONS: Record<Tab, IconName> = { details: "info", library: "library", computer: "monitor" }

export function AporiaRightPanel(props: { view: AporiaView }) {
  const [tab, setTab] = createSignal<Tab>("details")
  const info = () => props.view.info()
  const files = createMemo(() => touchedFiles(props.view.messages()))
  const agentName = () => info()?.agent ?? "build"

  return (
    <aside class="ap-right">
      <div class="ap-right-head">
        <Avatar name={agentName()} size={44} />
        <strong>{agentName()}</strong>
        <span class="ap-muted">{props.view.working() ? "Working…" : "Ready"}</span>
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
              <Icon name={TAB_ICONS[value]} size={14} />
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
              <dd class="ap-break">{props.view.directory()}</dd>
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
              <For each={files()} fallback={<EmptyState icon="folder" title="No files yet" hint="Files the agent creates or edits appear here." />}>
                {(file) => (
                  <li title={file.path}>
                    <Icon name="file" size={14} class="ap-file-icon" />
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
            <span class="ap-empty-icon">
              <Icon name="monitor" size={20} />
            </span>
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
