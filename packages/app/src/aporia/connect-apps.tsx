// APORIA: Connect apps modal backed by OpenCode's real MCP config (server API: mcp.list / mcp.add).
// Secrets are never written: env vars are stored as {env:NAME} references that OpenCode
// resolves from the user's environment at startup.
import { createMemo, createResource, createSignal, For, Show } from "solid-js"
import { useServerSDK } from "@/runtime/server/client"
import catalog from "./catalog"
import { EmptyState, Icon, Skeleton } from "./icons"
import { connectionEvents, persistMcp } from "./events"

type CatalogApp = {
  id: string
  name: string
  category: string
  description: string
  type: "local" | "remote"
  command?: string[]
  url?: string
  env: string[]
  recommended?: boolean
}

const apps = catalog.apps as unknown as CatalogApp[]

export function envReference(name: string) {
  return `{env:${name}}`
}

export function buildMcpConfig(app: CatalogApp, envNames: Record<string, string>) {
  if (app.type === "remote") {
    const header = app.env[0] ? envNames[app.env[0]] || app.env[0] : undefined
    return {
      type: "remote" as const,
      url: app.url ?? "",
      ...(header ? { headers: { Authorization: `Bearer ${envReference(header)}` } } : {}),
    }
  }
  const environment = Object.fromEntries(app.env.map((key) => [key, envReference(envNames[key] || key)]))
  return {
    type: "local" as const,
    command: app.command ?? [],
    ...(app.env.length ? { environment } : {}),
  }
}

export function ConnectAppsModal(props: { directory: string; sessionID?: string; onClose: () => void }) {
  const sdk = useServerSDK()
  const [query, setQuery] = createSignal("")
  const [pending, setPending] = createSignal<CatalogApp>()
  const [error, setError] = createSignal("")
  const [notice, setNotice] = createSignal("")

  const [servers, { refetch }] = createResource(
    () => sdk.connection.status() === "connected",
    () => sdk.api.mcp.list({ location: { directory: props.directory } }).then((result) => result.data),
    { initialValue: [] },
  )

  const added = createMemo(() => new Set((servers.latest ?? []).map((server) => server.name)))
  const extra = createMemo(() => (servers.latest ?? []).filter((server) => !apps.some((app) => app.id === server.name)))

  const filtered = createMemo(() => {
    const q = query().toLowerCase()
    return apps.filter((app) => !q || `${app.name} ${app.description} ${app.category}`.toLowerCase().includes(q))
  })

  const sections = createMemo(() =>
    (catalog.categories as string[])
      .map((category) => ({
        category,
        items: filtered().filter((app) =>
          category === "Recommended"
            ? app.recommended || app.category === category
            : app.category === category && (!app.recommended || !!query()),
        ),
      }))
      .filter((section) => section.items.length > 0),
  )

  const save = async (app: CatalogApp, envNames: Record<string, string>) => {
    setError("")
    try {
      const config = buildMcpConfig(app, envNames)
      await sdk.api.mcp.add({ server: app.id, location: { directory: props.directory }, config })
      // Persist to the global opencode config so it survives restarts (desktop only).
      let saved: { file: string; backup?: string } | undefined
      let persistError: string | undefined
      try {
        saved = await persistMcp(app.id, config)
      } catch (err) {
        persistError = err instanceof Error ? err.message : String(err)
      }
      connectionEvents.add(props.sessionID, {
        app: app.name,
        at: Date.now(),
        persisted: saved?.file,
        backup: saved?.backup,
        error: persistError,
      })
      setNotice(saved ? `${app.name} connected and saved to ${saved.file}` : `${app.name} connected for this run.`)
      setPending(undefined)
      await refetch()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div class="ap-overlay" role="dialog" aria-modal="true" aria-label="Connect apps" onClick={props.onClose}>
      <div class="ap-modal" onClick={(event) => event.stopPropagation()}>
        <div class="ap-modal-head">
          <strong>Connect apps</strong>
          <button type="button" class="ap-icon-btn" aria-label="Close" onClick={props.onClose}>
            <Icon name="x" size={16} />
          </button>
        </div>
        <label class="ap-search ap-search-wide">
          <Icon name="search" size={14} />
          <input
            aria-label="Search apps"
            placeholder="Search apps"
            value={query()}
            onInput={(event) => setQuery(event.currentTarget.value)}
            autofocus
          />
        </label>
        <Show when={notice()}>
          <div class="ap-card ap-card-ok" role="status">
            <Icon name="check" size={14} /> {notice()}
          </div>
        </Show>
        <Show when={error()}>
          <div class="ap-card ap-card-err" role="alert">
            {error()}
          </div>
        </Show>
        <div class="ap-modal-scroll">
          <Show when={servers.loading && (servers.latest ?? []).length === 0}>
            <Skeleton rows={3} />
          </Show>
          <Show when={sections().length === 0}>
            <EmptyState icon="search" title="No apps match" hint="Try another name or category." />
          </Show>
          <Show when={pending()}>
            {(app) => <EnvForm app={app()} onCancel={() => setPending(undefined)} onSave={(names) => save(app(), names)} />}
          </Show>
          <Show when={extra().length > 0 && !query()}>
            <div class="ap-section-label">Already configured</div>
            <For each={extra()}>
              {(server) => (
                <div class="ap-app-row">
                  <span class="ap-app-icon">{server.name.slice(0, 1).toUpperCase()}</span>
                  <span class="ap-app-text">
                    <strong>{server.name}</strong>
                    <span class="ap-muted ap-small">{server.status.status}</span>
                  </span>
                  <span class="ap-added">
                          <Icon name="check" size={14} /> Added
                        </span>
                </div>
              )}
            </For>
          </Show>
          <For each={sections()}>
            {(section) => (
              <>
                <div class="ap-section-label">{section.category}</div>
                <For each={section.items}>
                  {(app) => (
                    <div class="ap-app-row">
                      <span class="ap-app-icon">{app.name.slice(0, 1)}</span>
                      <span class="ap-app-text">
                        <strong>{app.name}</strong>
                        <span class="ap-muted ap-small">{app.description}</span>
                      </span>
                      <Show
                        when={added().has(app.id)}
                        fallback={
                          <button
                            type="button"
                            class="ap-btn"
                            onClick={() => (app.env.length ? setPending(app) : save(app, {}))}
                          >
                            Connect
                          </button>
                        }
                      >
                        <span class="ap-added">
                          <Icon name="check" size={14} /> Added
                        </span>
                      </Show>
                    </div>
                  )}
                </For>
              </>
            )}
          </For>
        </div>
      </div>
    </div>
  )
}

function EnvForm(props: { app: CatalogApp; onCancel: () => void; onSave: (names: Record<string, string>) => void }) {
  const [names, setNames] = createSignal<Record<string, string>>(
    Object.fromEntries(props.app.env.map((key) => [key, key])),
  )
  return (
    <form
      class="ap-card"
      onSubmit={(event) => {
        event.preventDefault()
        props.onSave(names())
      }}
    >
      <strong>Connect {props.app.name}</strong>
      <span class="ap-muted ap-small">
        Enter the NAME of the environment variable that holds each value, not the value itself. Aporia saves only a
        reference like {"{env:NAME}"}; set the variable in Windows, then restart.
      </span>
      <For each={props.app.env}>
        {(key) => (
          <label class="ap-env-row">
            <span class="ap-small">{key}</span>
            <input
              class="ap-input"
              value={names()[key]}
              autocomplete="off"
              spellcheck={false}
              onInput={(event) => setNames({ ...names(), [key]: event.currentTarget.value.replace(/[^A-Za-z0-9_]/g, "") })}
            />
          </label>
        )}
      </For>
      <div class="ap-row-end">
        <button type="button" class="ap-btn ap-btn-ghost" onClick={props.onCancel}>
          Cancel
        </button>
        <button type="submit" class="ap-btn">
          Add
        </button>
      </div>
    </form>
  )
}
