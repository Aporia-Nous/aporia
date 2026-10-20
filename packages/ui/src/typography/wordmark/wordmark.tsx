// APORIA: Aporetic wordmark replaces the OpenCode wordmark.
import { type ComponentProps } from "solid-js"

export function Wordmark(
  props: Pick<ComponentProps<"svg">, "class"> & { fade?: boolean; muted?: boolean; outline?: boolean },
) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 129" fill="none" classList={{ [props.class ?? ""]: !!props.class }} aria-label="Aporetic">
      <text x="360" y="104" text-anchor="middle" font-size="120" font-weight="700" letter-spacing="-4" font-family="Inter, Segoe UI, sans-serif" fill={props.muted ? "var(--icon-weak-base)" : "#60a5fa"} opacity={props.fade ? 0.6 : 1}>
        Aporetic
      </text>
    </svg>
  )
}
