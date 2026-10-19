// Stage 4: wire AnShell around real session children with sticky `an` theme and bound roster/attention.
import { aporiaAlerts, AlertToasts } from "@/aporia/alerts"
import { agentFor, bots, refreshBots, type Bot } from "@/aporia/bots"
import { call } from "@/aporia/call"
import { BotDispatcher } from "@/aporia/dispatch"
import { FlowCommands } from "@/aporia/flows"
import { ReactionsLayer } from "@/aporia/reactions"
import { prettyTitle, projectName } from "@/aporia/session-list"
import { UpdateWatcher } from "@/aporia/update"
import { useData, useServer } from "@/runtime/server/current"
import { useServerSDK } from "@/runtime/server/client"
import { useCommand } from "@/shell/commands/command"
import { sessionHref } from "@/shell/routes/session"
import { useSettingsDialog } from "@/settings/command"
import type { SessionModel } from "@/session/model"
import type { SessionInfo, SessionMessageInfo } from "@opencode/client/promise"
import { Session } from "@opencode/schema/session"
import { useTheme } from "@opencode/ui/theme/context"
import { useNavigate } from "@solidjs/router"
import { Show, createEffect, createMemo, createResource, createSignal, onCleanup, type ParentProps } from "solid-js"
import { Portal } from "solid-js/web"
import { AnShell } from "./an-shell"
import { buildStreamCards } from "./cards"
import {
  beginComputerConsent,
  cancelComputerConsent,
  computerAttachEmptyCopy,
  computerAttachPathLabel,
  confirmComputerAttach,
  disconnectComputerAttach,
  initialComputerAttachState,
  isComputerCursorVisible,
  isComputerLive,
  rescopeComputerAttach,
  selectComputerAttachPath,
  setExternalAttachDraft,
  type ComputerAttachPath,
  type ComputerAttachState,
} from "./computer-attach"
import { probeExternalBrowserEndpoint } from "./computer-external"
import {
  clearComputerFeed,
  isComputerFeedActive,
  navigateComputerFeed,
  syncComputerFeed,
  type ComputerFeedState,
} from "./computer-feed"
import {
  clearComputerControl,
  computerControlNote,
  feedIsWatchOnly,
  initialComputerControlState,
  isBotCursorShown,
  releaseToBot,
  rescopeComputerControl,
  stopUserControl,
  syncComputerControl,
  userMayInput,
  type ComputerControlState,
} from "./computer-control"
import { AnContraptionsPanel } from "./contraptions-panel"
import { messagesToConversationTurns } from "./conversation-turns"
import {
  attentionBindResult,
  missionFromSession,
  rosterBindResult,
  sessionActivityFromMessages,
  type AnBindBot,
  type AnPresenceSignal,
} from "./bind"
import { AN_CONTRAPTIONS_SURFACE, isAnShellMode, type AnShellMode } from "./tokens"
import type { AnNavItem } from "./types"

const ATTENTION_POLL_MS = 5000

type ShellView = {
  directory: () => string
  sessionID: () => string | undefined
  info: () => SessionInfo | undefined
  working: () => boolean
  messages: () => SessionMessageInfo[]
}

const noMessages: SessionMessageInfo[] = []

function useStickyAnTheme() {
  const theme = useTheme()
  createEffect(() => {
    if (theme.themeId() !== "an") theme.setTheme("an")
    if (theme.colorScheme() !== "dark") theme.setColorScheme("dark")
  })
}

function useAnRoster(currentAgent: () => string | undefined) {
  const data = useData()
  const [version, setVersion] = createSignal(0)
  const bridge = () => !!(globalThis as { electron?: { aporia?: { bots?: unknown } } }).electron?.aporia?.bots
  const [list] = createResource(
    () => version(),
    async () => {
      if (!bridge()) return { available: false as const, bots: [] as AnBindBot[] }
      try {
        const rows = (await bots({ op: "list" })) as Bot[]
        return {
          available: true as const,
          bots: (rows ?? []).map((b) => ({ slug: b.slug, name: b.name, role: b.role, avatar: b.avatar })),
        }
      } catch {
        return { available: false as const, bots: [] as AnBindBot[] }
      }
    },
    { initialValue: { available: bridge(), bots: [] as AnBindBot[] } },
  )

  const agentSignals = createMemo(() => {
    const map = new Map<string, AnPresenceSignal>()
    const callState = call.state()
    const callActive = call.active
    const selected = currentAgent()

    for (const session of data.session.list() ?? []) {
      const agent = session.agent
      if (!agent) continue
      let sessionStatus = ""
      try {
        sessionStatus = String(data.session.status(session.id) ?? "")
      } catch {
        /* status unavailable for this session */
      }

      let awaitingUser = false
      try {
        awaitingUser = (data.session.permission.list(session.id)?.length ?? 0) > 0
      } catch {
        awaitingUser = false
      }

      let activity: AnPresenceSignal["activity"] = "none"
      if (sessionStatus === "running") {
        try {
          activity = sessionActivityFromMessages(data.session.message.list(session.id) ?? [])
        } catch {
          activity = "none"
        }
      }

      const prev = map.get(agent)
      const preferRunning = sessionStatus === "running" || prev?.sessionStatus === "running"
      const next: AnPresenceSignal = {
        sessionStatus: preferRunning ? "running" : sessionStatus || prev?.sessionStatus,
        activity:
          sessionStatus === "running"
            ? activity
            : prev?.sessionStatus === "running"
              ? prev.activity
              : activity,
        awaitingUser: awaitingUser || !!prev?.awaitingUser,
      }

      // Voice call is a module singleton — apply only to the selected agent while active.
      if (callActive && agent === selected) {
        next.callState = callState
      }

      map.set(agent, next)
    }

    // Selected agent may have no session row yet; still surface live call presence.
    if (callActive && selected && !map.has(selected)) {
      map.set(selected, { callState })
    }

    return map
  })

  const bound = createMemo(() =>
    rosterBindResult({
      available: list()?.available ?? false,
      bots: list()?.bots ?? [],
      currentAgent: currentAgent(),
      agentSignals: agentSignals(),
    }),
  )

  return {
    bound,
    refresh: () => setVersion((v) => v + 1),
    available: () => list()?.available ?? false,
  }
}

function useAnAttention() {
  let sdk: ReturnType<typeof useServerSDK> | undefined
  try {
    sdk = useServerSDK()
  } catch {
    sdk = undefined
  }
  const [cards, setCards] = createSignal<{ id: string; title: string; body?: string; missionId?: string }[]>([])
  const [error, setError] = createSignal<string>()
  const available = () => !!(sdk as { api?: { mission?: unknown } } | undefined)?.api?.mission

  const refresh = async () => {
    if (!available()) {
      setCards([])
      setError(undefined)
      return
    }
    try {
      const result = await (sdk as any).api.mission.attention.list({ state: "open" })
      setCards(
        [...(result?.data ?? [])].map((c: any) => ({
          id: String(c.id),
          title: String(c.title ?? ""),
          body: typeof c.body === "string" ? c.body : undefined,
          missionId: typeof c.missionId === "string" ? c.missionId : undefined,
        })),
      )
      setError(undefined)
    } catch (e) {
      setCards([])
      setError(String((e as Error)?.message ?? e))
    }
  }

  void refresh()
  const timer = setInterval(() => void refresh(), ATTENTION_POLL_MS)
  onCleanup(() => clearInterval(timer))

  const bound = createMemo(() =>
    attentionBindResult({
      available: available(),
      error: error(),
      cards: cards(),
    }),
  )

  return { bound, refresh }
}

function AnShellHosts(props: { directory: string; agent?: string; sessionID?: string }) {
  // AP-STAGE4-13: do not mount ComposerMic under AnShell — mic/call are residual OC chrome.
  // Classic Aporia layout still mounts ComposerMic; CSS also hides inject leftovers.
  return (
    <>
      <Portal>
        <AlertToasts />
      </Portal>
      <UpdateWatcher />
      <BotDispatcher />
      <FlowCommands />
      <ReactionsLayer sessionID={props.sessionID} agent={props.agent} />
    </>
  )
}

function AnShellFrame(props: ParentProps<{ view: ShellView }>) {
  useStickyAnTheme()
  const navigate = useNavigate()
  const data = useData()
  const server = useServer()
  const command = useCommand()
  const openSettings = useSettingsDialog()
  const [mode, setMode] = createSignal<AnShellMode>("conversation")
  const [contraptionsOpen, setContraptionsOpen] = createSignal(false)
  const [computerAttach, setComputerAttach] = createSignal<ComputerAttachState>(
    initialComputerAttachState(props.view.sessionID()),
  )
  const [computerFeed, setComputerFeed] = createSignal<ComputerFeedState>(clearComputerFeed())
  const [computerFeedDraft, setComputerFeedDraft] = createSignal("")
  const [computerControl, setComputerControl] = createSignal<ComputerControlState>(
    initialComputerControlState(props.view.sessionID()),
  )
  const info = () => props.view.info()
  const currentAgent = () => info()?.agent
  const roster = useAnRoster(currentAgent)
  const attention = useAnAttention()
  const computerLive = createMemo(() => isComputerLive(computerAttach()))
  const computerFeedActive = createMemo(() => isComputerFeedActive(computerFeed(), computerAttach()))
  const computerUserInput = createMemo(() => userMayInput(computerControl()))
  const computerFeedWatchOnly = createMemo(() => feedIsWatchOnly(computerControl()))
  const computerCursorVisible = createMemo(
    () => isComputerCursorVisible(computerAttach()) && isBotCursorShown(computerLive(), computerControl()),
  )

  createEffect(() => {
    const sessionID = props.view.sessionID()
    setComputerAttach((prev) => rescopeComputerAttach(prev, sessionID))
    setComputerControl((prev) => rescopeComputerControl(prev, sessionID))
  })

  /** Keep page feed honest with Live attach — open on attach, clear on disconnect/rescope. */
  createEffect(() => {
    const attach = computerAttach()
    setComputerFeed((prev) => syncComputerFeed(prev, attach))
    if (!isComputerLive(attach)) {
      setComputerFeedDraft("")
      return
    }
    setComputerFeedDraft((draft) => draft || "about:blank")
  })

  /** Single control lock follows Live + presentation mode (BF-03). */
  createEffect(() => {
    const live = computerLive()
    const nextMode = mode()
    const sessionID = props.view.sessionID()
    setComputerControl((prev) =>
      syncComputerControl(prev, { live, mode: nextMode, sessionID }),
    )
  })

  const onModeChange = (next: AnShellMode) => {
    if (!isAnShellMode(next)) return
    if (next === "takeover" && !computerLive()) {
      aporiaAlerts.push({
        title: "Takeover",
        detail: "Connect and attach a local browser workspace before taking control. Layout-only until Live.",
        level: "warn",
      })
    }
    setMode(next)
  }

  const onHandBack = () => {
    setComputerControl((prev) => releaseToBot(prev, computerLive()))
    setMode("conversation")
    aporiaAlerts.push({
      title: "Handed back",
      detail: computerLive()
        ? "Returned to Conversation. Bot holds the lock again — fresh observation required before bot drives. Workspace stays attached until Disconnect."
        : "Returned to Conversation. No Live attach — control was chrome-only.",
      level: "info",
    })
  }

  const onStopTakeover = () => {
    setComputerControl((prev) => stopUserControl(prev, computerLive()))
    setMode("view")
    aporiaAlerts.push({
      title: "Takeover stopped",
      detail: computerLive()
        ? "Switched to Computer View (watch-only). Bot holds the lock; fresh observation required before bot drives."
        : "Switched to Computer View. No Live attach — no page input was granted.",
      level: "info",
    })
  }

  const navItems = (): AnNavItem[] => [
    { id: "home", label: "Home", icon: "home", active: !props.view.sessionID() && !contraptionsOpen() },
    {
      id: "missions",
      label: "Missions",
      icon: "missions",
      active: !!props.view.sessionID() && !contraptionsOpen(),
    },
    {
      id: AN_CONTRAPTIONS_SURFACE.navId,
      label: AN_CONTRAPTIONS_SURFACE.label,
      icon: "contraptions",
      active: contraptionsOpen(),
    },
    { id: "knowledge", label: "Knowledge", icon: "knowledge" },
    { id: "settings", label: "Settings", icon: "settings" },
  ]

  const mission = createMemo(() =>
    missionFromSession({
      title: info()?.title ? prettyTitle(info()!.title) : undefined,
      agent: currentAgent(),
      directory: props.view.directory() ? projectName(props.view.directory()) : undefined,
      working: props.view.working(),
    }),
  )

  const openMember = async (slug: string) => {
    const agent = agentFor(slug)
    const existing = (data.session.list() ?? []).find((s) => s.agent === agent && !s.parentID && !s.time.archived)
    if (existing) {
      navigate(sessionHref(server.key, existing.id))
      return
    }
    if (!roster.available()) {
      aporiaAlerts.push({
        title: "Could not open teammate",
        detail: "Teammate roster unavailable (desktop bridge not connected).",
        level: "error",
      })
      return
    }
    try {
      const list = (await bots({ op: "list" })) as Bot[]
      const bot = list.find((b) => b.slug === slug)
      if (!bot) {
        aporiaAlerts.push({ title: "Teammate not found", detail: slug, level: "error" })
        return
      }
      const paths = (await bots({ op: "paths" })) as { bots?: string }
      const [providerID, ...rest] = (bot.model || "deepseek/deepseek-flash").split("/")
      const directory = `${paths?.bots ?? ""}\\${bot.slug}`
      const created = data.session.create({
        id: Session.ID.create(),
        agent,
        model: { id: rest.join("/"), providerID },
        location: { directory },
      } as any)
      await created.request
      await bots({ op: "attachSession", slug: bot.slug, sessionID: created.id })
      refreshBots()
      navigate(sessionHref(server.key, created.id))
    } catch (err) {
      aporiaAlerts.push({
        title: "Couldn't open teammate",
        detail: err instanceof Error ? err.message : String(err),
        level: "error",
      })
    }
  }

  const onSelectNav = (id: string) => {
    if (id === AN_CONTRAPTIONS_SURFACE.navId) {
      setContraptionsOpen((open) => !open)
      return
    }
    setContraptionsOpen(false)
    if (id === "home") navigate("/")
    else if (id === "settings") openSettings()
    else if (id === "missions") command.trigger("tab.new")
  }

  const streamCards = createMemo(() =>
    buildStreamCards({
      attention: attention.bound().attention,
      roster: roster.bound().roster,
      session: {
        sessionID: props.view.sessionID(),
        title: info()?.title ? prettyTitle(info()!.title) : undefined,
        agent: currentAgent(),
        working: props.view.working(),
      },
      messages: props.view.messages(),
      computerLive: computerLive(),
      computerFeedActive: computerFeedActive(),
      computerUserControl: computerUserInput(),
      includeTeam: true,
    }),
  )

  const onComputerConnect = () => {
    setComputerAttach((prev) => beginComputerConsent(prev))
    if (!props.view.sessionID()) {
      aporiaAlerts.push({
        title: "Computer View",
        detail: "Open a session before connecting a browser workspace.",
        level: "warn",
      })
      return
    }
    aporiaAlerts.push({
      title: "Confirm browser attach",
      detail: "Choose Local workspace or your Edge/Chrome region (loopback). Not a VM. Confirm to go Live.",
      level: "info",
    })
  }

  const onComputerAttachPathChange = (path: ComputerAttachPath) => {
    setComputerAttach((prev) => selectComputerAttachPath(prev, path))
  }

  const onComputerExternalDraftChange = (draft: {
    endpoint?: string
    region?: string
    family?: string
  }) => {
    setComputerAttach((prev) => setExternalAttachDraft(prev, draft))
  }

  const onComputerExternalProbe = () => {
    const draft = computerAttach().externalDraftEndpoint ?? ""
    void probeExternalBrowserEndpoint(draft).then((result) => {
      if (!result.ok) {
        setComputerAttach((prev) => ({ ...prev, error: result.error }))
        aporiaAlerts.push({ title: "External browser", detail: result.error, level: "warn" })
        return
      }
      setComputerAttach((prev) =>
        setExternalAttachDraft({ ...prev, error: undefined }, { endpoint: result.endpoint }),
      )
      aporiaAlerts.push({
        title: "Endpoint reachable",
        detail: result.browser
          ? `${result.browser} answered on ${result.endpoint}. Enter a region id, then Confirm attach.`
          : `${result.endpoint} answered. Enter a region id, then Confirm attach.`,
        level: "info",
      })
    })
  }

  const onComputerConfirmAttach = () => {
    setComputerAttach((prev) => {
      const next = confirmComputerAttach(prev)
      if (next.error) {
        aporiaAlerts.push({ title: "Computer View", detail: next.error, level: "warn" })
        return next
      }
      if (!isComputerLive(next)) {
        aporiaAlerts.push({
          title: "Computer View",
          detail: "Attach did not go Live — check consent path and try again.",
          level: "warn",
        })
        return next
      }
      aporiaAlerts.push({
        title:
          next.backend === "external-chromium"
            ? "Edge/Chrome region attached"
            : "Browser workspace attached",
        detail:
          next.backend === "external-chromium"
            ? `Live on ${next.externalEndpoint} · region ${next.externalRegionId}. Watch-only until Takeover.`
            : "Computer View is Live with watch-only page feed. Disconnect clears Live and feed.",
        level: "info",
      })
      return next
    })
  }

  const onComputerCancelConsent = () => {
    setComputerAttach((prev) => cancelComputerConsent(prev))
  }

  const onComputerDisconnect = () => {
    setComputerAttach((prev) => disconnectComputerAttach(prev))
    setComputerFeed(clearComputerFeed())
    setComputerFeedDraft("")
    setComputerControl(clearComputerControl(props.view.sessionID()))
    if (mode() === "takeover") setMode("view")
    aporiaAlerts.push({
      title: "Browser workspace disconnected",
      detail: "Live, page feed, and control lock cleared. Re-connect requires fresh consent.",
      level: "info",
    })
  }

  const onComputerFeedNavigate = (input: string) => {
    if (!computerLive()) {
      aporiaAlerts.push({
        title: "Computer View",
        detail: "Attach a browser workspace before navigating the page feed.",
        level: "warn",
      })
      return
    }
    setComputerFeed((prev) => {
      const next = navigateComputerFeed(prev, input, computerAttach())
      if (next.error) {
        aporiaAlerts.push({ title: "Page feed", detail: next.error, level: "warn" })
        return prev
      }
      setComputerFeedDraft(next.url)
      return next
    })
  }

  /** Own Conversation when a session is open (incl. empty) — home/draft keep OpenCode welcome. */
  const conversationTurns = createMemo(() => {
    if (!props.view.sessionID()) return undefined
    return messagesToConversationTurns(props.view.messages())
  })

  const onNewTeammate = () => {
    aporiaAlerts.push({
      title: "New teammate",
      detail: "Teammate creation sheet not wired yet — stub only (AP-STAGE4-06).",
      level: "info",
    })
  }

  const rosterFooter = () => {
    const reason = roster.bound().emptyReason
    return (
      <div class="an-roster-footer-stack">
        <Show when={reason}>
          <span class="an-roster-empty">{reason}</span>
        </Show>
        <button type="button" class="an-new-teammate" onClick={onNewTeammate} title="New teammate (stub)">
          + New teammate
        </button>
      </div>
    )
  }

  return (
    <div class="an-shell-root" data-component="an-shell-session">
      <AnShellHosts directory={props.view.directory()} agent={currentAgent()} sessionID={props.view.sessionID()} />
      <AnShell
        mode={mode()}
        onModeChange={onModeChange}
        onHandBack={onHandBack}
        onStopTakeover={onStopTakeover}
        navItems={navItems()}
        roster={roster.bound().roster}
        rosterFooter={rosterFooter()}
        mission={mission()}
        attention={attention.bound().attention}
        attentionEmpty={attention.bound().emptyMessage}
        streamCards={streamCards()}
        conversationTurns={conversationTurns()}
        conversationEmpty="No messages yet — send from the composer below. Conversation is owned by AnShell."
        computerEmpty={computerAttachEmptyCopy(computerAttach())}
        computerTitle="Computer View"
        computerLive={computerLive()}
        computerAttachPhase={computerAttach().phase}
        computerAttachPath={computerAttach().path}
        computerAttachBackend={computerAttach().backend}
        computerAttachPathLabel={computerAttachPathLabel(computerAttach())}
        computerExternalDraftEndpoint={computerAttach().externalDraftEndpoint}
        computerExternalDraftRegion={computerAttach().externalDraftRegion}
        computerExternalDraftFamily={computerAttach().externalDraftFamily}
        computerExternalEndpoint={computerAttach().externalEndpoint}
        computerExternalRegionId={computerAttach().externalRegionId}
        computerCursorVisible={computerCursorVisible()}
        computerFeedActive={computerFeedActive()}
        computerFeedUrl={computerFeed().url || undefined}
        computerFeedSrcdoc={computerFeed().srcdoc}
        computerFeedDraft={computerFeedDraft()}
        computerFeedWatchOnly={computerFeedWatchOnly()}
        computerController={computerControl().controller}
        computerBotPaused={computerControl().botPaused}
        computerUserInput={computerUserInput()}
        computerNeedsFreshObservation={computerControl().needsFreshObservation}
        computerNote={computerControlNote(computerLive(), computerControl())}
        onComputerFeedDraftChange={setComputerFeedDraft}
        onComputerFeedNavigate={onComputerFeedNavigate}
        onComputerConnect={onComputerConnect}
        onComputerConfirmAttach={onComputerConfirmAttach}
        onComputerCancelConsent={onComputerCancelConsent}
        onComputerDisconnect={onComputerDisconnect}
        onComputerAttachPathChange={onComputerAttachPathChange}
        onComputerExternalDraftChange={onComputerExternalDraftChange}
        onComputerExternalProbe={onComputerExternalProbe}
        onSelectNav={onSelectNav}
        onSelectMember={(id) => void openMember(id)}
        onStreamCardAction={(actionId, card) => {
          aporiaAlerts.push({
            title: `${card.type} · ${actionId}`,
            detail: "Card action stub — backend not bound for this control yet.",
            level: "info",
          })
        }}
      >
        <div class="an-stream-slot">{props.children}</div>
      </AnShell>
      <Show when={contraptionsOpen()}>
        <AnContraptionsPanel onClose={() => setContraptionsOpen(false)} />
      </Show>
    </div>
  )
}

export function AnShellSessionLayout(props: ParentProps<{ session: SessionModel }>) {
  const view: ShellView = {
    directory: () => props.session.workspace.directory(),
    sessionID: () => props.session.identity.sessionID(),
    info: () => props.session.data.info(),
    working: () => props.session.data.working(),
    messages: () => props.session.history.messages(),
  }
  return <AnShellFrame view={view}>{props.children}</AnShellFrame>
}

export function AnShellDraftLayout(props: ParentProps<{ directory: string }>) {
  const view: ShellView = {
    directory: () => props.directory,
    sessionID: () => undefined,
    info: () => undefined,
    working: () => false,
    messages: () => noMessages,
  }
  return <AnShellFrame view={view}>{props.children}</AnShellFrame>
}

export function AnShellHomeLayout(props: ParentProps) {
  const view: ShellView = {
    directory: () => "",
    sessionID: () => undefined,
    info: () => undefined,
    working: () => false,
    messages: () => noMessages,
  }
  return <AnShellFrame view={view}>{props.children}</AnShellFrame>
}

