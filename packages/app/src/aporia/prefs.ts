// APORIA: local UI preferences for the Aporetic layout. Stored in localStorage; never holds secrets.
import { createSignal } from "solid-js"

const LAYOUT_KEY = "aporia.layout.enabled"
const COMPUTER_KEY = "aporia.computer.url"
const BROWSER_KEY = "aporia.browser.url"

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
// Aporetic in-app browser viewer (replaces the noVNC VM "Computer").
const [browserUrl, setBrowserUrlSignal] = createSignal(read(BROWSER_KEY) ?? "http://localhost:3020")
const [sessionFilter, setSessionFilter] = createSignal("")
const RIGHT_KEY = "aporia.right.open"
const [rightPanelOpen, setRightPanelOpenSignal] = createSignal(read(RIGHT_KEY) !== "off")
const LEFT_KEY = "aporia.left.open"
const [leftRailOpen, setLeftRailOpenSignal] = createSignal(read(LEFT_KEY) !== "off")
// Only an explicit "off" disables these; missing or imported values mean ON.
const THEME_KEY = "aporia.theme.enabled"
const [aporiaTheme, setAporiaThemeSignal] = createSignal(read(THEME_KEY) !== "off")

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
  browserUrl,
  setBrowserUrl(value: string) {
    const trimmed = value.trim()
    write(BROWSER_KEY, trimmed || undefined)
    setBrowserUrlSignal(trimmed)
  },
  sessionFilter,
  setSessionFilter,
  rightPanelOpen,
  setRightPanelOpen(value: boolean) {
    write(RIGHT_KEY, value ? "on" : "off")
    setRightPanelOpenSignal(value)
  },
  leftRailOpen,
  setLeftRailOpen(value: boolean) {
    write(LEFT_KEY, value ? "on" : "off")
    setLeftRailOpenSignal(value)
  },
  /** Aporetic theme is sticky: enforced on every launch unless the user explicitly opts out. */
  aporiaTheme,
  setAporiaTheme(value: boolean) {
    write(THEME_KEY, value ? "on" : "off")
    setAporiaThemeSignal(value)
  },

}
