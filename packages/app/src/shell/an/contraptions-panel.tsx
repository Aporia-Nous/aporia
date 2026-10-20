// AP-STAGE4-4E: Contraptions surface under AnShell (Automations & integrations).
// Reuses AutomationsTab / FlowsSection; engine IDs stay flow_*. Redstone = Easter-egg only.
import { lazy, Suspense, type JSX } from "solid-js"
import { AN_CONTRAPTIONS_SURFACE } from "./tokens"

const AutomationsTab = lazy(() =>
  import("@/aporia/automations").then((m) => ({ default: m.AutomationsTab })),
)

export type AnContraptionsPanelProps = {
  onClose?: () => void
}

export function AnContraptionsPanel(props: AnContraptionsPanelProps): JSX.Element {
  return (
    <aside
      class="an-contraptions"
      data-component="an-contraptions"
      data-an-part={AN_CONTRAPTIONS_SURFACE.part}
      aria-label={`${AN_CONTRAPTIONS_SURFACE.label} — ${AN_CONTRAPTIONS_SURFACE.subtitle}`}
    >
      <header class="an-contraptions-head">
        <div class="an-contraptions-copy">
          <strong>{AN_CONTRAPTIONS_SURFACE.label}</strong>
          <span class="an-contraptions-sub" title={AN_CONTRAPTIONS_SURFACE.redstoneTitle}>
            {AN_CONTRAPTIONS_SURFACE.subtitle}
          </span>
        </div>
        <button
          type="button"
          class="an-contraptions-close"
          aria-label="Close Contraptions"
          title="Close"
          onClick={() => props.onClose?.()}
        >
          ×
        </button>
      </header>
      <div class="an-contraptions-body">
        <Suspense fallback={<p class="an-contraptions-loading">Loading Contraptions…</p>}>
          <AutomationsTab />
        </Suspense>
      </div>
    </aside>
  )
}
