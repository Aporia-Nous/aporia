// APORIA: right panel with Details, Library and Computer tabs.
import { createEffect, createMemo, createSignal, For, lazy, Match, onMount, Show, Switch } from "solid-js"
import type { AporiaView } from "./layout"
import { aporiaPrefs } from "./prefs"
import { formatTokens, tokenTotal, touchedFiles } from "./session-stats"
import { Avatar } from "./avatar"
import { EmptyState, Icon, type IconName } from "./icons"
import { agentFor, bots } from "./bots"
import { speak, listenOnce, stopRecording } from "./dictation"

type Tab = "details" | "library" | "browser" | "automations" | "call"

const TAB_ICONS: Record<Tab, IconName> = { details: "info", library: "library", browser: "monitor", automations: "sparkles", call: "phone" }
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
        <For each={["details", "library", "browser", "automations", "call"] as Tab[]}>
          {(value) => (
            <button
              type="button"
              role="tab"
              aria-selected={tab() === value}
              classList={{ "ap-tab": true, "ap-tab-active": tab() === value }}
              onClick={() => setTab(value)}
            >
              <Icon name={TAB_ICONS[value]} size={14} />
              <span class="ap-tab-label">{value === "automations" ? "Flows" : value === "call" ? "Call" : value === "browser" ? "Browser" : value[0]!.toUpperCase() + value.slice(1)}</span>
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
          <Match when={tab() === "call"}>
            <CallTab view={props.view} />
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

function CallTab(props: { view: AporiaView }) {
  const [on, setOn] = createSignal(false)
  const [status, setStatus] = createSignal<"idle" | "listening" | "thinking" | "speaking">("idle")
  const [log, setLog] = createSignal<{ who: string; text: string }[]>([])
  const [error, setError] = createSignal("")
  let spoken = ""

  const lastReply = () => {
    const msgs = (props.view.messages?.() ?? []) as any[]
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i]
      if (m?.role !== "assistant") continue
      const parts = m.parts ?? m.content
      if (Array.isArray(parts)) {
        const text = parts.filter((p: any) => p?.type === "text").map((p: any) => p.text ?? "").join("\n").trim()
        if (text) return text
      } else if (typeof parts === "string" && parts.trim()) return parts.trim()
    }
    return ""
  }

  const listen = () => {
    if (!on()) return
    setStatus("listening")
    void listenOnce((text) => {
      setLog((l) => [...l, { who: "You", text }])
      setStatus("thinking")
    }).catch((e) => { setError(String(e)); setStatus("idle") })
  }

  createEffect(() => {
    if (!on()) return
    const text = lastReply()
    if (!text || text === spoken) return
    spoken = text
    setLog((l) => [...l, { who: "Agent", text }])
    setStatus("speaking")
    void speak(text)
      .then(() => { if (on()) listen() })
      .catch((e) => { setError(e instanceof Error ? e.message : String(e)); setStatus("idle") })
  })

  const toggle = () => {
    if (on()) { setOn(false); stopRecording(); setStatus("idle"); return }
    setError("")
    setOn(true)
    spoken = lastReply()
    listen()
  }

  return (
    <div class="ap-computer">
      <div class="ap-card" style={{ "align-items": "center", "text-align": "center", gap: "10px", padding: "18px" }}>
        <span class="ap-empty-icon"><Icon name="phone" size={20} /></span>
        <strong>
          {on() ? (status() === "listening" ? "Listening…" : status() === "speaking" ? "Agent speaking…" : status() === "thinking" ? "Thinking…" : "On call") : "Talk to this agent"}
        </strong>
        <span class="ap-muted ap-small">
          {on() ? "Speak, then pause — the agent answers out loud." : "Hands-free voice. You talk, the agent replies out loud. Works with any model."}
        </span>
        <button type="button" class="ap-btn" style={on() ? { background: "#f87171", color: "#0a1020" } : undefined} onClick={toggle}>
          {on() ? "Hang up" : "Call"}
        </button>
        <span class="ap-muted ap-small">Local engines: Kokoro out, Whisper in. First call downloads the models once.</span>
      </div>
      <Show when={error()}><div class="ap-card ap-card-err" role="alert">{error()}</div></Show>
      <div class="ap-activity">
        <For each={log()}>{(entry) => (
          <div class="ap-activity-row"><strong>{entry.who}</strong><span>{entry.text}</span></div>
        )}</For>
      </div>
    </div>
  )
}
