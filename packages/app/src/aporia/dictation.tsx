// APORIA: push-to-talk dictation. Records from the mic, resamples to 16 kHz mono,
// transcribes LOCALLY (Whisper via the desktop aporia:stt bridge), and inserts the text.
import { createSignal } from "solid-js"

const bridge = () => (globalThis as any).electron?.aporia as
  | { stt?: (input: { pcm: number[] }) => Promise<{ text?: string }> }
  | undefined

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
  const rendered = await offline.startRendering()
  return rendered.getChannelData(0)
}

/** Append text to the stock composer if present, else return it to the caller. */
function insertIntoComposer(text: string) {
  const el = document.querySelector<HTMLTextAreaElement>('[data-component="composer"] textarea')
  if (!el) return false
  el.value = el.value ? `${el.value} ${text}` : text
  el.dispatchEvent(new InputEvent("input", { bubbles: true }))
  el.focus()
  return true
}

export function MicButton(props: { class?: string }) {
  const [state, setState] = createSignal<"idle" | "rec" | "busy">("idle")
  let rec: MediaRecorder | undefined
  let chunks: Blob[] = []

  const stop = () => rec?.stop()

  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia) return
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    chunks = []
    rec = new MediaRecorder(stream)
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop())
      setState("busy")
      try {
        const blob = new Blob(chunks, { type: chunks[0]?.type || "audio/webm" })
        const pcm = await decodeToPcm(blob)
        const res = await bridge()?.stt?.({ pcm: Array.from(pcm) })
        const text = (res?.text ?? "").trim()
        if (text && !insertIntoComposer(text)) {
          try { await navigator.clipboard.writeText(text) } catch { /* ignore */ }
        }
      } catch (error) {
        console.error("aporia stt", error)
      } finally {
        setState("idle")
      }
    }
    rec.start()
    setState("rec")
  }

  return (
    <button
      type="button"
      class={props.class ?? "ap-icon-btn"}
      title={state() === "rec" ? "Stop and transcribe" : state() === "busy" ? "Transcribing…" : "Dictate"}
      aria-label="Dictate"
      disabled={state() === "busy"}
      onClick={() => (state() === "rec" ? stop() : state() === "idle" ? void start() : undefined)}
    >
      {state() === "rec" ? "⏹" : state() === "busy" ? "…" : "🎤"}
    </button>
  )
}
