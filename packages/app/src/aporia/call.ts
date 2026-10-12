// APORIA: real hands-free voice call engine.
// Unlike push-to-talk dictation, this keeps the mic open and uses voice-activity
// detection (VAD) to auto-detect when you start and stop speaking, then it
// transcribes, sends, speaks the reply, and listens again — no button presses.
// Free + local: Whisper in, Kokoro out. Audio never leaves the machine.
import { createSignal } from "solid-js"
import { insertIntoComposer, sendPrompt } from "./dictation"

export type CallState = "idle" | "connecting" | "listening" | "thinking" | "speaking" | "error"
export type CallLine = { who: "you" | "agent"; text: string; at: number }

// ---- reactive state (module singleton, so the loop survives tab switches) ----
const [state, setState] = createSignal<CallState>("idle")
const [level, setLevel] = createSignal(0) // 0..1 mic loudness, for the meter
const [lines, setLines] = createSignal<CallLine[]>([])
const [muted, setMuted] = createSignal(false)
const [error, setError] = createSignal("")
// Bumped when something wants the Call tab shown (composer phone icon / start).
const [callUiRequest, setCallUiRequest] = createSignal(0)

export const call = {
  state,
  level,
  lines,
  muted,
  error,
  uiRequest: callUiRequest,
  get active() {
    const s = state()
    return s === "connecting" || s === "listening" || s === "thinking" || s === "speaking"
  },
}

// ---- engine internals ----
const TARGET_RATE = 16000
const SPEECH_RMS = 0.015 // above this = you're talking
const SILENCE_MS = 750 // this long below threshold = you stopped
const MAX_UTTER_MS = 20000 // hard cap on a single spoken turn
const PREROLL_BLOCKS = 6 // keep ~0.5s before speech so the first word isn't clipped
const MIN_UTTER_SAMPLES = 1600 // < 0.1s of audio: ignore

let stream: MediaStream | undefined
let ctx: AudioContext | undefined
let proc: ScriptProcessorNode | undefined
let sink: GainNode | undefined
let speakingEl: HTMLAudioElement | undefined
let voiceGetter: (() => string | undefined) | undefined
// How a transcribed turn is sent. When set, the words go to the agent WITHOUT
// appearing as a chat prompt (the app's synthetic-input channel).
let sendHandler: ((text: string) => void | Promise<void>) | undefined

let wantListening = false
let busy = false // true while transcribing / thinking / speaking — don't capture
let capturing = false
let silenceMs = 0
let utterMs = 0
let blockMs = 0
let utter: Float32Array[] = []
let preroll: Float32Array[] = []

const NOISE = /^(you|thank you\.?|thanks?( for watching| for watching\.)?\.?|\[blank_audio\]|\(silence\)|\s*[.,!?]*\s*)$/i

function isNoise(text: string) {
  return !text || NOISE.test(text) || text.replace(/[^\p{L}\p{N}]/gu, "").length < 2
}

function resample(input: Float32Array, from: number, to: number): Float32Array {
  if (from === to || input.length === 0) return input
  const ratio = from / to
  const out = new Float32Array(Math.max(1, Math.floor(input.length / ratio)))
  for (let i = 0; i < out.length; i++) {
    const pos = i * ratio
    const i0 = Math.floor(pos)
    const i1 = Math.min(i0 + 1, input.length - 1)
    const frac = pos - i0
    out[i] = input[i0] * (1 - frac) + input[i1] * frac
  }
  return out
}

function concat(chunks: Float32Array[]): Float32Array {
  let total = 0
  for (const c of chunks) total += c.length
  const out = new Float32Array(total)
  let at = 0
  for (const c of chunks) { out.set(c, at); at += c.length }
  return out
}

function onAudio(event: AudioProcessingEvent) {
  const input = event.inputBuffer.getChannelData(0)
  let sum = 0
  for (let i = 0; i < input.length; i++) sum += input[i] * input[i]
  const rms = Math.sqrt(sum / input.length)
  setLevel(Math.min(1, rms * 7))

  if (!wantListening || busy || muted()) return

  const block = new Float32Array(input)
  if (!capturing) {
    preroll.push(block)
    if (preroll.length > PREROLL_BLOCKS) preroll.shift()
    if (rms > SPEECH_RMS) {
      capturing = true
      silenceMs = 0
      utterMs = 0
      utter = preroll.slice()
      preroll = []
    }
    return
  }

  utter.push(block)
  utterMs += blockMs
  if (rms > SPEECH_RMS) silenceMs = 0
  else silenceMs += blockMs
  if (silenceMs > SILENCE_MS || utterMs > MAX_UTTER_MS) {
    capturing = false
    const turn = utter
    utter = []
    void finishTurn(turn)
  }
}

async function finishTurn(chunks: Float32Array[]) {
  busy = true
  setState("thinking")
  try {
    const raw = concat(chunks)
    if (raw.length < MIN_UTTER_SAMPLES) return resumeListening()
    const pcm = resample(raw, ctx?.sampleRate ?? TARGET_RATE, TARGET_RATE)
    const res = await (globalThis as any).electron?.aporia?.stt?.({ pcm: Array.from(pcm) })
    const text = String(res?.text ?? "").trim()
    if (isNoise(text)) return resumeListening()
    setLines((l) => [...l, { who: "you", text, at: Date.now() }])
    if (sendHandler) {
      // Hidden send: the agent sees the spoken words, the chat does not show them as a prompt.
      await Promise.resolve(sendHandler(text)).catch(() => {})
    } else if (insertIntoComposer(text)) {
      sendPrompt()
    } else {
      try { await navigator.clipboard.writeText(text) } catch { /* ignore */ }
      return resumeListening()
    }
    // Stay in "thinking" until the reply arrives and speak() runs.
    // Safety net: if no reply lands, resume listening so the call never stalls.
    setTimeout(() => { if (busy && state() === "thinking") resumeListening() }, 60000)
  } catch (e) {
    setError(e instanceof Error ? e.message : String(e))
    resumeListening()
  }
}

function resumeListening() {
  if (!wantListening) { busy = false; setState("idle"); return }
  busy = false
  capturing = false
  utter = []
  preroll = []
  setState("listening")
}

async function speak(text: string, voice?: string) {
  const clean = String(text ?? "").trim()
  if (!clean) return resumeListening()
  busy = true
  setState("speaking")
  setLines((l) => [...l, { who: "agent", text: clean, at: Date.now() }])
  try {
    const res = await (globalThis as any).electron?.aporia?.tts?.({ text: clean, voice })
    const bytes = Uint8Array.from(atob(res?.wav ?? ""), (c) => c.charCodeAt(0))
    const url = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }))
    await new Promise<void>((resolve, reject) => {
      const audio = new Audio(url)
      speakingEl = audio
      audio.onended = () => { URL.revokeObjectURL(url); speakingEl = undefined; resolve() }
      audio.onerror = () => { URL.revokeObjectURL(url); speakingEl = undefined; reject(new Error("audio playback failed")) }
      audio.play().then(undefined, (e) => { URL.revokeObjectURL(url); speakingEl = undefined; reject(e) })
    })
  } catch (e) {
    setError(e instanceof Error ? e.message : String(e))
  }
  resumeListening()
}

async function start() {
  if (wantListening) return
  wantListening = true
  setError("")
  setLines([])
  persisted = false
  setState("connecting")
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    })
    ctx = new AudioContext()
    await ctx.resume().catch(() => {})
    const source = ctx.createMediaStreamSource(stream)
    proc = ctx.createScriptProcessor(4096, 1, 1)
    blockMs = (proc.bufferSize / ctx.sampleRate) * 1000
    sink = ctx.createGain()
    sink.gain.value = 0 // run the processor without echoing to speakers
    source.connect(proc)
    proc.connect(sink)
    sink.connect(ctx.destination)
    proc.onaudioprocess = onAudio
  } catch (e) {
    wantListening = false
    setState("error")
    setError(e instanceof Error ? e.message : String(e))
    return
  }
  busy = false
  capturing = false
  utter = []
  preroll = []
  setState("listening")
}

function hangup() {
  wantListening = false
  busy = false
  capturing = false
  utter = []
  preroll = []
  try { if (proc) proc.onaudioprocess = null } catch { /* ignore */ }
  try { proc?.disconnect() } catch { /* ignore */ }
  try { sink?.disconnect() } catch { /* ignore */ }
  try { stream?.getTracks().forEach((t) => t.stop()) } catch { /* ignore */ }
  try { ctx?.close() } catch { /* ignore */ }
  stream = ctx = proc = sink = undefined
  try { speakingEl?.pause() } catch { /* ignore */ }
  speakingEl = undefined
  persistCall()
  setState("idle")
  setLevel(0)
}

function toggleMute() {
  setMuted((m) => !m)
  if (muted()) setLevel(0)
}

function clear() {
  setLines([])
  setError("")
}

// ---- saved call transcripts (per session, so each call is kept but not shown inline) ----
export type SavedCall = { at: number; ms: number; lines: CallLine[] }
const [historyNonce, setHistoryNonce] = createSignal(0)
let currentSession: string | undefined
let persisted = false

export function setCallSession(id?: string) { currentSession = id }
export function callsVersion() { return historyNonce() }
function historyKey(id: string) { return `aporia.calls.${id}` }
export function loadCalls(id?: string): SavedCall[] {
  const sid = id ?? currentSession
  if (!sid) return []
  try { return JSON.parse(localStorage.getItem(historyKey(sid)) ?? "[]") as SavedCall[] } catch { return [] }
}
function persistCall() {
  const l = lines()
  if (!currentSession || persisted || l.length < 2) return
  persisted = true
  const started = l[0]?.at ?? Date.now()
  const rec: SavedCall = { at: started, ms: Math.max(0, Date.now() - started), lines: l }
  try {
    const all = loadCalls(currentSession)
    all.push(rec)
    localStorage.setItem(historyKey(currentSession), JSON.stringify(all.slice(-100)))
    setHistoryNonce((n) => n + 1)
  } catch { /* ignore */ }
}

// ---- public API ----
export function startVoiceCall() {
  setCallUiRequest((n) => n + 1)
  if (!wantListening) void start()
}
export function hangUpCall() { hangup() }
export function toggleCallMute() { toggleMute() }
export function clearCallLog() { clear() }
export function setVoiceGetter(fn: () => string | undefined) { voiceGetter = fn }
export function voiceFor() { return voiceGetter?.() }
/** Route spoken turns through a hidden channel (no visible chat prompt). */
export function setCallSender(fn: (text: string) => void | Promise<void>) { sendHandler = fn }

export function speakReply(text: string, voice?: string) {
  return speak(text, voice ?? voiceGetter?.())
}

// Composer phone icon / anywhere can drive the call without importing this module's internals.
if (typeof window !== "undefined") {
  window.addEventListener("aporia:start-call", () => startVoiceCall())
  window.addEventListener("aporia:hangup-call", () => hangup())
}

export function openCallUi() { setCallUiRequest((n) => n + 1) }

// Dev diagnostics: inspect/drive the call from the DevTools console (no effect in normal use).
;(globalThis as any).__aporiaCall = {
  get state() { return state() },
  get lines() { return lines() },
  get error() { return error() },
  get active() { return call.active },
  get muted() { return muted() },
  start: () => startVoiceCall(),
  hangup: () => hangup(),
  send: (t: string) => sendHandler?.(t),
  speak: (t: string) => speak(t),
}
