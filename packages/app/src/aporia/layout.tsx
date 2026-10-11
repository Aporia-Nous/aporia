// APORIA: three-column session layout. The center column is the stock OpenCode session view
// (timeline, tool runs, permission/question prompts, composer, attachments), so all agent
// behaviour stays upstream; this file only frames it.
import { createMemo, createSignal, For, Show, type ParentProps } from "solid-js"
import { useNavigate } from "@solidjs/router"
import { useData, useServer } from "@/runtime/server/current"
import { useNotification } from "@/shell/notifications/notification"
import { sessionHref } from "@/shell/routes/session"
import type { SessionModel } from "@/session/model"
import { aporiaPrefs } from "./prefs"
import { contextTokens, formatTokens, tokenTotal } from "./session-stats"
import { AporiaRightPanel } from "./right-panel"
import { ConnectAppsModal } from "./connect-apps"
import { Avatar } from "./avatar"
import logo from "./logo.png"
import "./aporia.css"

export function AporiaSessionLayout(props: ParentProps<{ session: SessionModel }>) {
  const [connectOpen, setConnectOpen] = createSignal(false)
  const info = () => props.session.data.info()
  const agentName = () => info()?.agent ?? "build"
  const messages = () => props.session.history.messages()
  const context = createMemo(() => contextTokens(messages()))
  const total = createMemo(() => tokenTotal(info()?.tokens))

  return (
    <div class="ap-root" data-component="aporia-layout">
      <AporiaSidebar
        directory={props.session.workspace.directory()}
        currentID={props.session.identity.sessionID()}
        onConnect={() => setConnectOpen(true)}
      />
      <main class="ap-center">
        <header class="ap-chat-header">
          <Avatar name={agentName()} size={30} />
          <div class="ap-chat-title">
            <strong>{agentName()}</strong>
            <span class="ap-muted ap-ellipsis">{info()?.title ?? "New session"}</span>
          </div>
          <span
            class="ap-status-dot"
            classList={{ "ap-busy": props.session.data.working() }}
            title={props.session.data.working() ? "Working" : "Idle"}
          />
          <input
            class="ap-search"
            placeholder="Search sessions"
            value={aporiaPrefs.sessionFilter()}
            onInput={(event) => aporiaPrefs.setSessionFilter(event.currentTarget.value)}
          />
        </header>
        <div class="ap-chat-body">{props.children}</div>
        <footer class="ap-context-bar" title="From real session usage reported by the server">
          <span>
            Context <strong>{formatTokens(context())}</strong> tokens
          </span>
          <span class="ap-muted">Session total {formatTokens(total())}</span>
          <Show when={(info()?.cost ?? 0) > 0}>
            <span class="ap-muted">${(info()?.cost ?? 0).toFixed(4)}</span>
          </Show>
        </footer>
      </main>
      <AporiaRightPanel session={props.session} />
      <Show when={connectOpen()}>
        <ConnectAppsModal directory={props.session.workspace.directory()} onClose={() => setConnectOpen(false)} />
      </Show>
    </div>
  )
}

function AporiaSidebar(props: { directory: string; currentID?: string; onConnect: () => void }) {
  const data = useData()
  const server = useServer()
  const navigate = useNavigate()
  const notification = useNotification()

  const agents = createMemo(() =>
    (data.location.agent.list({ directory: props.directory }) ?? [])
      .map((agent) => ("id" in agent ? { name: String(agent.id), mode: agent.mode, hidden: false } : agent))
      .filter((agent) => agent.mode !== "subagent" && !agent.hidden),
  )

  const sessions = createMemo(() => {
    const filter = aporiaPrefs.sessionFilter().toLowerCase()
    return data.session
      .list()
      .filter((session) => !session.parentID && !session.time.archived)
      .filter((session) => !filter || (session.title ?? "").toLowerCase().includes(filter))
      .toSorted((a, b) => b.time.updated - a.time.updated)
      .slice(0, 60)
  })

  return (
    <aside class="ap-sidebar">
      <div class="ap-brand">
        <img src={logo} alt="" width={28} height={28} />
        <span>Aporia</span>
      </div>
      <div class="ap-section-label">Agents</div>
      <div class="ap-agent-row">
        <For each={agents()}>
          {(agent) => (
            <span class="ap-chip" title={agent.name}>
              <Avatar name={agent.name} size={20} />
              {agent.name}
            </span>
          )}
        </For>
      </div>
      <div class="ap-section-label">Chats</div>
      <nav class="ap-session-list">
        <For each={sessions()} fallback={<div class="ap-muted ap-pad">No sessions yet</div>}>
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
                  {session.agent ?? "build"} · {new Date(session.time.updated).toLocaleString()}
                </span>
              </span>
              <Show when={notification.session.unseenCount(session.id) > 0}>
                <span class="ap-unread" />
              </Show>
            </button>
          )}
        </For>
      </nav>
      <button type="button" class="ap-connect-button" onClick={props.onConnect}>
        + Connect apps
      </button>
    </aside>
  )
}
