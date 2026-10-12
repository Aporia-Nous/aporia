// APORIA: local voice — push-to-talk dictation (Whisper) + speak (Kokoro) + call mode loop.
import { createEffect, createSignal, onCleanup } from "solid-js"
import { Icon } from "./icons"

type Bridge = {
  stt?: (input: { pcm: number[] }) => Promise<{ text?: string }>
  tts?: (input: { text: string; voice?: string }) => Promise<{ wav: string }>
}
const bridge = () => (globalThis as any).electron?.aporia as Bridge | undefined

const MIC_SVG =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2.5" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/><path d="M8 21h8"/></svg>'
const STOP_SVG =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>'
const PHONE_SVG =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z"/></svg>'

export async function speak(text: string, voice?: string): Promise<void> {
  const clean = (text || "").trim()
  if (!clean) return
  const api = bridge()
  if (!api?.tts) throw new Error("TTS bridge unavailable")
  const { wav } = await api.tts({ text: clean.slice(0, 4000), voice })
  const bytes = Uint8Array.from(atob(wav), (c) => c.charCodeAt(0))
  const url = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }))
  await new Promise<void>((resolve, reject) => {
    const audio = new Audio(url)
    audio.onended = () => { URL.revokeObjectURL(url); resolve() }
    audio.onerror = () => { URL.revokeObjectURL(url); reject(new Error("audio playback failed")) }
    audio.play().then(undefined, (e) => { URL.revokeObjectURL(url); reject(e) })
  })
}

async function decodeToPcm(blob: Blob): Promise<Float32Array> {
  const buf = await blob.arrayBuffer()
  const ctx = new AudioContext()
  const decoded = await ctx.decodeAudioData(buf)
  await ctx.close()
  const rate = 16000
  const frames = Math.max(1, Math.ceil(decoded.duration * rate))
  const offline = new OfflineAudioContext(1, frames, rate)
  const source = offline.createBufferSource()
  source.buffer = decoded
  source.connect(offline.destination)
  source.start()
  return (await offline.startRendering()).getChannelData(0)
}

export function insertIntoComposer(text: string): boolean {
  const el = document.querySelector<HTMLElement>('[data-component="composer-editor"]')
  if (!el) return false
  el.focus()
  if (el.textContent && !/\s$/.test(el.textContent)) document.execCommand?.("insertText", false, " ")
  const inserted = document.execCommand?.("insertText", false, text)
  if (!inserted) {
    el.textContent = el.textContent ? `${el.textContent} ${text}` : text
  }
  el.dispatchEvent(new InputEvent("input", { bubbles: true }))
  el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }))
  return true
}

function submitComposer() {
  const form = document.querySelector<HTMLFormElement>('form[data-component="composer"]')
  if (form) { form.requestSubmit(); return }
  document.querySelector<HTMLButtonElement>('[data-action="composer-submit"]')?.click()
}

// ---- recording (shared by dictation + call mode) ----
let active: { rec: MediaRecorder; stream: MediaStream; chunks: Blob[] } | undefined

async function startRecording(onText: (text: string) => void, onSubmit: boolean) {
  stopRecording()
  if (!navigator.mediaDevices?.getUserMedia) return
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const rec = new MediaRecorder(stream)
  const entry = { rec, stream, chunks: [] as Blob[] }
  active = entry
  rec.ondataavailable = (e) => e.data.size && entry.chunks.push(e.data)
  rec.onstop = async () => {
    stream.getTracks().forEach((t) => t.stop())
    if (active === entry) active = undefined
    try {
      const blob = new Blob(entry.chunks, { type: entry.chunks[0]?.type || "audio/webm" })
      const pcm = await decodeToPcm(blob)
      const res = await bridge()?.stt?.({ pcm: Array.from(pcm) })
      const text = (res?.text ?? "").trim()
      if (!text) return
      if (!insertIntoComposer(text)) { try { await navigator.clipboard.writeText(text) } catch { /* ignore */ } return }
      if (onSubmit) submitComposer()
      onText(text)
    } catch (error) {
      console.error("aporia stt", error)
    }
  }
  rec.start()
}

export function listenOnce(onText: (text: string) => void) {
  return startRecording(onText, true)
}

export function stopRecording() {
  try { active?.rec.stop() } catch { /* ignore */ }
}

/** Push-to-talk mic button: records, transcribes, inserts into the composer. */
export function MicButton(props: { class?: string }) {
  const [state, setState] = createSignal<"idle" | "rec" | "busy">("idle")
  return (
    <button
      type="button"
      class={props.class ?? "ap-icon-btn"}
      title={state() === "rec" ? "Stop and transcribe" : "Dictate"}
      aria-label="Dictate"
      disabled={state() === "busy"}
      onClick={() => {
        if (state() === "rec") { stopRecording(); setState("busy"); setTimeout(() => setState("idle"), 2500); return }
        if (state() !== "idle") return
        setState("rec")
        void startRecording(() => setState("idle"), false).catch(() => setState("idle"))
      }}
    >
      {state() === "rec" ? <span innerHTML={STOP_SVG} /> : <Icon name="mic" size={16} />}
    </button>
  )
}

/** Injects a dictation mic into the stock composer toolbar (left of Send). No stock code touched. */
export function ComposerMic() {
  createEffect(() => {
    const inject = () => {
      const composer = document.querySelector<HTMLElement>('[data-component="composer"]')
      if (!composer || composer.querySelector("[data-aporia-mic]")) return
      const buttons = [...composer.querySelectorAll("button")]
      const send = buttons.find((b) => b.type === "submit") ?? buttons[buttons.length - 1]
      const parent = send?.parentElement ?? composer

      // Voice call — toggles the header Call, which owns the listen→speak loop.
      const call = document.createElement("button")
      call.type = "button"
      call.setAttribute("data-aporia-call-inline", "")
      call.className = "ap-icon-btn ap-mic-inline"
      call.title = "Voice call"
      call.innerHTML = PHONE_SVG
      call.onclick = () => document.querySelector<HTMLButtonElement>("[data-aporia-call]")?.click()

      // Dictation mic.
      const mic = document.createElement("button")
      mic.type = "button"
      mic.setAttribute("data-aporia-mic", "")
      mic.className = "ap-icon-btn ap-mic-inline"
      mic.title = "Dictate"
      mic.innerHTML = MIC_SVG
      let recording = false
      mic.onclick = () => {
        if (recording) { stopRecording(); recording = false; mic.innerHTML = MIC_SVG; return }
        recording = true
        mic.innerHTML = STOP_SVG
        void startRecording(() => { recording = false; mic.innerHTML = MIC_SVG }, false).catch(() => { recording = false; mic.innerHTML = MIC_SVG })
      }

      parent.insertBefore(call, send ?? null)
      parent.insertBefore(mic, send ?? null)
    }
    inject()
    const observer = new MutationObserver(inject)
    observer.observe(document.body, { childList: true, subtree: true })
    onCleanup(() => observer.disconnect())
  })
  return null
}
export function CallButton(props: { lastReply: () => string; onError?: (message: string) => void }) {
  const [on, setOn] = createSignal((typeof localStorage !== "undefined" && localStorage.getItem("aporia.call")) === "on")
  let spoken = ""

  const listenAgain = () => {
    if (!on()) return
    void startRecording(() => { /* reply effect will speak */ }, true).catch((e) => props.onError?.(String(e)))
  }

  createEffect(() => {
    if (!on()) return
    // Track the latest assistant reply; when it changes, speak it, then listen again.
    const text = props.lastReply()
    if (!text || text === spoken) return
    spoken = text
    void speak(text)
      .then(() => listenAgain())
      .catch((e) => props.onError?.(e instanceof Error ? e.message : String(e)))
  })

  const toggle = () => {
    const next = !on()
    setOn(next)
    try { localStorage.setItem("aporia.call", next ? "on" : "off") } catch { /* ignore */ }
    if (next) listenAgain()
    else stopRecording()
  }

  return (
    <button
      type="button"
      class="ap-icon-btn"
      data-aporia-call=""
      title={on() ? "Hang up" : "Voice call"}
      aria-label="Voice call"
      style={on() ? { color: "#f87171" } : undefined}
      onClick={toggle}
    >
      {on() ? <span innerHTML={STOP_SVG} /> : <Icon name="phone" size={16} />}
    </button>
  )
}
