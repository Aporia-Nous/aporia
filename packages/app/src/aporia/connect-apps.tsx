// APORIA: Connect apps modal backed by OpenCode's real MCP config (server API: mcp.list / mcp.add).
// Secrets are never written: env vars are stored as {env:NAME} references that OpenCode
// resolves from the user's environment at startup.
import { createMemo, createResource, createSignal, For, Show } from "solid-js"
import { useServerSDK } from "@/runtime/server/client"
import { usePlatform } from "@/runtime/platform/platform"
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
  auth?: "oauth" | "key"
  recommended?: boolean
}

type Live = { state: "checking" | "connecting" | "signin" | "connected" | "failed"; detail?: string }
type DesktopBridge = { setEnv?: (n: string, v: string) => Promise<unknown>; which?: (c: string) => Promise<{ found: boolean }> }
const bridge = () => (globalThis as { electron?: { aporia?: DesktopBridge } }).electron?.aporia
const INSTALL_HELP: Record<string, string> = {
  npx: "Needs Node.js: install from nodejs.org (LTS), then reopen Aporia.",
  uvx: "Needs uv: run  powershell -c \"irm https://astral.sh/uv/install.ps1 | iex\"  then reopen Aporia.",
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

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

  const platform = usePlatform()
  const [live, setLive] = createSignal<Record<string, Live>>({})
  const mark = (id: string, value: Live) => setLive({ ...live(), [id]: value })
  const location = () => ({ directory: props.directory })

  const status = async (id: string) =>
    (await sdk.api.mcp.list({ location: location() })).data.find((item) => item.name === id)?.status

  /** Poll real server status until connected/failed or timeout. */
  const watch = async (app: CatalogApp, signin: boolean) => {
    const until = Date.now() + (signin ? 180_000 : 45_000)
    while (Date.now() < until) {
      const s = await status(app.id).catch(() => undefined)
      if (s?.status === "connected") return mark(app.id, { state: "connected" })
      if (s?.status === "failed") return mark(app.id, { state: "failed", detail: s.error })
      if (s?.status === "needs_auth" && !signin) return mark(app.id, { state: "failed", detail: "Needs sign-in" })
      await sleep(1500)
    }
    mark(app.id, { state: "failed", detail: signin ? "Sign-in not completed (timed out)" : "Timed out connecting" })
  }

  const startOAuth = async (app: CatalogApp) => {
    const list = (await sdk.api.mcp.list({ location: location() })).data
    const current = list.find((item) => item.name === app.id)
    if (current?.status.status !== "needs_auth") return false
    if (!current.integrationID) throw new Error("Server reports sign-in needed but offers no OAuth method")
    const integration = await sdk.api.integration.get({ integrationID: current.integrationID, location: location() })
    const method = integration.data?.methods.find((item) => item.type === "oauth" && !item.form?.length)
    if (!method || method.type !== "oauth") throw new Error("No browser sign-in method available for this server")
    const attempt = await sdk.api.integration.oauth.connect({
      integrationID: current.integrationID,
      methodID: method.id,
      location: location(),
    })
    platform.openExternal(attempt.data.url)
    return true
  }

  const save = async (app: CatalogApp, values: Record<string, string>) => {
    setError("")
    setPending(undefined)
    try {
      if (app.type === "local" && app.command?.[0]) {
        mark(app.id, { state: "checking", detail: `Looking for ${app.command[0]}` })
        const found = await bridge()?.which?.(app.command[0]).catch(() => undefined)
        if (found && !found.found)
          return mark(app.id, {
            state: "failed",
            detail: `${app.command[0]} not found. ${INSTALL_HELP[app.command[0]] ?? "Install it and reopen Aporia."}`,
          })
      }
      mark(app.id, { state: "connecting" })
      // Keys: saved as Windows user env vars (never in opencode.json); used live for this run.
      for (const [name, value] of Object.entries(values)) if (value) await bridge()?.setEnv?.(name, value)
      const persisted = buildMcpConfig(app, {})
      const runtime =
        app.type === "remote"
          ? app.env[0] && values[app.env[0]]
            ? { ...persisted, headers: { Authorization: `Bearer ${values[app.env[0]]}` } }
            : persisted
          : { ...persisted, ...(app.env.length ? { environment: { ...values } } : {}) }
      await sdk.api.mcp.add({ server: app.id, location: location(), config: runtime as typeof persisted })
      let saved: { file: string; backup?: string } | undefined
      let persistError: string | undefined
      try {
        saved = await persistMcp(app.id, persisted)
      } catch (err) {
        persistError = err instanceof Error ? err.message : String(err)
      }
      await sdk.api.mcp.connect({ server: app.id, location: location() }).catch(() => undefined)
      const signin = await startOAuth(app)
      if (signin) mark(app.id, { state: "signin" })
      await watch(app, signin)
      connectionEvents.add(props.sessionID, {
        app: app.name,
        at: Date.now(),
        persisted: saved?.file,
        backup: saved?.backup,
        error: live()[app.id]?.state === "failed" ? live()[app.id]?.detail : persistError,
      })
      if (live()[app.id]?.state === "connected") setNotice(`${app.name} connected${saved ? " and saved" : ""}.`)
      await refetch()
    } catch (err) {
      mark(app.id, { state: "failed", detail: err instanceof Error ? err.message : String(err) })
    }
  }

  const label = (value: Live | undefined) =>
    !value
      ? ""
      : value.state === "checking"
        ? value.detail ?? "Checking..."
        : value.state === "connecting"
          ? "Connecting..."
          : value.state === "signin"
            ? "Waiting for sign-in in your browser..."
            : value.state === "connected"
              ? "Connected"
              : `Failed: ${value.detail ?? "unknown error"}`

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
                        <Show when={live()[app.id]}>
                          {(value) => (
                            <span class={`ap-live ap-live-${value().state}`} role="status">
                              {label(value())}
                            </span>
                          )}
                        </Show>
                      </span>
                      <Show
                        when={added().has(app.id) && live()[app.id]?.state !== "failed"}
                        fallback={
                          <button
                            type="button"
                            class="ap-btn"
                            disabled={["checking", "connecting", "signin"].includes(live()[app.id]?.state ?? "")}
                            onClick={() => (app.env.length ? setPending(app) : save(app, {}))}
                          >
                            {live()[app.id]?.state === "failed" ? "Retry" : "Connect"}
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

function EnvForm(props: { app: CatalogApp; onCancel: () => void; onSave: (values: Record<string, string>) => void }) {
  const [values, setValues] = createSignal<Record<string, string>>({})
  return (
    <form
      class="ap-card"
      onSubmit={(event) => {
        event.preventDefault()
        props.onSave(values())
      }}
    >
      <strong>Connect {props.app.name}</strong>
      <span class="ap-muted ap-small">
        Paste your key. It is saved as a Windows user environment variable on this PC; opencode.json only gets a
        reference like {"{env:NAME}"}. Leave blank to use a variable you already set.
      </span>
      <For each={props.app.env}>
        {(key) => (
          <label class="ap-env-row">
            <span class="ap-small">{key}</span>
            <input
              class="ap-input"
              type="password"
              value={values()[key] ?? ""}
              autocomplete="off"
              spellcheck={false}
              placeholder="Paste key"
              onInput={(event) => setValues({ ...values(), [key]: event.currentTarget.value.trim() })}
            />
          </label>
        )}
      </For>
      <div class="ap-row-end">
        <button type="button" class="ap-btn ap-btn-ghost" onClick={props.onCancel}>
          Cancel
        </button>
        <button type="submit" class="ap-btn">
          Save and connect
        </button>
      </div>
    </form>
  )
}
