/**
 * AP-STAGE4-19: AN ice-glass Settings ownership (same bar as STAGE4-13 composer).
 * Skins OpenCode product Settings chrome when AnShell is enabled — not a full Settings rewrite.
 *
 * AP-ENGINE-PORT-02: drop OC Settings React import; AN Settings host via EnginePort
 * (About + Providers/Models read). PORT-01 does not expand this skin further.
 */

import { AN_PRODUCT_BYLINE, AN_PRODUCT_NAME, AN_SETTINGS_SURFACE } from "./tokens"

/** True when AnShell preference is on — Settings should wear AN ownership markers. */
export function shouldOwnAnSettings(anShellEnabled: boolean): boolean {
  return anShellEnabled === true
}

export function anSettingsOwnedAttrs(anShellEnabled: boolean): {
  "data-an-owned"?: string
  "data-an-theme"?: string
  "data-an-settings"?: string
} {
  if (!shouldOwnAnSettings(anShellEnabled)) return {}
  return {
    "data-an-owned": AN_SETTINGS_SURFACE.ownedValue,
    "data-an-theme": "an",
    "data-an-settings": AN_SETTINGS_SURFACE.slice,
  }
}

/** About intro when Settings is AN-owned — Aporetic product, not OpenCode wordmark. */
export function anSettingsAboutIntro(): { product: string; byline: string; basedOn: string } {
  return {
    product: AN_PRODUCT_NAME,
    byline: AN_PRODUCT_BYLINE,
    basedOn: "Based on OpenCode (MIT)",
  }
}

export function isAnOwnedSettingsHost(
  root: ParentNode | null | undefined = typeof document !== "undefined" ? document : null,
): boolean {
  if (!root) return false
  return !!root.querySelector(`[data-an-owned="${AN_SETTINGS_SURFACE.ownedValue}"]`)
}
