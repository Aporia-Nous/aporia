// APORIA: local voice — push-to-talk dictation (Whisper) + speak (Kokoro) + call mode loop.
import { createEffect, createSignal, onCleanup } from "solid-js"

type Bridge = {
  stt?: (input: { pcm: number[] }) => Promise<{ text?: string }>
  tts?: (input: { text: string; voice?: string }) => Promise<{ wav: string }>
}
const bridge = () => (globalThis as any).electron?.aporia as Bridge | undefined

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
  const el = document.querySelector<HTMLTextAreaElement>('[data-component="composer"] textarea')
  if (!el) return false
  el.value = el.value ? `${el.value} ${text}` : text
  el.dispatchEvent(new InputEvent("input", { bubbles: true }))
  el.focus()
  return true
}

function submitComposer() {
  const el = document.querySelector<HTMLTextAreaElement>('[data-component="composer"] textarea')
  el?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
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
      {state() === "rec" ? "⏹" : state() === "busy" ? "…" : "🎤"}
    </button>
  )
}

/** Injects a dictation mic into the stock composer toolbar (left of Send). No stock code touched. */
export function ComposerMic() {
  createEffect(() => {
    const inject = () => {
      const composer = document.querySelector<HTMLElement>('[data-component="composer"]')
      if (!composer || composer.querySelector("[data-aporia-mic]")) return
      const btn = document.createElement("button")
      btn.type = "button"
      btn.setAttribute("data-aporia-mic", "")
      btn.className = "ap-icon-btn ap-mic-inline"
      btn.title = "Dictate"
      btn.textContent = "🎤"
      let recording = false
      btn.onclick = () => {
        if (recording) { stopRecording(); recording = false; btn.textContent = "🎤"; return }
        recording = true
        btn.textContent = "⏹"
        void startRecording(() => { recording = false; btn.textContent = "🎤" }, false).catch(() => { recording = false; btn.textContent = "🎤" })
      }
      const buttons = [...composer.querySelectorAll("button")]
      const send = buttons.find((b) => b.type === "submit") ?? buttons[buttons.length - 1]
      if (send?.parentElement) send.parentElement.insertBefore(btn, send)
      else composer.appendChild(btn)
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
      title={on() ? "Hang up" : "Voice call"}
      aria-label="Voice call"
      style={on() ? { color: "#f87171" } : undefined}
      onClick={toggle}
    >
      {on() ? "⏹" : "📞"}
    </button>
  )
}
