// APORIA: local, offline speech-to-text (Whisper via @huggingface/transformers / ONNX).
// Free + local: no API key, no per-use cost, audio never leaves the machine.
// Model (~75 MB base) downloads once, then cached.
import { app, ipcMain } from "electron"
import path from "node:path"

export const AporiaSttChannel = "aporia:stt"

// q8 = quantized, CPU-friendly (small PC). Swap to "onnx-community/whisper-small" for more accuracy.
const ASR_MODEL = "onnx-community/whisper-base"

/**
 * Point the model cache at a writable folder and allow a first-use download. In the packaged app the
 * library's default cache resolves INSIDE app.asar (read-only, and the model is not bundled), so
 * every STT call failed with "Load model ... File doesn't exist". Cache in userData instead.
 */
export function configureModelCache(mod: any) {
  const env = mod?.env
  if (!env) return
  try { env.cacheDir = path.join(app.getPath("userData"), "models") } catch { /* keep the default */ }
  env.allowLocalModels = false
  env.allowRemoteModels = true
}

type Asr = (audio: Float32Array) => Promise<{ text?: string }>
let asrPromise: Promise<Asr> | undefined

async function loadAsr(): Promise<Asr> {
  if (!asrPromise) {
    asrPromise = (async () => {
      const mod: any = await import("@huggingface/transformers")
      configureModelCache(mod)
      const pipeline = mod.pipeline ?? mod.default?.pipeline
      const asr = await pipeline("automatic-speech-recognition", ASR_MODEL, { dtype: "q8", device: "cpu" })
      return asr as Asr
    })()
    asrPromise.catch(() => (asrPromise = undefined)) // allow retry after a failed load
  }
  return asrPromise
}

/** Transcribe 16 kHz mono PCM (Float32) to text. */
export async function transcribe(pcm: Float32Array, language?: string): Promise<{ text: string }> {
  if (!pcm || pcm.length === 0) return { text: "" }
  const asr = await loadAsr()
  const out = await asr(pcm)
  const text = (out?.text ?? "").trim()
  return { text }
}

export function registerAporiaSttHandler() {
  ipcMain.handle(AporiaSttChannel, async (_event, input: { pcm?: number[] | Float32Array; language?: string }) => {
    const raw = input?.pcm
    const pcm = raw instanceof Float32Array ? raw : Float32Array.from(raw ?? [])
    return transcribe(pcm, input?.language)
  })
}
