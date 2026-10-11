// APORIA: local UI preferences for the Aporia layout. Stored in localStorage; never holds secrets.
import { createSignal } from "solid-js"

const LAYOUT_KEY = "aporia.layout.enabled"
const COMPUTER_KEY = "aporia.computer.url"

function read(key: string) {
  try {
    return globalThis.localStorage?.getItem(key) ?? undefined
  } catch {
    return undefined
  }
}

function write(key: string, value: string | undefined) {
  try {
    if (value === undefined) globalThis.localStorage?.removeItem(key)
    else globalThis.localStorage?.setItem(key, value)
  } catch {
    // storage unavailable: keep the in-memory value only
  }
}

// Default ON in this fork.
const [layoutEnabled, setLayoutEnabledSignal] = createSignal(read(LAYOUT_KEY) !== "off")
const [computerUrl, setComputerUrlSignal] = createSignal(read(COMPUTER_KEY) ?? "")
const [sessionFilter, setSessionFilter] = createSignal("")

export const aporiaPrefs = {
  layoutEnabled,
  setLayoutEnabled(value: boolean) {
    write(LAYOUT_KEY, value ? "on" : "off")
    setLayoutEnabledSignal(value)
  },
  computerUrl,
  setComputerUrl(value: string) {
    const trimmed = value.trim()
    write(COMPUTER_KEY, trimmed || undefined)
    setComputerUrlSignal(trimmed)
  },
  sessionFilter,
  setSessionFilter,
  /** True exactly once, and only when the user has never chosen a theme. */
  claimThemeDefault() {
    if (read("aporia.theme.defaulted")) return false
    write("aporia.theme.defaulted", "1")
    return !read("opencode-theme-id")
  },
}
