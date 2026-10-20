/**
 * AP-STAGE4-4F — understated Podman status card in the Bot Team roster footer.
 * Honest phases only; never shows fake Running / container counts; never auto-installs.
 */
import { Show, type JSX } from "solid-js"
import {
  AN_PODMAN_SURFACE,
  podmanDotLabel,
  podmanStatusTitle,
  type AnPodmanStatus,
} from "./podman-chrome"

export function AnPodmanChromeCard(props: {
  status: AnPodmanStatus
  onRefresh?: () => void
}): JSX.Element {
  const phase = () => props.status.phase
  const title = () => podmanStatusTitle(props.status)
  const dot = () => podmanDotLabel(props.status)
  const detail = () => props.status.detail

  return (
    <div
      class="an-podman-chrome"
      data-an-part={AN_PODMAN_SURFACE.part}
      data-an-podman={phase()}
      data-never-auto-install={AN_PODMAN_SURFACE.neverAutoInstall ? "true" : "false"}
      data-never-fake-online={AN_PODMAN_SURFACE.neverFakeOnline ? "true" : "false"}
      role="status"
      aria-live="polite"
      aria-label={`${title()}. ${detail() ?? ""}`.trim()}
      title={detail()}
    >
      <span class="an-podman-chrome-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" class="an-podman-chrome-icon" fill="none" stroke="currentColor" stroke-width="1.6">
          <rect x="4" y="7" width="16" height="11" rx="2.2" fill="rgba(240, 198, 109, 0.16)" />
          <rect x="4" y="7" width="16" height="11" rx="2.2" />
          <path d="M8 7V5.8A1.8 1.8 0 0 1 9.8 4h4.4A1.8 1.8 0 0 1 16 5.8V7" />
          <path d="M8 12h8M8 15h5" />
        </svg>
      </span>
      <span class="an-podman-chrome-copy">
        <strong>{AN_PODMAN_SURFACE.label}</strong>
        <span class="an-podman-chrome-sub">{AN_PODMAN_SURFACE.subtitle}</span>
        <span class="an-podman-chrome-state" data-phase={phase()}>
          <i class="an-podman-chrome-dot" data-phase={phase()} />
          {dot()}
        </span>
        <Show when={detail()}>
          <span class="an-podman-chrome-detail">{detail()}</span>
        </Show>
        <Show when={props.status.measured}>
          {(m) => (
            <span
              class="an-podman-chrome-measured"
              data-an-part="isolation-runtime-measure"
              data-phase={m().phase}
              data-source={m().source}
            >
              {m().line}
            </span>
          )}
        </Show>
      </span>
      <Show when={props.onRefresh && phase() !== "checking"}>
        <button
          type="button"
          class="an-podman-chrome-refresh"
          data-action="an-podman-refresh"
          title="Re-check Podman on PATH (does not install)"
          aria-label="Re-check Podman on PATH"
          onClick={() => props.onRefresh?.()}
        >
          ↻
        </button>
      </Show>
    </div>
  )
}
