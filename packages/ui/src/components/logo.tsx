// APORIA: brand marks replaced with the Aporetic logo (OpenCode marks removed from the UI).
import { type ComponentProps } from "solid-js"
import logo from "../assets/aporia/logo.png"

const Img = (p: { class?: string; ref?: any; box: string; component: string; size: number; text?: boolean }) => (
  <svg
    ref={p.ref}
    data-component={p.component}
    classList={{ [p.class ?? ""]: !!p.class }}
    viewBox={p.box}
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <image href={logo} x="0" y="0" width={p.size} height={p.size} />
    {p.text ? (
      <text x={p.size + 8} y={p.size * 0.74} style={{ "font-size": `${p.size * 0.72}px`, "font-weight": 700, "font-family": "Inter, Segoe UI, sans-serif" }} fill="var(--icon-strong-base)">
        Aporetic
      </text>
    ) : null}
  </svg>
)

export const Mark = (props: { class?: string }) => <Img class={props.class} box="0 0 20 20" size={20} component="logo-mark" />

export const Splash = (props: Pick<ComponentProps<"svg">, "ref" | "class">) => (
  <Img ref={props.ref} class={props.class as string} box="0 0 100 100" size={100} component="logo-splash" />
)

export const Logo = (props: { class?: string }) => <Img class={props.class} box="0 0 170 42" size={42} text component="logo" />
