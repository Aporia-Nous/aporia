// APORIA: Aporetic wordmark replaces the upstream OpenCode logo on the new-session screen.
import logo from "@/aporia/logo.png"
import "./wordmark.css"
import "@/aporia/aporia.css"

export function NewSessionWordmark() {
  return (
    <div data-component="new-session-wordmark" aria-hidden="true" class="pointer-events-none mx-auto w-full max-w-[720px]">
      <div class="ap-wordmark">
        <img src={logo} alt="" width={56} height={56} />
        <span class="ap-wordmark-text">Aporetic</span>
        <span class="ap-wordmark-sub">What should we work on?</span>
      </div>
    </div>
  )
}
