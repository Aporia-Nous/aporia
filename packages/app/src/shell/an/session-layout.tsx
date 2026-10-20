// Stage 4: wire AnShell around real session children with sticky `an` theme and bound roster/attention.
import { aporiaAlerts, AlertToasts } from "@/aporia/alerts"
import { agentFor, bots, refreshBots, type Bot } from "@/aporia/bots"
import { call } from "@/aporia/call"
import { BotDispatcher } from "@/aporia/dispatch"
import { FlowCommands } from "@/aporia/flows"
import { ReactionsLayer } from "@/aporia/reactions"
import { prettyTitle, projectName } from "@/aporia/session-list"
import { touchedFiles } from "@/aporia/session-stats"
import { UpdateWatcher } from "@/aporia/update"
import { useData, useServer } from "@/runtime/server/current"
import { useServerSDK } from "@/runtime/server/client"
import { formatServerError } from "@/runtime/server/errors"
import { useCommand } from "@/shell/commands/command"
import { useLanguage } from "@/runtime/i18n/language"
import { sessionHref } from "@/shell/routes/session"
import type { SessionModel } from "@/session/model"
import { fileContentFromBytes } from "@/workspaces/files/artifact"
import type { SessionInfo, SessionMessageInfo } from "@opencode/client/promise"
import { Session } from "@opencode/schema/session"
import { getDirectory, getFilename } from "@opencode/util/path"
import { useTheme } from "@opencode/ui/theme/context"
import { useNavigate } from "@solidjs/router"
import { Show, createEffect, createMemo, createResource, createSignal, onCleanup, type ParentProps } from "solid-js"
import { Portal } from "solid-js/web"
import { AnShell } from "./an-shell"
import { buildStreamCards } from "./cards"
import {
  buildContextCards,
  buildConversationStreamItems,
  buildMissionStackCards,
} from "./conversation-stream-items"
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
import { openExternalBrowserTab } from "./computer-external-window"
import {
  clearComputerFeed,
  isComputerFeedActive,
  navigateComputerFeed,
  normalizeComputerFeedUrl,
  syncComputerFeed,
  type ComputerFeedState,
} from "./computer-feed"
import {
  applyComputerScreencastFrame,
  clearComputerScreencast,
  computerPixelSource,
  computerScreencastStatusCopy,
  connectingComputerScreencast,
  failComputerScreencast,
  shouldStartComputerScreencast,
  syncComputerScreencast,
  type ComputerScreencastState,
} from "./computer-screencast"
import {
  startComputerScreencastSession,
  type ComputerScreencastSession,
} from "./computer-screencast-cdp"
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
import { AnSettingsPanel } from "./settings-panel"
import { extractDocxPlainText, officePreviewResidual } from "./docx-text"
import {
  binaryReviewContent,
  errorReviewContent,
  extensionOf,
  isOfficeReviewPath,
  loadingReviewContent,
  readyReviewContent,
  type AnReviewLoadedContent,
} from "./review-content"
import { AnReviewPanel } from "./review-panel"
import { messagesToConversationTurns } from "./conversation-turns"
import {
  attentionBindResult,
  missionFromSession,
  rosterBindResult,
  sessionActivityFromMessages,
  type AnBindBot,
  type AnPresenceSignal,
} from "./bind"
import {
  createOcServerEnginePort,
  EnginePortProvider,
  type EnginePort,
} from "./engine"
import { AN_CONTRAPTIONS_SURFACE, AN_REVIEW_SURFACE, isAnShellMode, type AnShellMode } from "./tokens"
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

function useAnRoster(currentAgent: () => string | undefined, engine: () => EnginePort) {
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
    const port = engine()

    for (const session of port.listSessions()) {
      const agent = session.agent
      if (!agent) continue
      let sessionStatus = ""
      try {
        sessionStatus = String(port.sessionStatus(session.id) ?? "")
      } catch {
        /* status unavailable for this session */
      }

      let awaitingUser = false
      try {
        awaitingUser = (port.listPermissions(session.id)?.length ?? 0) > 0
      } catch {
        awaitingUser = false
      }

      let activity: AnPresenceSignal["activity"] = "none"
      if (sessionStatus === "running") {
        try {
          activity = sessionActivityFromMessages(port.listMessages(session.id) ?? [])
        } catch {
          activity = "none"
        }
      }

      const prev = map.get(agent)
      const preferRunning = sessionStatus === "running" || prev?.sessionStatus === "running"
      // Session row exists → known companion. Normalize empty/non-running to idle.
      const normalizedStatus = preferRunning
        ? "running"
        : sessionStatus === "running"
          ? "running"
          : sessionStatus || prev?.sessionStatus || "idle"
      const next: AnPresenceSignal = {
        sessionStatus: normalizedStatus,
        known: true,
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

    // Selected agent may have no session row yet; still surface live call / idle presence.
    if (selected && !map.has(selected)) {
      map.set(
        selected,
        callActive ? { callState, known: true } : { sessionStatus: "idle", known: true },
      )
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
  const language = useLanguage()
  const [mode, setMode] = createSignal<AnShellMode>("conversation")
  const [contraptionsOpen, setContraptionsOpen] = createSignal(false)
  const [settingsOpen, setSettingsOpen] = createSignal(false)
  const [reviewOpen, setReviewOpen] = createSignal(false)
  const [reviewInitialTab, setReviewInitialTab] = createSignal<"browser" | "code" | "files" | "documents">("browser")
  const [reviewCodeContent, setReviewCodeContent] = createSignal<AnReviewLoadedContent | undefined>()
  const [reviewDocumentContent, setReviewDocumentContent] = createSignal<AnReviewLoadedContent | undefined>()
  let reviewSdk: ReturnType<typeof useServerSDK> | undefined
  try {
    reviewSdk = useServerSDK()
  } catch {
    reviewSdk = undefined
  }
  // AP-ENGINE-PORT-01/02: single AnShell ingress for prompt/stream + Settings providers/models/BYOK.
  const engine = createOcServerEnginePort(data, {
    connectKey: reviewSdk
      ? async (input) => {
          const location = input.directory ? { directory: input.directory } : undefined
          await reviewSdk!.api.integration.connect.key({
            integrationID: input.providerID,
            location,
            key: input.key,
          })
          data.location.provider.invalidate(location)
          data.location.model.invalidate(location)
          await Promise.all([data.location.provider.sync(location), data.location.model.sync(location)]).catch(
            () => undefined,
          )
        }
      : undefined,
  })
  // PORT-02: Ctrl+, / settings.open open AN Settings panel (not OC /settings React route).
  command.register("settings", () => [
    {
      id: "settings.open",
      title: language.t("command.settings.open"),
      category: language.t("command.category.settings"),
      keybind: "mod+comma",
      onSelect: () => {
        setContraptionsOpen(false)
        setReviewOpen(false)
        setSettingsOpen(true)
      },
    },
  ])
  const [computerAttach, setComputerAttach] = createSignal<ComputerAttachState>(
    initialComputerAttachState(props.view.sessionID()),
  )
  const [computerFeed, setComputerFeed] = createSignal<ComputerFeedState>(clearComputerFeed())
  const [computerFeedDraft, setComputerFeedDraft] = createSignal("")
  const [computerScreencast, setComputerScreencast] = createSignal<ComputerScreencastState>(
    clearComputerScreencast(),
  )
  const [computerControl, setComputerControl] = createSignal<ComputerControlState>(
    initialComputerControlState(props.view.sessionID()),
  )
  let screencastSession: ComputerScreencastSession | null = null
  const info = () => props.view.info()
  const currentAgent = () => info()?.agent
  /** Stream / cards / review file list — via EnginePort, not raw data.session.message.list. */
  const sessionMessages = (): SessionMessageInfo[] => {
    const id = props.view.sessionID()
    return id ? engine.listMessages(id) : noMessages
  }
  const roster = useAnRoster(currentAgent, () => engine)
  const attention = useAnAttention()
  const computerLive = createMemo(() => isComputerLive(computerAttach()))
  const computerFeedActive = createMemo(() => isComputerFeedActive(computerFeed(), computerAttach()))
  const computerUserInput = createMemo(() => userMayInput(computerControl()))
  const computerFeedWatchOnly = createMemo(() => feedIsWatchOnly(computerControl()))
  const computerCursorVisible = createMemo(
    () => isComputerCursorVisible(computerAttach()) && isBotCursorShown(computerLive(), computerControl()),
  )
  const computerPixelSrc = createMemo(() =>
    computerPixelSource(computerAttach(), computerScreencast(), computerFeedActive()),
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

  /** AP-BF-05: live CDP screencast for consented external Edge/Chrome region only. */
  createEffect(() => {
    const attach = computerAttach()
    const endpoint = attach.externalEndpoint
    const regionId = attach.externalRegionId
    const liveExternal = shouldStartComputerScreencast(attach)

    if (!liveExternal || !endpoint || !regionId) {
      if (screencastSession) {
        screencastSession.stop()
        screencastSession = null
      }
      setComputerScreencast((prev) => syncComputerScreencast(prev, attach))
      return
    }

    setComputerScreencast(connectingComputerScreencast(endpoint, regionId))
    // Electron renderer blocks CDP WebSocket; loopback HTTP relay (Vite plugin or :5199) returns real JPEG pixels.
    const envRelay = import.meta.env?.VITE_AN_CDP_RELAY_ORIGIN
    const relayOrigin = typeof envRelay === "string" && envRelay ? envRelay : "http://127.0.0.1:5199"
    const session = startComputerScreencastSession({
      endpoint,
      regionId,
      preferRelay: true,
      relayOrigin,
      onFrame: (frame) => {
        setComputerScreencast((prev) => applyComputerScreencastFrame(prev, frame))
      },
      onError: (error) => {
        setComputerScreencast((prev) => failComputerScreencast(prev, error))
      },
    })
    screencastSession = session
    onCleanup(() => {
      session.stop()
      if (screencastSession === session) screencastSession = null
    })
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

  const reviewFiles = createMemo(() =>
    touchedFiles(sessionMessages()).map((file) => ({ path: file.path, via: file.via })),
  )

  /** AP-STAGE4-18: load workspace file bytes into Review Code/Documents previews. */
  const loadReviewPath = async (rawPath: string, tab: "code" | "documents") => {
    const path = rawPath.trim().replace(/\\/g, "/")
    if (!path) return
    const setContent = tab === "code" ? setReviewCodeContent : setReviewDocumentContent
    setContent(loadingReviewContent(path))
    if (!reviewSdk) {
      setContent(errorReviewContent(path, "Workspace file API unavailable in this surface."))
      return
    }
    const directory = (props.view.directory() || "").replace(/\\/g, "/")
    const absolute = /^(?:[a-zA-Z]:\/|\/\/)/.test(path)
    if (!absolute && !directory) {
      setContent(
        errorReviewContent(
          path,
          "Open a session with a workspace directory, or paste an absolute path, to bind Review content.",
        ),
      )
      return
    }
    const request = absolute
      ? { path: getFilename(path), location: { directory: getDirectory(path) } }
      : { path, location: { directory } }
    try {
      const data = await reviewSdk.api.file.read(request)
      const content = fileContentFromBytes(path, data)
      if (content.type === "binary") {
        // STAGE4-19: free-path .docx text extract; other Office → honest residual (no paid deps).
        const ext = extensionOf(path)
        if (ext === "docx" && content.encoding === "base64" && content.content) {
          const raw = Uint8Array.from(atob(content.content), (c) => c.charCodeAt(0))
          const text = await extractDocxPlainText(raw)
          if (text) {
            setContent(readyReviewContent(path, text, { mimeType: content.mimeType, previewKind: "docx-text" }))
            return
          }
          setContent(binaryReviewContent(path, { mimeType: content.mimeType, error: officePreviewResidual("docx") }))
          return
        }
        if (isOfficeReviewPath(path)) {
          setContent(
            binaryReviewContent(path, { mimeType: content.mimeType, error: officePreviewResidual(ext) }),
          )
          return
        }
        setContent(binaryReviewContent(path, { mimeType: content.mimeType }))
        return
      }
      setContent(readyReviewContent(path, content.content, { mimeType: content.mimeType }))
    } catch (error) {
      setContent(errorReviewContent(path, formatServerError(error, undefined, "Could not read file for Review.")))
    }
  }

  const navItems = (): AnNavItem[] => [
    {
      id: "home",
      label: "Home",
      icon: "home",
      active: !props.view.sessionID() && !contraptionsOpen() && !reviewOpen(),
    },
    {
      id: "missions",
      label: "Missions",
      icon: "missions",
      active: !!props.view.sessionID() && !contraptionsOpen() && !reviewOpen(),
    },
    {
      id: AN_CONTRAPTIONS_SURFACE.navId,
      label: AN_CONTRAPTIONS_SURFACE.label,
      icon: "contraptions",
      active: contraptionsOpen(),
    },
    {
      id: AN_REVIEW_SURFACE.navId,
      label: AN_REVIEW_SURFACE.label,
      icon: "review",
      active: reviewOpen(),
    },
    { id: "knowledge", label: "Knowledge", icon: "knowledge" },
    { id: "settings", label: "Settings", icon: "settings", active: settingsOpen() },
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
    const existing = engine.listSessions().find((s) => s.agent === agent && !s.parentID && !s.time.archived)
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
      const created = engine.createSession({
        id: Session.ID.create(),
        agent,
        model: { id: rest.join("/"), providerID },
        directory,
      })
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
      setReviewOpen(false)
      setSettingsOpen(false)
      setContraptionsOpen((open) => !open)
      return
    }
    if (id === AN_REVIEW_SURFACE.navId) {
      setContraptionsOpen(false)
      setSettingsOpen(false)
      setReviewInitialTab("browser")
      setReviewOpen((open) => !open)
      return
    }
    if (id === "settings") {
      setContraptionsOpen(false)
      setReviewOpen(false)
      setSettingsOpen((open) => !open)
      return
    }
    setContraptionsOpen(false)
    setReviewOpen(false)
    setSettingsOpen(false)
    if (id === "home") navigate("/")
    else if (id === "missions") command.trigger("tab.new")
  }

  const onComputerExternalOpenTab = async () => {
    const attach = computerAttach()
    const endpoint = attach.externalDraftEndpoint ?? attach.externalEndpoint ?? ""
    const family = attach.externalDraftFamily ?? attach.externalFamily ?? "edge"
    const result = await openExternalBrowserTab({
      endpoint,
      family,
      url: "about:blank",
      allowSpawn: true,
    })
    if (!result.ok) {
      aporiaAlerts.push({
        title: "Browser windowing",
        detail: result.error,
        level: "warn",
      })
      return
    }
    setComputerAttach((prev) =>
      setExternalAttachDraft(prev, {
        endpoint: result.endpoint,
        region: result.regionId,
        family,
      }),
    )
    setReviewInitialTab("browser")
    setReviewOpen(true)
    setContraptionsOpen(false)
    aporiaAlerts.push({
      title: "Browser tab",
      detail:
        result.decision.action === "spawn-window"
          ? `Spawned one ${family} window (none was running) · region ${result.regionId}. Confirm attach for Live. Computer View / Review stay in-app.`
          : `Opened a tab in the existing ${family} window · region ${result.regionId}. Confirm attach for Live. Review panel stays in AnShell.`,
      level: "info",
    })
  }

  /** Flat card list retained for non-owned / tests; Conversation uses streamItems. */
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
      messages: sessionMessages(),
      computerLive: computerLive(),
      computerFeedActive: computerFeedActive(),
      computerUserControl: computerUserInput(),
      includeTeam: true,
    }),
  )

  /** Context cards (task/approval/computer/team) — tool cards interleaved from messages. */
  const contextCards = createMemo(() =>
    buildContextCards({
      attention: attention.bound().attention,
      roster: roster.bound().roster,
      session: {
        sessionID: props.view.sessionID(),
        title: info()?.title ? prettyTitle(info()!.title) : undefined,
        agent: currentAgent(),
        working: props.view.working(),
      },
      computerLive: computerLive(),
      computerFeedActive: computerFeedActive(),
      computerUserControl: computerUserInput(),
      includeTeam: true,
    }),
  )

  /** Collapsed Mission stack — empty when Conversation owns in-stream cards (AP-STAGE4-15). */
  const missionStackCards = createMemo(() =>
    buildMissionStackCards({ conversationOwnsCards: !!props.view.sessionID() }),
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
      // Prefer in-app Review panel for browse/review (AP-STAGE4-17) — not a separate OS window.
      if (next.backend === "local-browser") {
        setReviewInitialTab("browser")
        setReviewOpen(true)
        setContraptionsOpen(false)
      }
      aporiaAlerts.push({
        title:
          next.backend === "external-chromium"
            ? "Edge/Chrome region attached"
            : "Browser workspace attached",
        detail:
          next.backend === "external-chromium"
            ? `Live on ${next.externalEndpoint} · region ${next.externalRegionId}. Watch-only until Takeover. Review stays in AnShell.`
            : "Computer View is Live with watch-only page feed. Review Browser opened in-app (collapsible). Disconnect clears Live and feed.",
        level: "info",
      })
      return next
    })
  }

  const onComputerCancelConsent = () => {
    setComputerAttach((prev) => cancelComputerConsent(prev))
  }

  const onComputerDisconnect = () => {
    if (screencastSession) {
      screencastSession.stop()
      screencastSession = null
    }
    setComputerAttach((prev) => disconnectComputerAttach(prev))
    setComputerFeed(clearComputerFeed())
    setComputerFeedDraft("")
    setComputerScreencast(clearComputerScreencast())
    setComputerControl(clearComputerControl(props.view.sessionID()))
    if (mode() === "takeover") setMode("view")
    aporiaAlerts.push({
      title: "Browser workspace disconnected",
      detail: "Live, page feed, CDP screencast, and control lock cleared. Re-connect requires fresh consent.",
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
    // External Live: drive the consented CDP page when screencast is connected.
    const session = screencastSession
    const attach = computerAttach()
    if (session && shouldStartComputerScreencast(attach)) {
      const normalized = normalizeComputerFeedUrl(input)
      if (normalized.ok && normalized.url !== "about:blank") {
        void session.navigate(normalized.url).then((result) => {
          if (!result.ok) {
            aporiaAlerts.push({ title: "CDP navigate", detail: result.error, level: "warn" })
          }
        })
      }
    }
  }

  /** Own Conversation when a session is open (incl. empty) — home/draft keep OpenCode welcome. */
  const conversationTurns = createMemo(() => {
    if (!props.view.sessionID()) return undefined
    return messagesToConversationTurns(sessionMessages())
  })

  /** In-conversation turns + Task/Approval/Proof/Computer cards (mockup). */
  const streamItems = createMemo(() => {
    if (!props.view.sessionID()) return undefined
    return buildConversationStreamItems({
      messages: sessionMessages(),
      turns: conversationTurns() ?? [],
      contextCards: contextCards(),
    })
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
    <EnginePortProvider engine={engine}>
      <div
        class="an-shell-root"
        data-component="an-shell-session"
        data-an-engine="oc-server"
        data-an-engine-port="01"
      >
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
          missionStackCards={missionStackCards()}
          streamItems={streamItems()}
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
          computerScreencastPhase={computerScreencast().phase}
          computerScreencastFrameUrl={computerScreencast().frameDataUrl}
          computerScreencastFrameCount={computerScreencast().frameCount}
          computerPixelSource={computerPixelSrc()}
          computerScreencastStatus={computerScreencastStatusCopy(computerScreencast())}
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
          onComputerExternalOpenTab={() => void onComputerExternalOpenTab()}
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
        <Show when={settingsOpen()}>
          <AnSettingsPanel directory={props.view.directory()} onClose={() => setSettingsOpen(false)} />
        </Show>
        <Show when={reviewOpen()}>
          <AnReviewPanel
            initialTab={reviewInitialTab()}
            files={reviewFiles()}
            codeContent={reviewCodeContent()}
            documentContent={reviewDocumentContent()}
            computerLive={computerLive()}
            computerFeedUrl={computerFeed().url || undefined}
            onRequestPath={(path, tab) => {
              void loadReviewPath(path, tab)
            }}
            onClose={() => setReviewOpen(false)}
          />
        </Show>
      </div>
    </EnginePortProvider>
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

