/** AN black/gold tokens from approved design packet (v11 HTML + visual style PNG).
 *  Source of truth for Stage 4 shell CSS variables. Not Lagoon Night / Marrs Tide. */

export const AN_DESIGN_SOURCE = {
  html: "aporetic-design-reference/aporetic-an-exact-flow-v11-selfcontained.html",
  style: "aporetic-design-reference/original-AN-visual-style.png",
  normal: "aporetic-design-reference/original-normal.png",
} as const

/** Exact CSS custom-property values mirrored from the approved packet. */
export const AN_TOKENS = {
  gold: "#f0c66d",
  goldDeep: "#d79a2e",
  goldSoft: "#e5c57f",
  goldMuted: "#cfac62",
  green: "#3be78c",
  ink: "#03070b",
  void: "#020509",
  panel: "rgba(4, 9, 13, 0.58)",
  panelRaised: "rgba(5, 10, 14, 0.72)",
  panelGlass: "rgba(6, 12, 18, 0.42)",
  border: "rgba(240, 198, 109, 0.34)",
  borderSoft: "rgba(240, 198, 109, 0.18)",
  borderStrong: "rgba(240, 198, 109, 0.55)",
  glow: "rgba(231, 154, 29, 0.28)",
  text: "#f0e6d2",
  textMuted: "#cfac62",
  danger: "#f87171",
  themeId: "an",
} as const

/** Layout flags for approved three-state chrome (not Stage 5 four-mode). */
export type AnShellLayout = {
  mode: AnShellMode
  /** Attention / live-computer rail never collapses to width 0. */
  attentionAlwaysOn: true
  /** View: live surface beside chat (watch only — no input grant). */
  computerBeside: boolean
  /** Takeover: computer primary; Hand back / Stop are chrome affordances. */
  computerPrimary: boolean
}

export function anShellLayout(mode: AnShellMode): AnShellLayout {
  return {
    mode,
    attentionAlwaysOn: true,
    computerBeside: mode === "view",
    computerPrimary: mode === "takeover",
  }
}

export type AnTokenName = keyof typeof AN_TOKENS

/**
 * Composer surface pin when AnShell / theme `an` is active (AP-STAGE4-03).
 * Kills leftover navy/indigo OpenCode input (#121b37-class) in favor of void + gold.
 */
export const AN_COMPOSER_SURFACE = {
  fill: AN_TOKENS.void,
  send: AN_TOKENS.goldDeep,
  sendHover: AN_TOKENS.gold,
  focusGold: AN_TOKENS.gold,
  /** CSS attribute hosts that must own the composer override (AnShell frame or sticky an). */
  hosts: ['[data-component="an-shell"]', '[data-an-theme="an"]'] as const,
} as const

/** Three-state framing from approved mockups — Stage 5 four-mode work stays separate. */
export const AN_SHELL_MODES = ["conversation", "view", "takeover"] as const
export type AnShellMode = (typeof AN_SHELL_MODES)[number]

export const AN_SHELL_MODE_LABEL: Record<AnShellMode, string> = {
  conversation: "Conversation",
  view: "View",
  takeover: "Takeover",
}

export function isAnShellMode(value: string): value is AnShellMode {
  return (AN_SHELL_MODES as readonly string[]).includes(value)
}

export function anShellModeLabel(mode: AnShellMode): string {
  return AN_SHELL_MODE_LABEL[mode]
}

/** Presence for roster density — real state only; never invent online/working. */
export const AN_PRESENCE = ["online", "working", "idle", "sleeping", "unknown"] as const
export type AnPresence = (typeof AN_PRESENCE)[number]

export function presenceDotClass(presence: AnPresence): string {
  switch (presence) {
    case "online":
      return "an-presence an-presence-online"
    case "working":
      return "an-presence an-presence-working"
    case "idle":
      return "an-presence an-presence-idle"
    case "sleeping":
      return "an-presence an-presence-sleeping"
    default:
      return "an-presence an-presence-unknown"
  }
}
