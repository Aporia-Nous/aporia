/** Approved AN card language (original-AN-visual-style / original-normal). */

export const AN_CARD_TYPES = ["task", "approval", "decision", "proof", "computer", "team"] as const
export type AnCardType = (typeof AN_CARD_TYPES)[number]

export const AN_CARD_LABEL: Record<AnCardType, string> = {
  task: "Task",
  approval: "Approval",
  decision: "Decision",
  proof: "Proof",
  computer: "Computer",
  team: "Team",
}

export type AnCardActionVariant = "primary" | "secondary" | "ghost"

export type AnCardAction = {
  id: string
  label: string
  variant?: AnCardActionVariant
  /** Chrome-only when backend is missing — never claim a live side effect. */
  stub?: boolean
  stubReason?: string
}

export type AnCardStatusTone = "neutral" | "ok" | "warn" | "danger"

export type AnCardSource =
  | "attention"
  | "permission"
  | "question"
  | "session"
  | "computer"
  | "roster"
  | "tool"
  | "edit"
  | "message"

/**
 * Option C event densities (not shell modes).
 * Status = quiet compact Computer entry; Inline = denser Live preview in Conversation.
 */
export const AN_COMPUTER_EVENT_DENSITIES = ["status", "inline"] as const
export type AnComputerEventDensity = (typeof AN_COMPUTER_EVENT_DENSITIES)[number]

export type AnCardPreviewKind = "url" | "srcdoc" | "pending" | "none"

export type AnCardModel = {
  id: string
  type: AnCardType
  title: string
  detail?: string
  status?: string
  statusTone?: AnCardStatusTone
  meta?: string
  author?: string
  priority?: string
  /** Only when real counts exist — omit otherwise. */
  progress?: { current: number; total: number }
  tags?: string[]
  checklist?: Array<{ label: string; done?: boolean }>
  members?: Array<{ id: string; name: string; avatar?: string }>
  actions?: AnCardAction[]
  source?: AnCardSource
  /** AP-STAGE5-03: Status vs Inline for Computer cards. */
  eventDensity?: AnComputerEventDensity
  /** Inline watch-only preview URL when feed has a navigable src. */
  previewUrl?: string
  previewKind?: AnCardPreviewKind
  previewLabel?: string
}

export function isAnCardType(value: string): value is AnCardType {
  return (AN_CARD_TYPES as readonly string[]).includes(value)
}

export function anCardLabel(type: AnCardType): string {
  return AN_CARD_LABEL[type]
}
