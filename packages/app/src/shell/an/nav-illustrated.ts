/**
 * AP-STAGE4-4F — illustrated nav markers (no JSX; safe for tokens/unit graph).
 */
export const AN_NAV_ILLUSTRATED = {
  slice: "AP-STAGE4-4F",
  part: "nav-illustrated",
  partAttr: 'data-an-part="nav-illustrated"',
  style: "illustrated-line-fill",
  icons: ["home", "missions", "contraptions", "review", "knowledge", "settings"] as const,
} as const

export type AnNavIconName = (typeof AN_NAV_ILLUSTRATED.icons)[number]

export function isAnNavIconName(value: string | undefined): value is AnNavIconName {
  return !!value && (AN_NAV_ILLUSTRATED.icons as readonly string[]).includes(value)
}
