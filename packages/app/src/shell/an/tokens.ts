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
 *  Panel translucency: ice/glass punch (AP-STAGE4-16) — frosted vs opaque charcoal; still AN black/gold. */
export const AN_TOKENS = {
  gold: "#f0c66d",
  goldDeep: "#d79a2e",
  goldSoft: "#e5c57f",
  goldMuted: "#cfac62",
  green: "#3be78c",
  ink: "#03070b",
  void: "#020509",
  panel: "rgba(6, 14, 22, 0.28)",
  panelRaised: "rgba(8, 16, 24, 0.36)",
  panelGlass: "rgba(10, 20, 30, 0.2)",
  iceSheen: "rgba(186, 220, 255, 0.14)",
  iceEdge: "rgba(210, 232, 255, 0.28)",
  blur: "40px",
  blurStrong: "64px",
  saturate: "1.32",
  border: "rgba(240, 198, 109, 0.28)",
  borderSoft: "rgba(240, 198, 109, 0.16)",
  borderStrong: "rgba(240, 198, 109, 0.45)",
  glow: "rgba(231, 154, 29, 0.24)",
  text: "#f0e6d2",
  textMuted: "#cfac62",
  danger: "#f87171",
  themeId: "an",
  /** Design feel authority — frictionless ice/glass; not matte plastic / OpenCode chrome. */
  feel: "frictionless-ice-glass",
  /** Session/composer floating dock motion (AP-STAGE4-09). */
  easeDock: "320ms cubic-bezier(0.22, 1, 0.36, 1)",
} as const

/**
 * AP-STAGE4-16: ice material punch — stronger blur/translucency/specular on AnShell panels.
 * Match approved AN ice-glass mockup; not OpenCode void charcoal.
 */
export const AN_ICE_MATERIAL = {
  slice: "AP-STAGE4-16",
  feel: AN_TOKENS.feel,
  panel: AN_TOKENS.panel,
  panelRaised: AN_TOKENS.panelRaised,
  panelGlass: AN_TOKENS.panelGlass,
  blur: AN_TOKENS.blur,
  blurStrong: AN_TOKENS.blurStrong,
  saturate: AN_TOKENS.saturate,
  iceSheen: AN_TOKENS.iceSheen,
  iceEdge: AN_TOKENS.iceEdge,
  /** Composer void fill + gold send must stay readable after punch. */
  keepComposerVoidGold: true,
  /** No purple/nebula AI-slop; AN black/gold only. */
  avoidPurpleNebula: true,
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
  /**
   * AP-STAGE4-13: residual OC product chrome → AN companion strip.
   * Hide model/agent chips + mic/call under owned dock; keep gold send; AN placeholder.
   */
  hideOcChips: true,
  hideMicCall: true,
  keepGoldSend: true,
  /** `{bot}` replaced by friendly teammate label (see anComposerPlaceholder). */
  placeholderTemplate: "Message {bot}…" as const,
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
 * AP-STAGE4-17: Collapsible in-app Review panel (ChatGPT/Cursor-style side surface).
 * Hosts browser / code / files / documents inside the main AnShell window — never a new Electron window.
 */
export const AN_REVIEW_TABS = ["browser", "code", "files", "documents"] as const
export type AnReviewTab = (typeof AN_REVIEW_TABS)[number]

export const AN_REVIEW_SURFACE = {
  part: "review",
  partAttr: 'data-an-part="review"',
  navId: "review",
  label: "Review",
  subtitle: "Browser · code · files · documents",
  tabs: AN_REVIEW_TABS,
  tabLabel: {
    browser: "Browser",
    code: "Code",
    files: "Files",
    documents: "Documents",
  } as const satisfies Record<AnReviewTab, string>,
  /** Prefer this panel for in-app browse/review over spawning OS windows. */
  preferInAppOverOsWindow: true,
  collapsible: true,
} as const

/**
 * AP-STAGE4-17/18/19 motion: holographic ice + companion micro-spring personality (AN brand, not Grok copy).
 * STAGE4-19 adds presence character springs + settings ice skin.
 */
export const AN_MOTION_SURFACE = {
  slice: "AP-STAGE4-19",
  feel: "holographic-ice-companion",
  depth: "jarvis-adjacent-ice-glass",
  personality: "micro-spring-companion",
  easePanel: "520ms cubic-bezier(0.16, 1, 0.3, 1)",
  easeTab: "280ms cubic-bezier(0.22, 1, 0.36, 1)",
  easeLive: "560ms cubic-bezier(0.16, 1, 0.3, 1)",
  easeHolo: "420ms cubic-bezier(0.16, 1, 0.3, 1)",
  /** Presence state transitions — springy settle (overshoot then rest). */
  easePresence: "480ms cubic-bezier(0.34, 1.45, 0.32, 1)",
  easeDock: AN_TOKENS.easeDock,
  intentionalMotions: [
    "panel-open-close",
    "review-tab-switch",
    "computer-live-attach",
    "card-enter",
    "composer-settle",
    "holo-sheen-sweep",
    "ice-depth-parallax",
    "preview-surface-settle",
    "presence-micro-spring",
    "roster-companion-aura",
    "settings-ice-settle",
  ] as const,
  continuousLight: true,
  avoidPurpleNebula: true,
  avoidCreamSerif: true,
  avoidBroadsheet: true,
} as const

/**
 * AP-STAGE4-19: presence character / micro-spring personality within AN ice-glass (Grok-bot-class feel, not copy).
 */
export const AN_PRESENCE_PERSONALITY = {
  slice: "AP-STAGE4-19",
  feel: "micro-spring-companion",
  brand: "an-ice-glass",
  notGrokCopy: true,
  states: ["listening", "thinking", "speaking", "working", "waiting"] as const,
  markers: {
    personality: "stage4-19",
    selectedAura: "an-roster-companion-aura",
  },
} as const

/**
 * AP-STAGE4-18/19: Review Code/Documents bind + fuller document preview path.
 */
export const AN_REVIEW_CONTENT_SURFACE = {
  slice: "AP-STAGE4-19",
  codePart: "review-code-editor",
  documentPart: "review-document-preview",
  codeBodyPart: "review-code-body",
  documentBodyPart: "review-document-body",
  bindFromWorkspaceRead: true,
  emptyShellsForbidden: true,
  /** Fuller MD (fences/tables/quotes) + CSV table; docx text extract free-path; xlsx/pptx residual. */
  fullerDocuments: true,
  docxTextExtract: true,
  officeBinaryResidual: true,
} as const

/**
 * AP-ENGINE-PORT-03: session shell marker — dual-sync shrink + single session-event writer (with E21).
 * Settings host keeps AN_SETTINGS_SURFACE.enginePort = "02".
 */
export const AN_ENGINE_PORT = "03" as const

/**
 * AP-STAGE4-19 skin → AP-ENGINE-PORT-02 native AN Settings host (EnginePort; no OC Settings React).
 */
export const AN_SETTINGS_SURFACE = {
  slice: "AP-ENGINE-PORT-02",
  part: "settings" as const,
  partAttr: 'data-an-part="settings"' as const,
  ownedValue: "settings" as const,
  ownedAttr: 'data-an-owned="settings"' as const,
  themeAttr: 'data-an-theme="an"' as const,
  enginePort: "02" as const,
  feel: AN_TOKENS.feel,
  hideOcProductChrome: true,
  dropOcSettingsReactImport: true,
  aporeticAbout: true,
  opencodeFinePrintOnly: true,
  keepComposerOwnershipBar: true,
} as const

/**
 * AP-BF-01/02/03/04: Computer View consent/attach + feed + control lock + external Edge/Chrome (browser-first, not VM).
 * Re-export markers for shell token discoverability.
 */
export { AN_COMPUTER_ATTACH_SURFACE } from "./computer-attach"
export { AN_COMPUTER_FEED_SURFACE } from "./computer-feed"
export { AN_COMPUTER_CONTROL_SURFACE } from "./computer-control"
export { AN_COMPUTER_SCREENCAST_SURFACE } from "./computer-screencast"
export { AN_COMPUTER_EXTERNAL_SURFACE } from "./computer-external"

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
 * Session/call idle maps to listening. `unknown` only when no honest signal.
 */
export const AN_PRESENCE = ["listening", "thinking", "speaking", "working", "waiting", "unknown"] as const
export type AnPresence = (typeof AN_PRESENCE)[number]

export const AN_PRESENCE_LABEL: Record<AnPresence, string> = {
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Speaking",
  working: "Working",
  waiting: "Waiting",
  /** Escape only — not a design mood; use when no real signal exists. */
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
