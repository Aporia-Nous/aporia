// APORIA: a few Lucide icons inlined as SVG (Lucide, ISC license, https://lucide.dev). No new dependency.
import type { JSX } from "solid-js"

const paths = {
  plug: "M12 22v-5 M9 8V2 M15 8V2 M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z",
  search: "M21 21l-4.34-4.34 M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z",
  x: "M18 6 6 18 M6 6l12 12",
  check: "M20 6 9 17l-5-5",
  file: "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z M14 2v4a2 2 0 0 0 2 2h4",
  folder: "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z",
  monitor: "M4 3h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z M8 21h8 M12 17v4",
  phone: "M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z",
  message: "M7.9 20A9 9 0 1 0 4 16.1L2 22Z",
  info: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z M12 16v-4 M12 8h.01",
  library: "m16 6 4 14 M12 6v14 M8 8v12 M4 4v16",
  sparkles: "M9.94 14.06 4 20 M14 4l1.5 3.5L19 9l-3.5 1.5L14 14l-1.5-3.5L9 9l3.5-1.5Z",
  gauge: "m12 14 4-4 M3.34 19a10 10 0 1 1 17.32 0",
  settings: "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
} as const

export type IconName = keyof typeof paths

export function Icon(props: { name: IconName; size?: number; class?: string; style?: JSX.CSSProperties }) {
  return (
    <svg
      class={`ap-icon ${props.class ?? ""}`}
      width={props.size ?? 16}
      height={props.size ?? 16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      style={props.style}
    >
      <path d={paths[props.name]} />
    </svg>
  )
}

export function EmptyState(props: { icon: IconName; title: string; hint?: string }) {
  return (
    <div class="ap-empty">
      <span class="ap-empty-icon">
        <Icon name={props.icon} size={20} />
      </span>
      <strong>{props.title}</strong>
      {props.hint && <span class="ap-muted ap-small">{props.hint}</span>}
    </div>
  )
}

export function Skeleton(props: { rows?: number }) {
  return (
    <div class="ap-skeleton-list" aria-busy="true" aria-label="Loading">
      {Array.from({ length: props.rows ?? 3 }, () => (
        <div class="ap-skeleton-row">
          <span class="ap-skeleton ap-skeleton-avatar" />
          <span class="ap-skeleton-lines">
            <span class="ap-skeleton" style={{ width: "62%" }} />
            <span class="ap-skeleton" style={{ width: "38%" }} />
          </span>
        </div>
      ))}
    </div>
  )
}
