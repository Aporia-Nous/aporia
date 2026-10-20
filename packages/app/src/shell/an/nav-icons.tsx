/**
 * AP-STAGE4-4F — illustrated nav icon set (mockup-leaning fill + stroke).
 * Gold soft fill under line work; not emoji glyphs; not bare placeholders.
 */
import type { JSX } from "solid-js"

export { AN_NAV_ILLUSTRATED, isAnNavIconName, type AnNavIconName } from "./nav-illustrated"

const common = {
  viewBox: "0 0 24 24",
  fill: "none",
  "stroke-width": "1.6",
  "stroke-linecap": "round" as const,
  "stroke-linejoin": "round" as const,
  "aria-hidden": "true" as const,
  class: "an-nav-icon",
  "data-an-nav": "illustrated",
}

/** Soft gold wash — illustrated, not flat outline-only. */
const wash = "rgba(240, 198, 109, 0.22)"
const stroke = "currentColor"

export function AnNavIcon(props: { name?: string }): JSX.Element {
  switch (props.name) {
    case "home":
      return (
        <svg {...common} stroke={stroke}>
          <path
            d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z"
            fill={wash}
          />
          <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" />
        </svg>
      )
    case "missions":
      return (
        <svg {...common} stroke={stroke}>
          <rect x="4" y="4" width="7" height="7" rx="1.75" fill={wash} />
          <rect x="13" y="4" width="7" height="7" rx="1.75" fill={wash} />
          <rect x="4" y="13" width="7" height="7" rx="1.75" fill={wash} />
          <rect x="13" y="13" width="7" height="7" rx="1.75" fill={wash} />
          <rect x="4" y="4" width="7" height="7" rx="1.75" />
          <rect x="13" y="4" width="7" height="7" rx="1.75" />
          <rect x="4" y="13" width="7" height="7" rx="1.75" />
          <rect x="13" y="13" width="7" height="7" rx="1.75" />
        </svg>
      )
    case "contraptions":
      return (
        <svg {...common} stroke={stroke}>
          <circle cx="9" cy="9" r="3.1" fill={wash} />
          <circle cx="9" cy="9" r="3.1" />
          <path d="M9 3.2v1.3M9 13.5v1.3M3.9 5.4l.95.95M13.15 12.65l.95.95M2.9 9h1.3M13.8 9h1.3M3.9 12.6l.95-.95M13.15 5.35l.95-.95" />
          <circle cx="16.6" cy="15.6" r="2.35" fill={wash} />
          <circle cx="16.6" cy="15.6" r="2.35" />
          <path d="M16.6 11.5v.95M16.6 18.75v.95M13 13.1l.7.7M19.5 17.4l.7.7M12.55 15.6h.95M19.7 15.6h.95M13 18.1l.7-.7M19.5 14.1l.7-.7" />
        </svg>
      )
    case "review":
      return (
        <svg {...common} stroke={stroke}>
          <rect x="3.5" y="3.5" width="10.5" height="17" rx="1.75" fill={wash} />
          <rect x="3.5" y="3.5" width="10.5" height="17" rx="1.75" />
          <path d="M6.5 7.5h4.5M6.5 11h4.5M6.5 14.5h2.8" />
          <path d="M15.5 6.5h4.5v11H15.5" fill={wash} />
          <path d="M15.5 6.5h4.5v11H15.5" />
          <path d="M15.5 10h4.5M15.5 13.5h3.2" />
        </svg>
      )
    case "knowledge":
      return (
        <svg {...common} stroke={stroke}>
          <path
            d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v16H7.5A2.5 2.5 0 0 0 5 21.5V5.5Z"
            fill={wash}
          />
          <path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v16H7.5A2.5 2.5 0 0 0 5 21.5V5.5Z" />
          <path d="M5 21.5A2.5 2.5 0 0 1 7.5 19H19" />
          <path d="M9 8h6.5M9 11.5h5" />
        </svg>
      )
    case "settings":
      return (
        <svg {...common} stroke={stroke}>
          <circle cx="12" cy="12" r="3.25" fill={wash} />
          <circle cx="12" cy="12" r="3.25" />
          <path d="M12 2.8v2.4M12 18.8v2.4M4.4 5.9l1.7 1.7M17.9 16.4l1.7 1.7M2.8 12h2.4M18.8 12h2.4M4.4 18.1l1.7-1.7M17.9 7.6l1.7-1.7" />
          <circle cx="12" cy="12" r="7.2" opacity="0.35" />
        </svg>
      )
    default:
      return <span class="an-nav-icon-fallback">{props.name?.slice(0, 1) ?? "?"}</span>
  }
}
