// APORIA: local, offline text-to-speech (Kokoro-82M via kokoro-js / ONNX).
// Engine is Kokoro; the PRODUCT exposes these as Aporia voices (Nova, Atlas, Iris, ...).
// Free + local: no API key, no per-use cost. Model (~80 MB) downloads once, then cached.
import { ipcMain } from "electron"

export const AporiaTtsChannel = "aporia:tts"

// Aporia-branded voice -> Kokoro voice id (female af_*, male am_*, UK bf_*/bm_*).
export const APORIA_VOICES: Record<string, { id: string; label: string; hint: string }> = {
  nova: { id: "af_heart", label: "Nova", hint: "Warm, friendly (default)" },
  iris: { id: "af_bella", label: "Iris", hint: "Bright, energetic" },
  sable: { id: "af_nicole", label: "Sable", hint: "Calm, low" },
  atlas: { id: "am_michael", label: "Atlas", hint: "Steady, professional" },
  orion: { id: "am_adam", label: "Orion", hint: "Deep, confident" },
  june: { id: "bf_emma", label: "June", hint: "British, gentle" },
  regent: { id: "bm_george", label: "Regent", hint: "British, formal" },
}
const DEFAULT_VOICE = "nova"

type Model = {
  generate: (text: string, opts: { voice: string }) => Promise<{
    toWav?: () => Uint8Array | ArrayBuffer | undefined
    toBlob?: () => Promise<Blob>
    audio?: Float32Array
    sampling_rate?: number
  }>
}
let modelPromise: Promise<Model> | undefined

async function loadModel(): Promise<Model> {
  if (!modelPromise) {
    modelPromise = (async () => {
      const mod: any = await import("kokoro-js")
      const KokoroTTS = mod.KokoroTTS ?? mod.default?.KokoroTTS
      return KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", { dtype: "q8", device: "cpu" })
    })()
    modelPromise.catch(() => (modelPromise = undefined)) // allow retry after a failed load
  }
  return modelPromise
}

export async function synthesize(text: string, voice?: string): Promise<{ wav: string; voice: string }> {
  const clean = String(text || "").trim()
  if (!clean) throw new Error("Nothing to speak")
  const key = (voice || DEFAULT_VOICE).toLowerCase()
  const v = APORIA_VOICES[key] || APORIA_VOICES[DEFAULT_VOICE]
  const tts = await loadModel()
  const audio = await tts.generate(clean.slice(0, 5000), { voice: v.id })

  // kokoro-js RawAudio: prefer toBlob() (reliable); fall back to toWav()/raw PCM.
  let bytes: Uint8Array | undefined
  if (typeof audio.toBlob === "function") {
    const blob = await audio.toBlob()
    bytes = new Uint8Array(await blob.arrayBuffer())
  }
  if ((!bytes || bytes.length === 0) && typeof audio.toWav === "function") {
    const wav = audio.toWav()
    if (wav) bytes = wav instanceof Uint8Array ? wav : new Uint8Array(wav as ArrayBuffer)
  }
  if ((!bytes || bytes.length === 0) && audio.audio) bytes = encodeWav(audio.audio, audio.sampling_rate ?? 24000)
  if (!bytes || bytes.length === 0) throw new Error("TTS produced no audio")

  return { wav: Buffer.from(bytes).toString("base64"), voice: key }
}

/** Minimal 16-bit PCM mono WAV encoder (fallback when the library returns raw PCM). */
function encodeWav(samples: Float32Array, rate: number): Uint8Array {
  const buf = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buf)
  const str = (off: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)) }
  str(0, "RIFF"); view.setUint32(4, 36 + samples.length * 2, true); str(8, "WAVE")
  str(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true)
  str(36, "data"); view.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return new Uint8Array(buf)
}

export function registerAporiaTtsHandler() {
  ipcMain.handle(AporiaTtsChannel, async (_event, input: { text?: string; voice?: string }) => synthesize(input?.text || "", input?.voice))
  ipcMain.handle("aporia:tts-voices", () => Object.entries(APORIA_VOICES).map(([key, v]) => ({ key, label: v.label, hint: v.hint })))
}
