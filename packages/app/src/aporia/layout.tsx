// APORIA: three-column session layout. The center column is the stock OpenCode session view
import { aporiaAlerts, AlertBell, AlertToasts } from "./alerts"
import { UpdateWatcher } from "./update"
import { TeammatesSection } from "./bots"
import { BotDispatcher } from "./dispatch"
import { RoomsSection } from "./rooms"
import { ReactionsLayer } from "./reactions"
// (timeline, tool runs, permission/question prompts, composer, attachments), so all agent
// behaviour stays upstream; this file only frames it.
import { createEffect, createMemo, createResource, createSignal, For, lazy, onCleanup, Show, type ParentProps } from "solid-js"
import { Portal } from "solid-js/web"
import { ComposerMic } from "./dictation"
import { call, setCallSession, speakReply } from "./call"
import { createVirtualizer } from "@tanstack/solid-virtual"
import { useTheme } from "@opencode/ui/theme/context"
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
import {
  debouncedFilter,
  filterSessionRows,
  mergeSessions,
  prettyTitle,
  sessionListOptions,
  toSessionRows,
  type SessionRow,
} from "./session-list"
import logo from "./logo.png"

// Loaded on first open so the catalog and modal stay out of the startup bundle.
const ConnectAppsModal = lazy(() => import("./connect-apps").then((m) => ({ default: m.ConnectAppsModal })))
import "./aporia.css"

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
  const [rightOpen, setRightOpen] = createSignal(aporiaPrefs.rightPanelOpen())
  const toggleRight = () => { const next = !rightOpen(); setRightOpen(next); aporiaPrefs.setRightPanelOpen(next) }
  const [railOpen, setRailOpen] = createSignal(aporiaPrefs.leftRailOpen())
  const toggleRail = () => { const next = !railOpen(); setRailOpen(next); aporiaPrefs.setLeftRailOpen(next) }
  // The composer phone icon (or anything) can ask for the Call tab to be shown.
  const [callTab, setCallTab] = createSignal(false)
  let seenCallUi = call.uiRequest()
  createEffect(() => {
    const n = call.uiRequest()
    if (n === seenCallUi) return
    seenCallUi = n
    setRightOpen(true)
    setCallTab(true)
  })
  const theme = useTheme()
  // Sticky Aporetic theme: re-applied whenever it drifts (imported settings, old app state), unless opted out.
  createEffect(() => {
    if (!aporiaPrefs.aporiaTheme()) return
    if (theme.themeId() !== "aporia") theme.setTheme("aporia")
    if (theme.colorScheme() !== "dark") theme.setColorScheme("dark")
  })
  // Search input: keystrokes update the field immediately, but the filter commit (which the sidebar's
  // list memo depends on) is debounced so a burst of typing triggers at most one list rebuild.
  const [query, setQuery] = createSignal(aporiaPrefs.sessionFilter())
  const commitFilter = debouncedFilter(aporiaPrefs.setSessionFilter)
  onCleanup(commitFilter.clear)
  const info = () => props.view.info()
  const agentName = () => info()?.agent ?? "build"
  const messages = () => props.view.messages()
  const context = createMemo(() => contextTokens(messages()))
  const total = createMemo(() => tokenTotal(info()?.tokens))
  const lastAssistantText = () => {
    const msgs = (props.view.messages?.() ?? []) as any[]
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i]
      if (m?.role !== "assistant") continue
      const parts = m.parts ?? m.content
      if (Array.isArray(parts)) {
        const text = parts.filter((p: any) => p?.type === "text").map((p: any) => p.text ?? "").join("\n").trim()
        if (text) return text
      } else if (typeof parts === "string" && parts.trim()) return parts.trim()
    }
    return ""
  }

  return (
    <div class="ap-root" classList={{ "ap-right-collapsed": !rightOpen(), "ap-rail-collapsed": !railOpen() }} data-component="aporia-layout">
      <Portal><AlertToasts /></Portal>
      <ComposerMic />
      {/* Headless voice-call loop: speaks each new agent reply while a call is active. */}
      <VoiceCallHost sessionID={props.view.sessionID()} lastReply={() => lastAssistantText()} />
      <UpdateWatcher />
      <BotDispatcher />
      <ReactionsLayer sessionID={props.view.sessionID()} agent={info()?.agent} />
      <AporiaSidebar
        directory={props.view.directory()}
        currentID={props.view.sessionID()}
        currentAgent={info()?.agent}
        onConnect={() => setConnectOpen(true)}
      />
      <main class="ap-center">
        <header class="ap-chat-header">
          <button type="button" class="ap-icon-btn ap-rail-toggle" title={railOpen() ? "Hide sidebar" : "Show sidebar"} aria-label="Toggle sidebar" onClick={toggleRail}>
            {railOpen() ? "«" : "»"}
          </button>
          <Avatar name={agentName()} size={30} />
          <div class="ap-chat-title">
            <strong>{agentName()}</strong>
            <span class="ap-muted ap-ellipsis">{info()?.title ? prettyTitle(info()!.title) : (props.view.directory() ? "New session" : "Home")}</span>
          </div>
          <span
            class="ap-status-dot"
            classList={{ "ap-busy": props.view.working() }}
            title={props.view.working() ? "Working" : "Idle"}
          />
          <AlertBell />
          <label class="ap-search">
            <Icon name="search" size={14} />
            <input
              aria-label="Search sessions"
              placeholder="Search sessions"
              value={query()}
              onInput={(event) => {
                setQuery(event.currentTarget.value)
                commitFilter(event.currentTarget.value)
              }}
            />
          </label>
          <button type="button" class="ap-icon-btn ap-panel-toggle" title={rightOpen() ? "Hide panel" : "Show panel"} aria-label="Toggle right panel" onClick={toggleRight}>
            {rightOpen() ? "»" : "«"}
          </button>
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
      <Show when={rightOpen()}><AporiaRightPanel view={props.view} onClose={toggleRight} callTab={callTab()} onCallTabHandled={() => setCallTab(false)} /></Show>
      <Show when={connectOpen()}>
        <ConnectAppsModal
          directory={props.view.directory()}
          sessionID={props.view.sessionID()}
          onClose={() => setConnectOpen(false)} />
      </Show>
    </div>
  )
}

/** One chat row. Extracted so per-row work (title/date already precomputed) runs when the row's own
 *  reactive values change, not on every frame render. */
function AporiaSessionRow(props: { row: SessionRow; selected: boolean; unseen: number; onSelect: () => void; onContextMenu?: (event: MouseEvent) => void }) {
  return (
    <button
      type="button"
      class="ap-session"
      classList={{ "ap-selected": props.selected }}
      onClick={props.onSelect}
      onContextMenu={props.onContextMenu}
    >
      <Avatar name={props.row.session.agent ?? "build"} />
      <span class="ap-session-text">
        <strong class="ap-ellipsis">{props.row.title}</strong>
        <span class="ap-muted ap-ellipsis">{props.row.meta}</span>
      </span>
      <Show when={props.unseen > 0}>
        <span class="ap-unread" />
      </Show>
    </button>
  )
}

function AporiaSidebar(props: { directory: string; currentID?: string; currentAgent?: string; onConnect: () => void }) {
  const data = useData()
  const server = useServer()
  const navigate = useNavigate()
  const notification = useNotification()
  const openSettings = useSettingsDialog()
  const command = useCommand()


  const sdk = useServerSDK()
  const [showSub, setShowSub] = createSignal(false)
  // Read-only: every root session the server knows, across all projects (not just opened ones).
  const [all] = createResource(
    () => sdk.connection.status() === "connected",
    () => sdk.api.session.list({ limit: 2000, order: "desc" }).then((r) => r.data),
    { initialValue: [] },
  )
  // Base list: merge + filter + sort + precompute row strings. Rebuilt only when the data or the
  // "include subagents" toggle changes, never on a search keystroke (the sort allocates the whole list).
  const baseRows = createMemo(() => toSessionRows(mergeSessions(all.latest, data.session.list(), showSub())))
  // Depends only on the debounced filter pref (see AporiaFrame), so a keystroke burst filters once.
  const rows = createMemo(() => filterSessionRows(baseRows(), aporiaPrefs.sessionFilter()))

  // Virtualize the list: only the visible window (≈ viewport / 52px + overscan) is mounted, so a
  // 2000-session store mounts ~36 rows, not 2000. Mirrors the timeline virtualizer.
  let navRef: HTMLElement | undefined
  const virtualizer = createVirtualizer<HTMLElement, HTMLElement>(
    sessionListOptions({
      count: () => rows().length,
      getScrollElement: () => navRef ?? null,
      getItemKey: (index) => rows()[index]?.id ?? index,
    }),
  )
  const virtualItems = createMemo(() => virtualizer.getVirtualItems())
  const virtualKeys = createMemo(() => virtualItems().map((item) => item.key))
  const itemByKey = createMemo(() => new Map(virtualItems().map((item) => [item.key, item] as const)))
  const rowByID = createMemo(() => new Map(rows().map((row) => [row.id, row] as const)))

  const [menu, setMenu] = createSignal<{ x: number; y: number; row: SessionRow } | undefined>()
  const [renameRow, setRenameRow] = createSignal<SessionRow | undefined>()
  const [deleteRow, setDeleteRow] = createSignal<SessionRow | undefined>()
  const [name, setName] = createSignal("")

  const closeMenu = () => {
    const el = document.querySelector(".ap-ctxmenu") as HTMLElement | null
    if (!el) { setMenu(undefined); return }
    el.classList.add("ap-ctx-closing")
    setTimeout(() => setMenu(undefined), 110)
  }
  const openMenu = (event: MouseEvent, row: SessionRow) => {
    event.preventDefault()
    setMenu({ x: event.clientX, y: event.clientY, row })
  }
  const doRename = async () => {
    const row = renameRow()
    const title = name().trim()
    setRenameRow(undefined)
    if (row && title && title !== row.title) await (data.session as any).update?.({ sessionID: row.id, title })?.catch?.(() => {})
  }
  const doDelete = async () => {
    const row = deleteRow()
    setDeleteRow(undefined)
    if (row) await (data.session as any).remove?.(row.id)?.catch?.(() => {})
  }
  const doArchive = async (row: SessionRow) => {
    closeMenu()
    await (data.session as any).archive?.(row.id)?.catch?.(() => {})
  }

  return (
    <aside class="ap-sidebar">
      <div class="ap-brand">
        <img src={logo} alt="" width={28} height={28} />
        <span>Aporetic</span>
      </div>
      <div class="ap-rail-actions">
        <button type="button" class="ap-btn ap-rail-new" onClick={() => command.trigger("tab.new")}>
          <Icon name="message" size={14} /> New session
        </button>
        <button type="button" class="ap-icon-btn" title="Home" aria-label="Home" onClick={() => navigate("/")}>
          <Icon name="folder" size={16} />
        </button>
      </div>
      <TeammatesSection sessions={rows().map((row) => row.session)} currentAgent={props.currentAgent} />
      <RoomsSection />
      <div class="ap-section-label ap-chats-label">
        Chats <span class="ap-count">{rows().length}</span>
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
      <nav class="ap-session-list" ref={navRef}>
        <Show
          when={rows().length}
          fallback={<EmptyState icon="message" title="No chats yet" hint="Start a session and it shows up here." />}
        >
          <div style={{ position: "relative", width: "100%", height: `${virtualizer.getTotalSize()}px` }}>
            <For each={virtualKeys()}>
              {(key) => (
                <Show when={itemByKey().get(key)}>
                  {(item) => (
                    <Show when={rowByID().get(String(key))}>
                      {(row) => (
                        <div
                          ref={virtualizer.measureElement}
                          data-index={item().index}
                          style={{ position: "absolute", top: "0", "inset-inline-start": "0", width: "100%", transform: `translateY(${item().start}px)` }}
                        >
                          <AporiaSessionRow
                            row={row()}
                            selected={row().id === props.currentID}
                            unseen={notification.session.unseenCount(row().id)}
                            onSelect={() => navigate(sessionHref(server.key, row().id))}
                            onContextMenu={(event) => openMenu(event, row())}
                          />
                        </div>
                      )}
                    </Show>
                  )}
                </Show>
              )}
            </For>
          </div>
        </Show>
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
      <Portal>
      <Show when={menu()}>
        {(m) => (
          <div class="ap-ctx-overlay" onClick={() => closeMenu()} onContextMenu={(event) => { event.preventDefault(); closeMenu() }}>
            <div class="ap-ctxmenu" style={{ left: `${m().x}px`, top: `${m().y}px` }} onClick={(event) => event.stopPropagation()}>
              <button type="button" onClick={() => { setName(m().row.title); setRenameRow(m().row); closeMenu() }}>Rename</button>
              <button type="button" onClick={() => void doArchive(m().row)}>Archive</button>
              <button type="button" class="ap-ctx-danger" onClick={() => { setDeleteRow(m().row); closeMenu() }}>Delete</button>
            </div>
          </div>
        )}
      </Show>
      <Show when={renameRow()}>
        <div class="ap-overlay" onClick={() => setRenameRow(undefined)}>
          <div class="ap-modal" onClick={(event) => event.stopPropagation()}>
            <div class="ap-modal-head"><strong>Rename chat</strong></div>
            <input class="ap-input" value={name()} autofocus onInput={(event) => setName(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === "Enter") void doRename() }} />
            <div class="ap-row-end">
              <button type="button" class="ap-btn ap-btn-ghost" onClick={() => setRenameRow(undefined)}>Cancel</button>
              <button type="button" class="ap-btn" onClick={() => void doRename()}>Save</button>
            </div>
          </div>
        </div>
      </Show>
      <Show when={deleteRow()}>
        <div class="ap-overlay" onClick={() => setDeleteRow(undefined)}>
          <div class="ap-modal" onClick={(event) => event.stopPropagation()}>
            <div class="ap-modal-head"><strong>Delete chat</strong></div>
            <p class="ap-muted">Delete "{deleteRow()!.title}"? This can't be undone.</p>
            <div class="ap-row-end">
              <button type="button" class="ap-btn ap-btn-ghost" onClick={() => setDeleteRow(undefined)}>Cancel</button>
              <button type="button" class="ap-btn" onClick={() => void doDelete()}>Delete</button>
            </div>
          </div>
        </div>
      </Show>
      </Portal>
    </aside>
  )
}

/** Headless: keeps the voice-call loop alive regardless of which panel is open.
 *  When a call is active, each new agent reply is spoken with the local TTS. */
function VoiceCallHost(props: { sessionID?: string; lastReply: () => string }) {
  let spoken = ""
  createEffect(() => {
    setCallSession(props.sessionID)
    const st = call.state()
    const text = props.lastReply()
    if (st === "connecting") { spoken = text; return }
    if (st !== "listening" && st !== "thinking" && st !== "speaking") return
    if (!text || text === spoken) return
    spoken = text
    void speakReply(text)
  })
  createEffect(() => {
    const message = call.error()
    if (message) aporiaAlerts.push({ title: "Voice failed", detail: message, level: "error" })
  })
  return null
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
