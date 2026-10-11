// APORIA: three-column session layout. The center column is the stock OpenCode session view
import { AlertBell, AlertToasts } from "./alerts"
import { UpdateWatcher } from "./update"
// (timeline, tool runs, permission/question prompts, composer, attachments), so all agent
// behaviour stays upstream; this file only frames it.
import { createEffect, createMemo, createResource, createSignal, For, lazy, Show, type ParentProps } from "solid-js"
import { useTheme } from "@opencode/ui/theme/context"
import { normalizeAgentList } from "@/runtime/server/global-sync/utils"
import { useNavigate } from "@solidjs/router"
import { useData, useServer } from "@/runtime/server/current"
import { useServerSDK } from "@/runtime/server/client"
import { useNotification } from "@/shell/notifications/notification"
import { sessionHref } from "@/shell/routes/session"
import { useSettingsDialog } from "@/settings/command"
import { useCommand } from "@/shell/commands/command"
import type { SessionInfo, SessionMessageInfo } from "@opencode/client/promise"
import type { SessionModel } from "@/session/model"
import { aporiaPrefs } from "./prefs"
import { contextTokens, formatTokens, tokenTotal } from "./session-stats"
import { AporiaRightPanel } from "./right-panel"
import { Avatar } from "./avatar"
import { EmptyState, Icon } from "./icons"
import logo from "./logo.png"

// Loaded on first open so the catalog and modal stay out of the startup bundle.
const ConnectAppsModal = lazy(() => import("./connect-apps").then((m) => ({ default: m.ConnectAppsModal })))
import "./aporia.css"

/** What the frame needs; built from a live session or from a draft (new-session) screen. */
function projectName(directory: string | undefined) {
  if (!directory) return "Global"
  return directory.split(/[\\/]/).filter(Boolean).at(-1) ?? directory
}

export type AporiaView = {
  directory: () => string
  sessionID: () => string | undefined
  info: () => SessionInfo | undefined
  working: () => boolean
  messages: () => SessionMessageInfo[]
}

export function AporiaSessionLayout(props: ParentProps<{ session: SessionModel }>) {
  const view: AporiaView = {
    directory: () => props.session.workspace.directory(),
    sessionID: () => props.session.identity.sessionID(),
    info: () => props.session.data.info(),
    working: () => props.session.data.working(),
    messages: () => props.session.history.messages(),
  }
  return <AporiaFrame view={view}>{props.children}</AporiaFrame>
}

const noMessages: SessionMessageInfo[] = []

export function AporiaDraftLayout(props: ParentProps<{ directory: string }>) {
  const view: AporiaView = {
    directory: () => props.directory,
    sessionID: () => undefined,
    info: () => undefined,
    working: () => false,
    messages: () => noMessages,
  }
  return <AporiaFrame view={view}>{props.children}</AporiaFrame>
}

function AporiaFrame(props: ParentProps<{ view: AporiaView }>) {  const [connectOpen, setConnectOpen] = createSignal(false)
  const theme = useTheme()
  // Sticky Aporia theme: re-applied whenever it drifts (imported settings, old app state), unless opted out.
  createEffect(() => {
    if (!aporiaPrefs.aporiaTheme()) return
    if (theme.themeId() !== "aporia") theme.setTheme("aporia")
    if (theme.colorScheme() !== "dark") theme.setColorScheme("dark")
  })
  const info = () => props.view.info()
  const agentName = () => info()?.agent ?? "build"
  const messages = () => props.view.messages()
  const context = createMemo(() => contextTokens(messages()))
  const total = createMemo(() => tokenTotal(info()?.tokens))

  return (
    <div class="ap-root" data-component="aporia-layout">
      <AlertToasts />
      <UpdateWatcher />
      <div style={{ position: "fixed", top: "6px", right: "150px", "z-index": 2147483002 }} data-component="aporia-window-bell"><AlertBell /></div>
      <AporiaSidebar
        directory={props.view.directory()}
        currentID={props.view.sessionID()}
        onConnect={() => setConnectOpen(true)}
      />
      <main class="ap-center">
        <header class="ap-chat-header">
          <Avatar name={agentName()} size={30} />
          <div class="ap-chat-title">
            <strong>{agentName()}</strong>
            <span class="ap-muted ap-ellipsis">{info()?.title ?? (props.view.directory() ? "New session" : "Home")}</span>
          </div>
          <span
            class="ap-status-dot"
            classList={{ "ap-busy": props.view.working() }}
            title={props.view.working() ? "Working" : "Idle"}
          />
          <label class="ap-search">
            <Icon name="search" size={14} />
            <input
              aria-label="Search sessions"
            placeholder="Search sessions"
            value={aporiaPrefs.sessionFilter()}
              onInput={(event) => aporiaPrefs.setSessionFilter(event.currentTarget.value)}
            />
          </label>
        </header>
        <div class="ap-chat-body">{props.children}</div>
        <footer class="ap-context-bar" title="From real session usage reported by the server">
          <span class="ap-context-pill">
            <Icon name="gauge" size={12} />
            Context <strong>{formatTokens(context())}</strong> tokens
          </span>
          <span class="ap-muted">Session total {formatTokens(total())}</span>
          <Show when={(info()?.cost ?? 0) > 0}>
            <span class="ap-muted">${(info()?.cost ?? 0).toFixed(4)}</span>
          </Show>
        </footer>
      </main>
      <AporiaRightPanel view={props.view} />
      <Show when={connectOpen()}>
        <ConnectAppsModal
          directory={props.view.directory()}
          sessionID={props.view.sessionID()}
          onClose={() => setConnectOpen(false)} />
      </Show>
    </div>
  )
}

function AporiaSidebar(props: { directory: string; currentID?: string; onConnect: () => void }) {
  const data = useData()
  const server = useServer()
  const navigate = useNavigate()
  const notification = useNotification()
  const openSettings = useSettingsDialog()
  const command = useCommand()

  const agents = createMemo(() =>
    normalizeAgentList((props.directory ? data.location.agent.list({ directory: props.directory }) : undefined) ?? []).filter((agent) => agent.mode !== "subagent" && !agent.hidden),
  )

  const sdk = useServerSDK()
  const [showSub, setShowSub] = createSignal(false)
  // Read-only: every root session the server knows, across all projects (not just opened ones).
  const [all] = createResource(
    () => sdk.connection.status() === "connected",
    () => sdk.api.session.list({ limit: 2000, order: "desc" }).then((r) => r.data),
    { initialValue: [] },
  )
  const sessions = createMemo(() => {
    const filter = aporiaPrefs.sessionFilter().toLowerCase()
    const merged = new Map<string, SessionInfo>()
    for (const session of all.latest ?? []) merged.set(session.id, session)
    for (const session of data.session.list()) merged.set(session.id, session)
    return [...merged.values()]
      .filter((session) => (showSub() || !session.parentID) && !session.time.archived)
      .filter((session) => !filter || (session.title ?? "").toLowerCase().includes(filter))
      .toSorted((a, b) => b.time.updated - a.time.updated)
      .slice(0, 2000)
  })

  return (
    <aside class="ap-sidebar">
      <div class="ap-brand">
        <img src={logo} alt="" width={28} height={28} />
        <span>Aporia</span>
      </div>
      <div class="ap-rail-actions">
        <button type="button" class="ap-btn ap-rail-new" onClick={() => command.trigger("tab.new")}>
          <Icon name="message" size={14} /> New session
        </button>
        <button type="button" class="ap-icon-btn" title="Home" aria-label="Home" onClick={() => navigate("/")}>
          <Icon name="folder" size={16} />
        </button>
      </div>
      <Show when={agents().length > 0}>
        <div class="ap-section-label">Agents</div>
      </Show>
      <div class="ap-agent-row">
        <For each={agents()}>
          {(agent) => (
            <span class="ap-chip" title={agent.name}>
              <span class="ap-chip-dot" />
              {agent.name}
            </span>
          )}
        </For>
      </div>
      <div class="ap-section-label ap-chats-label">
        Chats <span class="ap-count">{sessions().length}</span>
        <button
          type="button"
          class="ap-sub-toggle"
          aria-pressed={showSub()}
          title="Include subagent runs (child sessions)"
          onClick={() => setShowSub(!showSub())}
        >
          {showSub() ? "All runs" : "+ subagents"}
        </button>
      </div>
      <nav class="ap-session-list">
        <For each={sessions()} fallback={<EmptyState icon="message" title="No chats yet" hint="Start a session and it shows up here." />}>
          {(session) => (
            <button
              type="button"
              class="ap-session"
              classList={{ "ap-selected": session.id === props.currentID }}
              onClick={() => navigate(sessionHref(server.key, session.id))}
            >
              <Avatar name={session.agent ?? "build"} />
              <span class="ap-session-text">
                <strong class="ap-ellipsis">{session.title ?? "Untitled"}</strong>
                <span class="ap-muted ap-ellipsis">
                  {projectName(session.location.directory)} · {new Date(session.time.updated).toLocaleDateString()}
                </span>
              </span>
              <Show when={notification.session.unseenCount(session.id) > 0}>
                <span class="ap-unread" />
              </Show>
            </button>
          )}
        </For>
      </nav>
      <div class="ap-sidebar-footer">
        <button type="button" class="ap-connect-button" onClick={props.onConnect}>
          <Icon name="plug" size={16} />
          Connect apps
        </button>
        <button type="button" class="ap-gear" aria-label="Settings (Ctrl+,)" title="Settings (Ctrl+,)" onClick={openSettings}>
          <Icon name="settings" size={18} />
        </button>
      </div>
    </aside>
  )
}

/** Home screen: same frame, no session selected. */
export function AporiaHomeLayout(props: ParentProps) {
  const view: AporiaView = {
    directory: () => "",
    sessionID: () => undefined,
    info: () => undefined,
    working: () => false,
    messages: () => noMessages,
  }
  return <AporiaFrame view={view}>{props.children}</AporiaFrame>
}
