// APORIA: right panel with Details, Library and Computer tabs.
import { createEffect, createMemo, createSignal, For, lazy, Match, onMount, Show, Switch } from "solid-js"
import type { AporiaView } from "./layout"
import { aporiaPrefs } from "./prefs"
import { contextTokens, formatTokens, tokenTotal, touchedFiles } from "./session-stats"
import { Avatar } from "./avatar"
import { EmptyState, Icon, type IconName } from "./icons"
import { agentFor, bots } from "./bots"
import { call, startVoiceCall, hangUpCall, toggleCallMute, loadCalls, callsVersion } from "./call"

type Tab = "details" | "library" | "browser" | "automations" | "call"

const TAB_ICONS: Record<Tab, IconName> = { details: "info", library: "library", browser: "monitor", automations: "sparkles", call: "phone" }
const AutomationsTab = lazy(() => import("./automations").then((m) => ({ default: m.AutomationsTab })))

export function AporiaRightPanel(props: { view: AporiaView; onClose?: () => void; callTab?: boolean; onCallTabHandled?: () => void }) {
  const [tab, setTab] = createSignal<Tab>("details")
  const [browserUsed, setBrowserUsed] = createSignal(false)
  // A voice call (composer phone icon) can request the Call tab.
  createEffect(() => {
    if (props.callTab) { setTab("call"); props.onCallTabHandled?.() }
  })
  // The browser is mounted on first use and then kept mounted, so switching tabs never reloads the page. Mounting
  // it eagerly would fetch the saved URL for every panel open, including for a user who never opens the Browser tab.
  createEffect(() => {
    if (tab() === "browser") setBrowserUsed(true)
  })
  const info = () => props.view.info()
  const messages = () => props.view.messages()
  const activeContext = createMemo(() => contextTokens(messages()))
  const lifetimeTotal = createMemo(() => tokenTotal(info()?.tokens))
  const files = createMemo(() => touchedFiles(messages()))
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
      const kind = m?.role ?? m?.type
      if (kind !== "assistant") continue
      const parts = m.content ?? m.parts
      if (Array.isArray(parts)) {
        const text = parts
          .filter((p: any) => (p?.type === "text" || p?.type === "assistant.text") && !p?.synthetic)
          .map((p: any) => p.text ?? "")
          .join("\n")
          .trim()
        if (text) return text
      }
      if (typeof parts === "string" && parts.trim()) return parts.trim()
      if (typeof m.text === "string" && m.text.trim()) return m.text.trim()
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
              <dt title="Last completed assistant prompt (input + cache)">Active context</dt>
              <dd>{formatTokens(activeContext())}</dd>
              <dt title="Cumulative session token usage across the session lifetime">Lifetime total</dt>
              <dd>{formatTokens(lifetimeTotal())}</dd>
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
        </Switch>
        {/* APORIA: the browser stays mounted while the panel switches tabs. Unmounting it reloaded the page and
            dropped anything it was signed into, which read as the browser never staying put. */}
        <div class="ap-browser-pane" style={{ display: tab() === "browser" ? undefined : "none" }}>
          <Show when={browserUsed()}>
            <BrowserTab />
          </Show>
        </div>
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

function formatDuration(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

/** Bar height for the call meter — driven by the live mic level. */
function meterHeight(i: number) {
  if (!call.active) return 8
  const wobble = 0.35 + 0.65 * Math.abs(Math.sin(i * 0.7 + performance.now() / 240))
  return Math.round(8 + call.level() * 92 * wobble)
}

function CallTab(props: { view: AporiaView }) {
  const [showLive, setShowLive] = createSignal(false)
  const [openSaved, setOpenSaved] = createSignal<number | null>(null)
  const [voice, setVoice] = createSignal((typeof localStorage !== "undefined" && localStorage.getItem("aporia.tts.voice")) || "nova")
  const [voices, setVoices] = createSignal<{ key: string; label: string; hint: string }[]>([])
  onMount(async () => {
    try {
      const bridge = (globalThis as any).electron?.aporia
      if (bridge?.ttsVoices) setVoices(await bridge.ttsVoices())
    } catch { /* ignore */ }
  })

  const st = () => call.state()
  const agentName = () => props.view.info()?.agent ?? "build"
  const statusText = () =>
    st() === "connecting" ? "Connecting…" :
    st() === "listening" ? "Listening…" :
    st() === "thinking" ? "Thinking…" :
    st() === "speaking" ? "Speaking…" :
    st() === "error" ? "Call failed" : "Tap to call"

  const saved = () => { callsVersion(); return loadCalls(props.view.sessionID()).slice().reverse() }

  return (
    <div class="ap-call">
      <div class="ap-call-stage">
        <div class="ap-call-halo" classList={{ "ap-call-halo-live": call.active, "ap-call-halo-speaking": st() === "speaking" }}>
          <Avatar name={agentName()} size={76} />
        </div>
        <strong class="ap-call-name">{agentName()}</strong>
        <span class="ap-call-status">{statusText()}</span>

        <div class="ap-call-meter" aria-hidden="true">
          <For each={Array.from({ length: 27 })}>
            {(_, i) => <span class="ap-call-bar" style={{ height: `${meterHeight(i())}%` }} />}
          </For>
        </div>

        <label class="ap-call-voice">
          <span class="ap-muted ap-small">Voice</span>
          <select
            value={voice()}
            onChange={(event) => {
              setVoice(event.currentTarget.value)
              try { localStorage.setItem("aporia.tts.voice", event.currentTarget.value) } catch { /* ignore */ }
            }}
          >
            <For each={voices().length ? voices() : [{ key: "nova", label: "Nova", hint: "" }]}>
              {(v) => <option value={v.key} title={v.hint}>{v.label}</option>}
            </For>
          </select>
        </label>

        <div class="ap-call-actions">
          <Show when={call.active} fallback={
            <button type="button" class="ap-call-btn ap-call-start" onClick={() => startVoiceCall()}>Start call</button>
          }>
            <button type="button" class="ap-call-btn" title={call.muted() ? "Unmute" : "Mute"} aria-label="Mute" onClick={() => toggleCallMute()}>
              {call.muted() ? "Unmute" : "Mute"}
            </button>
            <button type="button" class="ap-call-btn ap-call-hang" onClick={() => hangUpCall()}>Hang up</button>
          </Show>
        </div>

        <button type="button" class="ap-call-text-toggle" onClick={() => setShowLive(!showLive())}>
          {showLive() ? "Hide transcript" : "View live transcript"}
        </button>
      </div>

      <Show when={showLive()}>
        <div class="ap-call-transcript">
          <Show when={call.lines().length} fallback={<span class="ap-muted ap-small">Nothing yet — start talking.</span>}>
            <For each={call.lines()}>
              {(line) => (
                <div class="ap-call-line" classList={{ "ap-call-you": line.who === "you", "ap-call-tool": line.who === "tool" }}>
                  <span class="ap-call-who">{line.who === "you" ? "You" : line.who === "tool" ? "Tool" : "Agent"}</span>
                  <span>{line.text}</span>
                </div>
              )}
            </For>
          </Show>
        </div>
      </Show>

      <Show when={call.error()}>
        <div class="ap-card ap-card-err" role="alert">{call.error()}</div>
      </Show>

      <Show when={saved().length}>
        <div class="ap-call-saved">
          <span class="ap-section-label ap-call-saved-label">Saved calls</span>
          <For each={saved()}>
            {(rec, idx) => (
              <div class="ap-call-saved-item">
                <button type="button" class="ap-call-saved-head" onClick={() => setOpenSaved(openSaved() === idx() ? null : idx())}>
                  <span>Call · {new Date(rec.at).toLocaleString()}</span>
                  <span class="ap-muted ap-small">{formatDuration(rec.ms)} · {rec.lines.length} turns</span>
                </button>
                <Show when={openSaved() === idx()}>
                  <div class="ap-call-transcript">
                    <For each={rec.lines}>
                      {(line) => (
                        <div class="ap-call-line" classList={{ "ap-call-you": line.who === "you", "ap-call-tool": line.who === "tool" }}>
                          <span class="ap-call-who">{line.who === "you" ? "You" : line.who === "tool" ? "Tool" : "Agent"}</span>
                          <span>{line.text}</span>
                        </div>
                      )}
                    </For>
                  </div>
                </Show>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}
