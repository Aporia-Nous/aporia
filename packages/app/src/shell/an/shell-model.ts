import { AN_SHELL_MODES, anShellLayout, isAnShellMode, type AnShellLayout, type AnShellMode } from "./tokens"
import type { AnAttentionItem, AnMissionHeader, AnNavItem, AnRosterMember } from "./types"

export type AnShellModel = {
  mode: AnShellMode
  layout: AnShellLayout
  navItems: AnNavItem[]
  roster: AnRosterMember[]
  mission: AnMissionHeader
  attention: AnAttentionItem[]
  /** Attention rail stays in the region list even when empty (always-on). */
  regions: readonly ["nav", "roster", "mission", "stream", "attention"]
  attentionAlwaysOn: true
}

/** Pure Stage 4 shell model — columns match approved AN layout; no fake presence/progress. */
export function buildAnShellModel(input: {
  mode?: string
  navItems?: AnNavItem[]
  roster?: AnRosterMember[]
  mission?: AnMissionHeader
  attention?: AnAttentionItem[]
}): AnShellModel {
  const mode: AnShellMode = input.mode && isAnShellMode(input.mode) ? input.mode : "conversation"
  const mission: AnMissionHeader = {
    title: input.mission?.title?.trim() || "Mission",
    subtitle: input.mission?.subtitle,
    pills: input.mission?.pills,
  }
  if (input.mission?.progressPercent !== undefined && Number.isFinite(input.mission.progressPercent)) {
    mission.progressPercent = Math.max(0, Math.min(100, input.mission.progressPercent))
  }
  return {
    mode,
    layout: anShellLayout(mode),
    navItems: input.navItems ?? [],
    roster: (input.roster ?? []).map((member) => ({
      ...member,
      // unknown stays unknown — never invent listening/working without real signals
      presence: member.presence,
    })),
    mission,
    attention: input.attention ?? [],
    regions: ["nav", "roster", "mission", "stream", "attention"],
    attentionAlwaysOn: true,
  }
}

export function assertApprovedModesOnly(): readonly AnShellMode[] {
  return AN_SHELL_MODES
}
