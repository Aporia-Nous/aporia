/**
 * AP-STAGE4-13: AN companion composer chrome under AnShell-owned dock.
 * Hides residual OpenCode product strip (model/agent chips + mic/call);
 * keeps gold send + STAGE4-12 ownership; ice-glass AN placeholder.
 */

import { AN_COMPOSER_SURFACE } from "./tokens"

/** Friendly bot label for “Message {bot}…” — strips aporia- prefix, title-cases slug. */
export function anComposerBotLabel(agentOrName?: string | null): string {
  const raw = agentOrName?.trim()
  if (!raw) return "teammate"
  const stripped = raw.replace(/^aporia[_-]*/i, "").trim() || raw
  return stripped
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

/** AN companion placeholder — not OpenCode “Ask anything, / for commands…”. */
export function anComposerPlaceholder(agentOrName?: string | null): string {
  const bot = anComposerBotLabel(agentOrName)
  return AN_COMPOSER_SURFACE.placeholderTemplate.replace("{bot}", bot)
}

/** True when AnShell owns the live composer dock (STAGE4-12 marker present). */
export function isAnOwnedComposerHost(
  root: ParentNode | null | undefined = typeof document !== "undefined" ? document : null,
): boolean {
  if (!root) return false
  return (
    !!root.querySelector('[data-component="an-shell"]') &&
    !!root.querySelector('[data-an-owned="composer"]')
  )
}
