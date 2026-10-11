// APORIA: Teammates sidebar section + bot editor. Bots are stored by the desktop main process (aporia-bots.ts);
// clicking a bot opens its newest chat (agent aporia-<slug>) or starts one in its own folder.
import { createMemo, createResource, createSignal, For, Show } from "solid-js"
import { useNavigate } from "@solidjs/router"
import { Session } from "@opencode/schema/session"
import type { SessionInfo } from "@opencode/client/promise"
import { useData, useServer } from "@/runtime/server/current"
import { sessionHref } from "@/shell/routes/session"
import { aporiaAlerts } from "./alerts"

export type Bot = {
  slug: string; name: string; avatar?: string; role: string; instructions: string; model: string
  tools: string[]; mcps: string[]; skills: string[]; voice?: string; folder?: string
  routines: { id: string; name: string; cron: string; prompt: string; enabled: boolean }[]; sessions: string[]
}
const bridge = () => (globalThis as any).electron?.aporia?.bots as undefined | ((i: unknown) => Promise<any>)
export const bots = (input: unknown) => (bridge() ? bridge()!(input) : Promise.reject(new Error("Teammates need the Aporia desktop app")))
const [version, setVersion] = createSignal(0)
export const refreshBots = () => setVersion(version() + 1)
export const agentFor = (slug: string) => `aporia-${slug}`

export function TeammatesSection(props: { sessions: SessionInfo[]; currentAgent?: string }) {
  const data = useData()
  const server = useServer()
  const navigate = useNavigate()
  const [list] = createResource(version, () => bots({ op: "list" }) as Promise<Bot[]>, { initialValue: [] })
  const [paths] = createResource(() => bots({ op: "paths" }) as Promise<{ bots: string }>)
  const [editing, setEditing] = createSignal<Partial<Bot> | undefined>()
  const [collapsed, setCollapsed] = createSignal<Record<string, boolean>>(JSON.parse(localStorage.getItem("aporia.bots.collapsed") ?? "{}"))
  const groups = createMemo(() => {
    const g = new Map<string, Bot[]>()
    for (const b of list() ?? []) g.set(b.folder || "Teammates", [...(g.get(b.folder || "Teammates") ?? []), b])
    return [...g.entries()].sort(([a], [b]) => (a === "Main" ? -1 : b === "Main" ? 1 : a.localeCompare(b)))
  })
  const toggle = (k: string) => { const n = { ...collapsed(), [k]: !collapsed()[k] }; setCollapsed(n); localStorage.setItem("aporia.bots.collapsed", JSON.stringify(n)) }

  const open = async (bot: Bot, fresh = false) => {
    const agent = agentFor(bot.slug)
    const existing = fresh ? undefined : props.sessions.find((s) => s.agent === agent && !s.parentID && !s.time.archived)
    if (existing) return navigate(sessionHref(server.key, existing.id))
    try {
      const [providerID, ...rest] = (bot.model || "deepseek/deepseek-flash").split("/")
      const directory = `${paths()?.bots ?? ""}\\${bot.slug}`
      const created = data.session.create({ id: Session.ID.create(), agent, model: { id: rest.join("/"), providerID }, location: { directory } } as any)
      await created.request
      await bots({ op: "attachSession", slug: bot.slug, sessionID: created.id })
      navigate(sessionHref(server.key, created.id))
    } catch (err) {
      aporiaAlerts.push({ title: `Couldn't open ${bot.name}`, detail: err instanceof Error ? err.message : String(err), level: "error" })
    }
  }

  return (
    <div data-component="aporia-teammates">
      <div class="ap-section-label ap-chats-label">
        Teammates <span class="ap-count">{list()?.length ?? 0}</span>
        <button type="button" class="ap-sub-toggle" title="New bot" data-action="aporia-bot-new" onClick={() => setEditing({ name: "", role: "", instructions: "", model: "deepseek/deepseek-flash", folder: "Teammates" })}>+ New bot</button>
      </div>
      <nav class="ap-bot-list">
        <For each={groups()}>
          {([folder, items]) => (
            <>
              <button type="button" class="ap-bot-folder" onClick={() => toggle(folder)}>{collapsed()[folder] ? "▸" : "▾"} {folder}</button>
              <Show when={!collapsed()[folder]}>
                <For each={items}>
                  {(bot) => (
                    <div class="ap-session ap-bot" classList={{ "ap-selected": props.currentAgent === agentFor(bot.slug) }} data-bot={bot.slug}>
                      <button type="button" class="ap-bot-main" onClick={() => void open(bot)} title={bot.role}>
                        <span class="ap-avatar ap-bot-avatar">{bot.avatar || bot.name.slice(0, 2).toUpperCase()}</span>
                        <span class="ap-session-text">
                          <strong class="ap-ellipsis">{bot.name}</strong>
                          <span class="ap-muted ap-ellipsis">{bot.role}</span>
                        </span>
                      </button>
                      <button type="button" class="ap-bot-mini" title="New chat with this bot" onClick={() => void open(bot, true)}>＋</button>
                      <button type="button" class="ap-bot-mini" title="Edit bot" onClick={() => setEditing({ ...bot })}>⋯</button>
                    </div>
                  )}
                </For>
              </Show>
            </>
          )}
        </For>
      </nav>
      <Show when={editing()}>
        <BotEditor bot={editing()!} onClose={() => setEditing(undefined)} />
      </Show>
    </div>
  )
}

function BotEditor(props: { bot: Partial<Bot>; onClose: () => void }) {
  const [b, setB] = createSignal<Partial<Bot>>({ ...props.bot })
  const [tab, setTab] = createSignal<"profile" | "memory" | "shared">("profile")
  const [mem, setMem] = createSignal("")
  const [error, setError] = createSignal("")
  const isNew = !props.bot.slug
  const set = (k: keyof Bot, v: unknown) => setB({ ...b(), [k]: v })
  const list = (v: string) => v.split(",").map((s) => s.trim()).filter(Boolean)
  const loadMem = async (scope: "bot" | "user") => setMem((await bots({ op: "memory", scope, slug: b().slug })) ?? "")
  const save = async () => {
    setError("")
    try {
      if (tab() === "profile") await bots({ op: "save", bot: b() })
      else await bots({ op: "memory", scope: tab() === "shared" ? "user" : "bot", slug: b().slug, text: mem() })
      refreshBots()
      aporiaAlerts.push({ title: tab() === "profile" ? `Saved ${b().name}` : "Memory saved", level: "success" })
      if (tab() === "profile") props.onClose()
    } catch (err) { setError(err instanceof Error ? err.message : String(err)) }
  }
  const field = { width: "100%", "box-sizing": "border-box", background: "transparent", color: "inherit", border: "1px solid var(--ap-line-strong)", "border-radius": "8px", padding: "6px 8px", font: "inherit" } as const
  return (
    <div class="ap-overlay" role="dialog" aria-modal="true" aria-label="Bot" onClick={props.onClose}>
      <div class="ap-modal" onClick={(e) => e.stopPropagation()} data-component="aporia-bot-editor">
        <div class="ap-modal-head">
          <strong>{isNew ? "New bot" : b().name}</strong>
          <button type="button" class="ap-icon-btn" aria-label="Close" onClick={props.onClose}>✕</button>
        </div>
        <Show when={!isNew}>
          <div style={{ display: "flex", gap: "6px" }}>
            <button type="button" class="ap-btn ap-btn-ghost" aria-pressed={tab() === "profile"} onClick={() => setTab("profile")}>Profile</button>
            <button type="button" class="ap-btn ap-btn-ghost" aria-pressed={tab() === "memory"} onClick={() => { setTab("memory"); void loadMem("bot") }}>Its memory</button>
            <button type="button" class="ap-btn ap-btn-ghost" aria-pressed={tab() === "shared"} onClick={() => { setTab("shared"); void loadMem("user") }}>Shared memory (USER.md)</button>
          </div>
        </Show>
        <div class="ap-modal-scroll" style={{ gap: "8px" }}>
          <Show when={tab() === "profile"} fallback={<textarea style={{ ...field, "min-height": "320px", "font-family": "monospace" }} value={mem()} onInput={(e) => setMem(e.currentTarget.value)} />}>
            <label>Name<input style={field} value={b().name ?? ""} onInput={(e) => set("name", e.currentTarget.value)} /></label>
            <label>Avatar (emoji or 2 letters)<input style={field} value={b().avatar ?? ""} onInput={(e) => set("avatar", e.currentTarget.value)} /></label>
            <label>Folder<input style={field} value={b().folder ?? ""} onInput={(e) => set("folder", e.currentTarget.value)} /></label>
            <label>Role / description<textarea style={{ ...field, "min-height": "60px" }} value={b().role ?? ""} onInput={(e) => set("role", e.currentTarget.value)} /></label>
            <label>Instructions<textarea style={{ ...field, "min-height": "180px" }} value={b().instructions ?? ""} onInput={(e) => set("instructions", e.currentTarget.value)} /></label>
            <label>Model (never auto-upgraded)<input style={field} value={b().model ?? "deepseek/deepseek-flash"} onInput={(e) => set("model", e.currentTarget.value)} /></label>
            <label>Skills (comma separated)<input style={field} value={(b().skills ?? []).join(", ")} onInput={(e) => set("skills", list(e.currentTarget.value))} /></label>
            <label>Allowed tools (comma separated, empty = all)<input style={field} value={(b().tools ?? []).join(", ")} onInput={(e) => set("tools", list(e.currentTarget.value))} /></label>
            <label>Allowed MCPs (comma separated, empty = all)<input style={field} value={(b().mcps ?? []).join(", ")} onInput={(e) => set("mcps", list(e.currentTarget.value))} /></label>
          </Show>
        </div>
        <Show when={error()}><div class="ap-card ap-card-err" role="alert">{error()}</div></Show>
        <div style={{ display: "flex", gap: "8px", "justify-content": "flex-end" }}>
          <Show when={!isNew && tab() === "profile"}>
            <button type="button" class="ap-btn ap-btn-ghost" onClick={async () => { if (!globalThis.confirm(`Remove ${b().name}? Its memory folder is kept.`)) return; await bots({ op: "delete", slug: b().slug }); refreshBots(); props.onClose() }}>Remove</button>
          </Show>
          <button type="button" class="ap-btn" data-action="aporia-bot-save" onClick={() => void save()}>Save</button>
        </div>
      </div>
    </div>
  )
}
