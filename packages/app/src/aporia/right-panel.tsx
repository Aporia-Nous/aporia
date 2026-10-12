// APORIA: right panel with Details, Library and Computer tabs.
import { createMemo, createSignal, For, lazy, Match, Show, Switch } from "solid-js"
import type { AporiaView } from "./layout"
import { aporiaPrefs } from "./prefs"
import { formatTokens, tokenTotal, touchedFiles } from "./session-stats"
import { Avatar } from "./avatar"
import { EmptyState, Icon, type IconName } from "./icons"

type Tab = "details" | "library" | "browser" | "automations" | "votel"

const TAB_ICONS: Record<Tab, IconName> = { details: "info", library: "library", browser: "monitor", automations: "sparkles", votel: "phone" }
const VotelTab = lazy(() => import("./votel").then((m) => ({ default: m.VotelTab })))
const AutomationsTab = lazy(() => import("./automations").then((m) => ({ default: m.AutomationsTab })))

export function AporiaRightPanel(props: { view: AporiaView; onClose?: () => void }) {
  const [tab, setTab] = createSignal<Tab>("details")
  const info = () => props.view.info()
  const files = createMemo(() => touchedFiles(props.view.messages()))
  const agentName = () => info()?.agent ?? "build"

  return (
    <aside class="ap-right">
      <div class="ap-right-head">
        <button type="button" class="ap-icon-btn ap-panel-collapse" title="Hide panel" aria-label="Hide right panel" onClick={() => props.onClose?.()}>»</button>
        <Avatar name={agentName()} size={44} />
        <strong>{agentName()}</strong>
        <span class="ap-muted">{props.view.working() ? "Working…" : "Ready"}</span>
      </div>
      <div class="ap-tabs" role="tablist">
        <For each={["details", "library", "browser", "automations", "votel"] as Tab[]}>
          {(value) => (
            <button
              type="button"
              role="tab"
              aria-selected={tab() === value}
              classList={{ "ap-tab": true, "ap-tab-active": tab() === value }}
              onClick={() => setTab(value)}
            >
              <Icon name={TAB_ICONS[value]} size={14} />
              <span class="ap-tab-label">{value === "automations" ? "Flows" : value === "votel" ? "Votel" : value === "browser" ? "Browser" : value[0]!.toUpperCase() + value.slice(1)}</span>
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
          <Match when={tab() === "votel"}>
            <VotelTab />
          </Match>
          <Match when={tab() === "automations"}>
            <AutomationsTab />
          </Match>
          <Match when={tab() === "browser"}>
            <BrowserTab />
          </Match>
        </Switch>
      </div>
    </aside>
  )
}

function BrowserTab() {
  const [draft, setDraft] = createSignal(aporiaPrefs.browserUrl())
  const [src, setSrc] = createSignal(aporiaPrefs.browserUrl())
  const open = (value: string) => {
    const url = value.trim()
    if (!url) return
    aporiaPrefs.setBrowserUrl(url)
    setSrc(url)
  }
  return (
    <div class="ap-computer">
      <form class="ap-computer-form" onSubmit={(event) => { event.preventDefault(); open(draft()) }}>
        <input class="ap-input" placeholder="https://example.com" value={draft()} onInput={(event) => setDraft(event.currentTarget.value)} />
        <button type="submit" class="ap-btn">Go</button>
      </form>
      <Show
        when={src()}
        fallback={
          <div class="ap-computer-empty">
            <span class="ap-empty-icon">
              <Icon name="monitor" size={20} />
            </span>
            <strong>No page yet</strong>
            <span class="ap-muted ap-small">Type a URL to view a page live inside Aporetic — no VM needed.</span>
          </div>
        }
      >
        <iframe
          class="ap-computer-frame"
          src={src()}
          title="Browser"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
        />
      </Show>
      <span class="ap-muted ap-small">Shows the page live. Sites that block embedding won't render here — the agent-desktop mirror handles those.</span>
    </div>
  )
}
