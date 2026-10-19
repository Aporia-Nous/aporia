// Stage 4: wire AnShell around real session children with sticky `an` theme and bound roster/attention.
import { aporiaAlerts, AlertToasts } from "@/aporia/alerts"
import { agentFor, bots, refreshBots, type Bot } from "@/aporia/bots"
import { BotDispatcher } from "@/aporia/dispatch"
import { ComposerMic } from "@/aporia/dictation"
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
import { attentionBindResult, missionFromSession, rosterBindResult, type AnBindBot } from "./bind"
import { isAnShellMode, type AnShellMode } from "./tokens"
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

  const agentStatus = createMemo(() => {
    const map = new Map<string, string>()
    for (const session of data.session.list() ?? []) {
      const agent = session.agent
      if (!agent) continue
      try {
        const status = String(data.session.status(session.id) ?? "")
        if (status === "running") map.set(agent, "running")
        else if (!map.has(agent)) map.set(agent, status)
      } catch {
        /* status unavailable for this session */
      }
    }
    return map
  })

  const bound = createMemo(() =>
    rosterBindResult({
      available: list()?.available ?? false,
      bots: list()?.bots ?? [],
      currentAgent: currentAgent(),
      agentStatus: agentStatus(),
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
  return (
    <>
      <Portal>
        <AlertToasts />
      </Portal>
      <ComposerMic />
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
  const info = () => props.view.info()
  const currentAgent = () => info()?.agent
  const roster = useAnRoster(currentAgent)
  const attention = useAnAttention()

  const onModeChange = (next: AnShellMode) => {
    if (!isAnShellMode(next)) return
    setMode(next)
  }

  const onHandBack = () => {
    setMode("conversation")
    aporiaAlerts.push({
      title: "Handed back",
      detail: "Returned to Conversation. Computer backend not attached — control was chrome-only.",
      level: "info",
    })
  }

  const onStopTakeover = () => {
    setMode("view")
    aporiaAlerts.push({
      title: "Takeover stopped",
      detail: "Switched to View (watch-only). No live computer input was granted.",
      level: "info",
    })
  }

  const navItems = (): AnNavItem[] => [
    { id: "home", label: "Home", icon: "home", active: !props.view.sessionID() },
    { id: "missions", label: "Missions", icon: "missions", active: !!props.view.sessionID() },
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
      computerLive: false,
      includeTeam: true,
    }),
  )

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
        computerEmpty="No live computer feed yet. Panel stays visible — attach a computer session to populate."
        computerTitle="Live computer"
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

