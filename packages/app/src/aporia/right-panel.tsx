// APORIA: right panel with Details, Library and Computer tabs.
import { createMemo, createSignal, For, lazy, Match, onMount, Show, Switch } from "solid-js"
import type { AporiaView } from "./layout"
import { aporiaPrefs } from "./prefs"
import { formatTokens, tokenTotal, touchedFiles } from "./session-stats"
import { Avatar } from "./avatar"
import { EmptyState, Icon, type IconName } from "./icons"
import { agentFor, bots } from "./bots"

type Tab = "details" | "library" | "computer" | "automations" | "votel"

const TAB_ICONS: Record<Tab, IconName> = { details: "info", library: "library", computer: "monitor", automations: "sparkles", votel: "phone" }
const VotelTab = lazy(() => import("./votel").then((m) => ({ default: m.VotelTab })))
const AutomationsTab = lazy(() => import("./automations").then((m) => ({ default: m.AutomationsTab })))

export function AporiaRightPanel(props: { view: AporiaView; onClose?: () => void }) {
  const [tab, setTab] = createSignal<Tab>("details")
  const info = () => props.view.info()
  const files = createMemo(() => touchedFiles(props.view.messages()))
  const agentName = () => info()?.agent ?? "build"

  // APORIA voice: read the latest reply aloud with a local, offline engine (faces shown as Aporia voices).
  const [speaking, setSpeaking] = createSignal(false)
  const [voice, setVoice] = createSignal((typeof localStorage !== "undefined" && localStorage.getItem("aporia.tts.voice")) || "nova")
  const [voices, setVoices] = createSignal<{ key: string; label: string; hint: string }[]>([])
  onMount(async () => {
    try {
      const bridge = (globalThis as any).electron?.aporia
      if (bridge?.ttsVoices) setVoices(await bridge.ttsVoices())
    } catch {}
  })
  const lastAssistantText = () => {
    const msgs = (props.view.messages?.() ?? []) as any[]
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i]
      if (m?.role !== "assistant") continue
      const parts = m.parts ?? m.content
      if (Array.isArray(parts)) {
        const text = parts.filter((p: any) => p?.type === "text").map((p: any) => p.text ?? "").join("\n").trim()
        if (text) return text
      }
      if (typeof parts === "string" && parts.trim()) return parts.trim()
    }
    return ""
  }
  async function readAloud() {
    const text = lastAssistantText()
    const bridge = (globalThis as any).electron?.aporia
    if (!text || !bridge?.tts) return
    // Per-bot voice wins: if this session's teammate has its own voice, use it; else the picked default.
    const teammateVoice = (() => {
      try {
        const bot = bots().find((b) => agentFor(b) === agentName())
        return bot?.voice || undefined
      } catch { return undefined }
    })()
    setSpeaking(true)
    try {
      const { wav } = await bridge.tts({ text, voice: teammateVoice || voice() })
      const bytes = Uint8Array.from(atob(wav), (c) => c.charCodeAt(0))
      const url = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }))
      const audio = new Audio(url)
      audio.onended = () => { setSpeaking(false); URL.revokeObjectURL(url) }
      await audio.play()
    } catch (error) {
      setSpeaking(false)
      console.error("aporia tts", error)
    }
  }

  return (
    <aside class="ap-right">
      <div class="ap-right-head">
        <button type="button" class="ap-icon-btn ap-panel-collapse" title="Hide panel" aria-label="Hide right panel" onClick={() => props.onClose?.()}>»</button>
        <button type="button" class="ap-icon-btn" title={speaking() ? "Speaking…" : "Read the last reply aloud"} aria-label="Read aloud" disabled={speaking()} onClick={readAloud}>{speaking() ? "…" : "🔊"}</button>
        <Avatar name={agentName()} size={44} />
        <strong>{agentName()}</strong>
        <span class="ap-muted">{props.view.working() ? "Working…" : "Ready"}</span>
      </div>
      <div class="ap-tabs" role="tablist">
        <For each={["details", "library", "computer", "automations", "votel"] as Tab[]}>
          {(value) => (
            <button
              type="button"
              role="tab"
              aria-selected={tab() === value}
              classList={{ "ap-tab": true, "ap-tab-active": tab() === value }}
              onClick={() => setTab(value)}
            >
              <Icon name={TAB_ICONS[value]} size={14} />
              <span class="ap-tab-label">{value === "automations" ? "Flows" : value === "votel" ? "Votel" : value[0]!.toUpperCase() + value.slice(1)}</span>
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
              <dt>Voice</dt>
              <dd>
                <select
                  value={voice()}
                  onChange={(event) => {
                    setVoice(event.currentTarget.value)
                    try { localStorage.setItem("aporia.tts.voice", event.currentTarget.value) } catch {}
                  }}
                >
                  <For each={voices().length ? voices() : [{ key: "nova", label: "Nova", hint: "" }]}>
                    {(v) => <option value={v.key} title={v.hint}>{v.label}</option>}
                  </For>
                </select>
              </dd>
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
