/**
 * AP-ENGINE-PORT-02: AN Settings host — Aporetic by Aporia Nous chrome.
 * Reads/writes providers/models/BYOK via EnginePort. Does NOT import OC Settings React
 * (`@/settings/shell` / `@opencode/ui` Settings screens). OpenCode = tiny fine print only.
 */
import { For, Show, createEffect, createMemo, createSignal, onCleanup, type JSX } from "solid-js"
import { anSettingsAboutIntro, anSettingsOwnedAttrs } from "./settings-chrome"
import { useEnginePort } from "./engine"
import { AN_PRODUCT_BYLINE, AN_PRODUCT_NAME, AN_SETTINGS_SURFACE } from "./tokens"
import { popularProviders } from "@/providers/catalog/order"
import { usePlatform } from "@/runtime/platform/platform"
import { aporiaPrefs } from "@/aporia/prefs"

export type AnSettingsTab = "about" | "providers" | "models"

export type AnSettingsPanelProps = {
  directory?: string
  onClose?: () => void
  initialTab?: AnSettingsTab
}

export function AnSettingsPanel(props: AnSettingsPanelProps): JSX.Element {
  const engine = useEnginePort()
  const platform = usePlatform()
  const intro = anSettingsAboutIntro()
  const [tab, setTab] = createSignal<AnSettingsTab>(props.initialTab ?? "about")
  const [tick, setTick] = createSignal(0)
  const [byokProvider, setByokProvider] = createSignal("openai")
  const [byokKey, setByokKey] = createSignal("")
  const [byokStatus, setByokStatus] = createSignal<"idle" | "saving" | "ok" | "error">("idle")
  const [byokError, setByokError] = createSignal<string | undefined>()

  const location = () => (props.directory ? { directory: props.directory } : undefined)

  createEffect(() => {
    void engine.syncCatalog?.(location()).finally(() => setTick((n) => n + 1))
  })

  createEffect(() => {
    const unsub = engine.subscribe?.((event) => {
      if (event.type === "providers.changed") setTick((n) => n + 1)
    })
    onCleanup(() => unsub?.())
  })

  const providers = createMemo(() => {
    tick()
    return engine.listProviders(location())
  })

  const models = createMemo(() => {
    tick()
    return engine.listModels(location())
  })

  const byokChoices = createMemo(() => {
    const known = new Set(providers().map((p) => p.id))
    const fromCatalog = providers().filter((p) => p.path === "byok" || p.path === "other")
    const extras = popularProviders
      .filter((id) => !FREE_LOCAL.has(id) && !known.has(id))
      .map((id) => ({ id, name: id, path: "byok" as const, modelCount: 0 }))
    return [...fromCatalog, ...extras]
  })

  const submitByok = async (event: Event) => {
    event.preventDefault()
    if (!engine.connectByok) {
      setByokStatus("error")
      setByokError("BYOK connect not wired on EnginePort")
      return
    }
    setByokStatus("saving")
    setByokError(undefined)
    try {
      await engine.connectByok({
        providerID: byokProvider(),
        key: byokKey(),
        directory: props.directory,
      })
      setByokKey("")
      setByokStatus("ok")
      setTick((n) => n + 1)
    } catch (err) {
      setByokStatus("error")
      setByokError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <aside
      class="an-settings"
      data-component="an-settings"
      data-an-part={AN_SETTINGS_SURFACE.part}
      data-testid="an-settings-panel"
      {...anSettingsOwnedAttrs(aporiaPrefs.anShellEnabled())}
      aria-label={`${AN_PRODUCT_NAME} Settings`}
    >
      <header class="an-settings-head">
        <div class="an-settings-copy">
          <strong data-an-part="settings-about-mark">
            {AN_PRODUCT_NAME} <span class="an-settings-byline">{AN_PRODUCT_BYLINE}</span>
          </strong>
          <span class="an-settings-sub">Settings · providers, models, BYOK</span>
        </div>
        <button
          type="button"
          class="an-settings-close"
          aria-label="Close Settings"
          title="Close"
          onClick={() => props.onClose?.()}
        >
          ×
        </button>
      </header>

      <nav class="an-settings-tabs" role="tablist" aria-label="Settings sections">
        <For each={TABS}>
          {(item) => (
            <button
              type="button"
              role="tab"
              class="an-settings-tab"
              data-active={tab() === item.id ? "true" : "false"}
              aria-selected={tab() === item.id}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          )}
        </For>
      </nav>

      <div class="an-settings-body">
        <Show when={tab() === "about"}>
          <section class="an-settings-pane" data-an-settings-tab="about">
            <h2 class="an-settings-title">{intro.product}</h2>
            <p class="an-settings-lead">{intro.byline}</p>
            <p class="an-settings-meta">
              Version {platform.version ?? "dev"} · free path + BYOK · no second model stack
            </p>
            <p class="an-settings-fineprint" data-an-part="settings-opencode-fineprint">
              {intro.finePrint}
            </p>
          </section>
        </Show>

        <Show when={tab() === "providers"}>
          <section class="an-settings-pane" data-an-settings-tab="providers">
            <h2 class="an-settings-title">Providers</h2>
            <p class="an-settings-lead">Free catalog + local + BYOK via EnginePort</p>
            <ul class="an-settings-list" data-an-part="settings-providers-list">
              <For each={providers()} fallback={<li class="an-settings-empty">No providers loaded yet</li>}>
                {(provider) => (
                  <li class="an-settings-row" data-provider-id={provider.id} data-path={provider.path}>
                    <span class="an-settings-row-name">{provider.name}</span>
                    <span class="an-settings-row-meta">
                      {provider.path} · {provider.modelCount} models
                    </span>
                  </li>
                )}
              </For>
            </ul>

            <form class="an-settings-byok" data-an-part="settings-byok" onSubmit={(e) => void submitByok(e)}>
              <h3 class="an-settings-subtitle">Connect BYOK</h3>
              <label class="an-settings-field">
                <span>Provider</span>
                <select
                  value={byokProvider()}
                  onChange={(e) => setByokProvider(e.currentTarget.value)}
                  data-an-part="settings-byok-provider"
                >
                  <For each={byokChoices()}>
                    {(choice) => <option value={choice.id}>{choice.name}</option>}
                  </For>
                </select>
              </label>
              <label class="an-settings-field">
                <span>API key</span>
                <input
                  type="password"
                  autocomplete="off"
                  placeholder="sk-…"
                  value={byokKey()}
                  onInput={(e) => setByokKey(e.currentTarget.value)}
                  data-an-part="settings-byok-key"
                />
              </label>
              <button type="submit" class="an-settings-btn" data-an-part="settings-byok-submit" disabled={byokStatus() === "saving"}>
                {byokStatus() === "saving" ? "Connecting…" : "Connect"}
              </button>
              <Show when={byokStatus() === "ok"}>
                <p class="an-settings-ok" data-an-part="settings-byok-ok">
                  Connected — catalog refreshed
                </p>
              </Show>
              <Show when={byokStatus() === "error" && byokError()}>
                <p class="an-settings-error" data-an-part="settings-byok-error">
                  {byokError()}
                </p>
              </Show>
            </form>
          </section>
        </Show>

        <Show when={tab() === "models"}>
          <section class="an-settings-pane" data-an-settings-tab="models">
            <h2 class="an-settings-title">Models</h2>
            <p class="an-settings-lead">Catalog from EnginePort (free path honest)</p>
            <ul class="an-settings-list" data-an-part="settings-models-list">
              <For
                each={models().slice(0, 80)}
                fallback={<li class="an-settings-empty">No models loaded yet</li>}
              >
                {(model) => (
                  <li class="an-settings-row" data-model-id={model.id} data-free={model.free ? "true" : "false"}>
                    <span class="an-settings-row-name">{model.name}</span>
                    <span class="an-settings-row-meta">
                      {model.providerID}
                      {model.free ? " · free" : ""}
                    </span>
                  </li>
                )}
              </For>
            </ul>
            <Show when={models().length > 80}>
              <p class="an-settings-meta">Showing first 80 of {models().length}</p>
            </Show>
          </section>
        </Show>
      </div>
    </aside>
  )
}

const FREE_LOCAL = new Set(["opencode", "opencode-go", "ollama", "lmstudio"])

const TABS: Array<{ id: AnSettingsTab; label: string }> = [
  { id: "about", label: "About" },
  { id: "providers", label: "Providers" },
  { id: "models", label: "Models" },
]
