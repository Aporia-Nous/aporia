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

type Model = { generate: (text: string, opts: { voice: string }) => Promise<{ toWav: () => Uint8Array | ArrayBuffer }> }
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
  const wav = audio.toWav()
  const bytes = wav instanceof Uint8Array ? wav : new Uint8Array(wav as ArrayBuffer)
  return { wav: Buffer.from(bytes).toString("base64"), voice: key }
}

export function registerAporiaTtsHandler() {
  ipcMain.handle(AporiaTtsChannel, async (_event, input: { text?: string; voice?: string }) => synthesize(input?.text || "", input?.voice))
  ipcMain.handle("aporia:tts-voices", () => Object.entries(APORIA_VOICES).map(([key, v]) => ({ key, label: v.label, hint: v.hint })))
}
