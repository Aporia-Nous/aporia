/**
 * AP-STAGE4-19 / AP-ENGINE-PORT-02: AN Settings ownership markers + About copy.
 * PORT-02: AnShell mounts AN Settings host (settings-panel) via EnginePort —
 * does not import OC Settings React (`@/settings/shell`). OpenCode is fine print only.
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
  "data-an-engine-port"?: string
} {
  if (!shouldOwnAnSettings(anShellEnabled)) return {}
  return {
    "data-an-owned": AN_SETTINGS_SURFACE.ownedValue,
    "data-an-theme": "an",
    "data-an-settings": AN_SETTINGS_SURFACE.slice,
    "data-an-engine-port": AN_SETTINGS_SURFACE.enginePort,
  }
}

/**
 * About intro when Settings is AN-owned — Aporetic product chrome.
 * OpenCode appears only as tiny basedOn fine print (not a product wordmark).
 */
export function anSettingsAboutIntro(): {
  product: string
  byline: string
  basedOn: string
  finePrint: string
} {
  return {
    product: AN_PRODUCT_NAME,
    byline: AN_PRODUCT_BYLINE,
    basedOn: "Based on OpenCode (MIT)",
    finePrint: "Engine: OpenCode (MIT) — session, providers, tools",
  }
}

export function isAnOwnedSettingsHost(
  root: ParentNode | null | undefined = typeof document !== "undefined" ? document : null,
): boolean {
  if (!root) return false
  return !!root.querySelector(`[data-an-owned="${AN_SETTINGS_SURFACE.ownedValue}"]`)
}

/** True when AN Settings host is mounted (PORT-02 panel), not OC SettingsScreen. */
export function isAnNativeSettingsHost(
  root: ParentNode | null | undefined = typeof document !== "undefined" ? document : null,
): boolean {
  if (!root) return false
  return !!root.querySelector(`[data-an-part="${AN_SETTINGS_SURFACE.part}"]`)
}
