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
}

export function isAnCardType(value: string): value is AnCardType {
  return (AN_CARD_TYPES as readonly string[]).includes(value)
}

export function anCardLabel(type: AnCardType): string {
  return AN_CARD_LABEL[type]
}
