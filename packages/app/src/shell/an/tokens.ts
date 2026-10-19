/** AN black/gold tokens from approved design packet (v11 HTML + visual style PNG).
 *  Source of truth for Stage 4 shell CSS variables. Not Lagoon Night / Marrs Tide. */

/** Product vs company (Ali 2026-10-19): app = Aporetic; company/brand = Aporia Nous. */
export const AN_PRODUCT_NAME = "Aporetic" as const
/** Ownership byline for about/mark surfaces only — do not spam chrome. */
export const AN_PRODUCT_BYLINE = "by Aporia Nous" as const

export const AN_DESIGN_SOURCE = {
  html: "aporetic-design-reference/aporetic-an-exact-flow-v11-selfcontained.html",
  style: "aporetic-design-reference/original-AN-visual-style.png",
  normal: "aporetic-design-reference/original-normal.png",
} as const

/** Exact CSS custom-property values mirrored from the approved packet.
 *  Panel translucency: ice/glass feel (Ali 2026-10-19) — still black/gold AN. */
export const AN_TOKENS = {
  gold: "#f0c66d",
  goldDeep: "#d79a2e",
  goldSoft: "#e5c57f",
  goldMuted: "#cfac62",
  green: "#3be78c",
  ink: "#03070b",
  void: "#020509",
  panel: "rgba(6, 14, 22, 0.44)",
  panelRaised: "rgba(8, 16, 24, 0.52)",
  panelGlass: "rgba(10, 20, 30, 0.32)",
  border: "rgba(240, 198, 109, 0.26)",
  borderSoft: "rgba(240, 198, 109, 0.12)",
  borderStrong: "rgba(240, 198, 109, 0.42)",
  glow: "rgba(231, 154, 29, 0.22)",
  text: "#f0e6d2",
  textMuted: "#cfac62",
  danger: "#f87171",
  themeId: "an",
  /** Design feel authority — frictionless ice/glass; not matte plastic / OpenCode chrome. */
  feel: "frictionless-ice-glass",
  /** Session/composer floating dock motion (AP-STAGE4-09). */
  easeDock: "320ms cubic-bezier(0.22, 1, 0.36, 1)",
} as const

/** Layout flags for approved three-state chrome (not Stage 5 four-mode). */
export type AnShellLayout = {
  mode: AnShellMode
  /** Attention / live-computer rail never collapses to width 0. */
  attentionAlwaysOn: true
  /** Computer View: live surface beside chat (watch only — no input grant). */
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
  /**
   * AP-STAGE4-12: AnShell owns composer dock presentation (void/gold ice).
   * Send/session wiring stays on core Prompt — no new polling layers.
   */
  ownedAttr: 'data-an-owned="composer"' as const,
  ownedValue: "composer" as const,
} as const

/**
 * AP-STAGE4-4E: Contraptions mount under AnShell (not classic AporiaRightPanel).
 * User-facing brand + always-on category gloss; Redstone Easter-egg title only.
 * Engine IDs stay flow_* / AutomationsTab / FlowsSection.
 */
export const AN_CONTRAPTIONS_SURFACE = {
  part: "contraptions",
  partAttr: 'data-an-part="contraptions"',
  navId: "contraptions",
  label: "Contraptions",
  subtitle: "Automations & integrations",
  redstoneTitle: "redstone stays the private joke",
} as const

/**
 * AP-BF-01: Computer View consent/attach surface (browser-first, not VM).
 * Re-export markers from computer-attach for shell token discoverability.
 */
export { AN_COMPUTER_ATTACH_SURFACE } from "./computer-attach"

/** Three-state framing from approved mockups — Stage 5 four-mode work stays separate. */
export const AN_SHELL_MODES = ["conversation", "view", "takeover"] as const
export type AnShellMode = (typeof AN_SHELL_MODES)[number]

export const AN_SHELL_MODE_LABEL: Record<AnShellMode, string> = {
  conversation: "Conversation",
  /** User-facing Computer View; mode id stays `view` (Stage 5 four-mode still OPEN). */
  view: "Computer View",
  takeover: "Takeover",
}

export function isAnShellMode(value: string): value is AnShellMode {
  return (AN_SHELL_MODES as readonly string[]).includes(value)
}

export function anShellModeLabel(mode: AnShellMode): string {
  return AN_SHELL_MODE_LABEL[mode]
}

/**
 * Bot presence (Ali design): listening / thinking / speaking / working / waiting.
 * `unknown` when no honest signal — never invent companion mood.
 */
export const AN_PRESENCE = ["listening", "thinking", "speaking", "working", "waiting", "unknown"] as const
export type AnPresence = (typeof AN_PRESENCE)[number]

export const AN_PRESENCE_LABEL: Record<AnPresence, string> = {
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Speaking",
  working: "Working",
  waiting: "Waiting",
  unknown: "Unknown",
}

export function anPresenceLabel(presence: AnPresence): string {
  return AN_PRESENCE_LABEL[presence]
}

export function presenceDotClass(presence: AnPresence): string {
  switch (presence) {
    case "listening":
      return "an-presence an-presence-listening"
    case "thinking":
      return "an-presence an-presence-thinking"
    case "speaking":
      return "an-presence an-presence-speaking"
    case "working":
      return "an-presence an-presence-working"
    case "waiting":
      return "an-presence an-presence-waiting"
    case "unknown":
      return "an-presence an-presence-unknown"
    default: {
      const _exhaustive: never = presence
      void _exhaustive
      return "an-presence an-presence-unknown"
    }
  }
}
