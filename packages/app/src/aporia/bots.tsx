// APORIA: Teammates sidebar section + bot editor. Bots are stored by the desktop main process (aporia-bots.ts);
// clicking a bot opens its newest chat (agent aporia-<slug>) or starts one in its own folder.
import { createResource, createSignal, For, Show } from "solid-js"
import { Portal } from "solid-js/web"
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
  scopes?: string[]
  kind?: "expert" | "worker"
}
const bridge = () => (globalThis as any).electron?.aporia?.bots as undefined | ((i: unknown) => Promise<any>)
export const bots = (input: unknown) => (bridge() ? bridge()!(input) : Promise.reject(new Error("Teammates need the Aporetic desktop app")))
const [version, setVersion] = createSignal(0)
export const refreshBots = () => setVersion(version() + 1)
export const agentFor = (slug: string) => `aporia-${slug}`
const rbridge = () => (globalThis as any).electron?.aporia?.routines as undefined | ((i: unknown) => Promise<any>)
export const routines = (input: unknown) => (rbridge() ? rbridge()!(input) : Promise.reject(new Error("Needs the Aporetic desktop app")))

export function TeammatesSection(props: { sessions: SessionInfo[]; currentAgent?: string }) {
  const data = useData()
  const server = useServer()
  const navigate = useNavigate()
  const [list] = createResource(version, () => bots({ op: "list" }) as Promise<Bot[]>, { initialValue: [] })
  const [paths] = createResource(() => bots({ op: "paths" }) as Promise<{ bots: string }>)
  const [editing, setEditing] = createSignal<Partial<Bot> | undefined>()

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
        <button type="button" class="ap-sub-toggle" title="Import a .aporia-bot.json template" data-action="aporia-bot-import" onClick={async () => { try { const b = await routines({ op: "import" }); if (b) { refreshBots(); aporiaAlerts.push({ title: `Imported ${b.name}`, detail: "Its routines are off until you enable them.", level: "success" }) } } catch (err) { aporiaAlerts.push({ title: "Import failed", detail: String((err as Error)?.message ?? err), level: "error" }) } }}>Import</button>
      </div>
      <nav class="ap-bot-list ap-bot-chips">
        <For each={list() ?? []}>
          {(bot) => (
            <button
              type="button"
              class="ap-bot-chip"
              classList={{ "ap-selected": props.currentAgent === agentFor(bot.slug) }}
              title={`${bot.name} — ${bot.role}`}
              data-bot={bot.slug}
              onClick={() => void open(bot)}
              onContextMenu={(event) => { event.preventDefault(); setEditing({ ...bot }) }}
            >
              <span class="ap-avatar ap-bot-avatar">{bot.avatar || bot.name.slice(0, 2).toUpperCase()}</span>
              <span class="ap-bot-chip-name">{bot.name}</span>
            </button>
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
  const [tab, setTab] = createSignal<"profile" | "memory" | "shared" | "routines">("profile")
  const [describe, setDescribe] = createSignal("")
  const [drafting, setDrafting] = createSignal(false)
  const [mem, setMem] = createSignal("")
  const [error, setError] = createSignal("")
  const isNew = !props.bot.slug
  const set = (k: keyof Bot, v: unknown) => setB({ ...b(), [k]: v })
  const list = (v: string) => v.split(",").map((s) => s.trim()).filter(Boolean)
  const loadMem = async (scope: "bot" | "user") => setMem((await bots({ op: "memory", scope, slug: b().slug })) ?? "")
  const save = async () => {
    setError("")
    try {
      if (tab() === "profile" || tab() === "routines") await bots({ op: "save", bot: b() })
      else await bots({ op: "memory", scope: tab() === "shared" ? "user" : "bot", slug: b().slug, text: mem() })
      refreshBots()
      aporiaAlerts.push({ title: tab() !== "memory" && tab() !== "shared" ? `Saved ${b().name}` : "Memory saved", level: "success" })
      if (tab() === "profile" || isNew) props.onClose()
    } catch (err) { setError(err instanceof Error ? err.message : String(err)) }
  }
  const field = { width: "100%", "box-sizing": "border-box", background: "transparent", color: "inherit", border: "1px solid var(--ap-line-strong)", "border-radius": "8px", padding: "6px 8px", font: "inherit" } as const
  return (
    <Portal>
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
            <button type="button" class="ap-btn ap-btn-ghost" aria-pressed={tab() === "routines"} data-action="aporia-bot-routines" onClick={() => setTab("routines")}>Routines</button>
            <button type="button" class="ap-btn ap-btn-ghost" aria-pressed={tab() === "shared"} onClick={() => { setTab("shared"); void loadMem("user") }}>Shared memory (USER.md)</button>
          </div>
        </Show>
        <div class="ap-modal-scroll" style={{ gap: "8px" }}>
          <Show when={isNew}>
            <div class="ap-card" data-component="aporia-bot-builder">
              <strong>Describe the job in plain words</strong>
              <textarea style={{ ...field, "min-height": "70px" }} placeholder="e.g. Watch my Jotform/Google Form applicants every morning, score them, and draft a short summary for me" value={describe()} onInput={(e) => setDescribe(e.currentTarget.value)} />
              <div style={{ display: "flex", "justify-content": "flex-end" }}>
                <button type="button" class="ap-btn" data-action="aporia-bot-draft" disabled={drafting() || !describe().trim()} onClick={async () => {
                  setDrafting(true); setError("")
                  try { const d = await routines({ op: "draft", description: describe() }); setB({ ...b(), ...d }) } catch (err) { setError(err instanceof Error ? err.message : String(err)) } finally { setDrafting(false) }
                }}>{drafting() ? "Drafting with DeepSeek…" : "Draft with DeepSeek"}</button>
              </div>
              <span class="ap-muted ap-small">Fills in name, role, instructions, suggested tools and routines below. Edit anything, then Save. Suggested routines start off.</span>
            </div>
          </Show>
          <Show when={tab() === "routines"}>
            <RoutinesTab bot={b()} onChange={(r) => set("routines", r)} />
          </Show>
          <Show when={tab() === "profile"} fallback={tab() === "routines" ? null : <textarea style={{ ...field, "min-height": "320px", "font-family": "monospace" }} value={mem()} onInput={(e) => setMem(e.currentTarget.value)} />}>
            <label>Name<input style={field} value={b().name ?? ""} onInput={(e) => set("name", e.currentTarget.value)} /></label>
            <label>Avatar (emoji or 2 letters)<input style={field} value={b().avatar ?? ""} onInput={(e) => set("avatar", e.currentTarget.value)} /></label>
            <label>Folder<input style={field} value={b().folder ?? ""} onInput={(e) => set("folder", e.currentTarget.value)} /></label>
            <label>Role / description<textarea style={{ ...field, "min-height": "60px" }} value={b().role ?? ""} onInput={(e) => set("role", e.currentTarget.value)} /></label>
            <label>Instructions<textarea style={{ ...field, "min-height": "180px" }} value={b().instructions ?? ""} onInput={(e) => set("instructions", e.currentTarget.value)} /></label>
            <label>Model (never auto-upgraded)<input style={field} value={b().model ?? "deepseek/deepseek-flash"} onInput={(e) => set("model", e.currentTarget.value)} /></label>
            <label>Skills (comma separated)<input style={field} value={(b().skills ?? []).join(", ")} onInput={(e) => set("skills", list(e.currentTarget.value))} /></label>
            <label>Allowed tools (comma separated, empty = all)<input style={field} value={(b().tools ?? []).join(", ")} onInput={(e) => set("tools", list(e.currentTarget.value))} /></label>
            <label>Allowed MCPs (comma separated, empty = all)<input style={field} value={(b().mcps ?? []).join(", ")} onInput={(e) => set("mcps", list(e.currentTarget.value))} /></label>
            <label>Context scopes (comma separated topics this bot owns)
              <input style={field} data-action="aporia-bot-scopes" placeholder="e.g. billing, invoices, leads" value={(b().scopes ?? []).join(", ")} onInput={(e) => set("scopes", list(e.currentTarget.value))} />
            </label>
            <label>Kind
              <select style={field} data-action="aporia-bot-kind" value={b().kind ?? "worker"} onChange={(e) => set("kind", e.currentTarget.value as Bot["kind"])}>
                <option value="worker">Worker — answers directly</option>
                <option value="expert">Expert — researches and stores a sourced finding before answering</option>
              </select>
            </label>
          </Show>
        </div>
        <Show when={error()}><div class="ap-card ap-card-err" role="alert">{error()}</div></Show>
        <div style={{ display: "flex", gap: "8px", "justify-content": "flex-end" }}>
          <Show when={!isNew && tab() === "profile"}>
            <button type="button" class="ap-btn ap-btn-ghost" onClick={async () => { if (!globalThis.confirm(`Remove ${b().name}? Its memory folder is kept.`)) return; await bots({ op: "delete", slug: b().slug }); refreshBots(); props.onClose() }}>Remove</button>
          </Show>
          <Show when={!isNew && tab() === "profile"}>
            <button type="button" class="ap-btn ap-btn-ghost" data-action="aporia-bot-export" title="Shareable .aporia-bot.json: role, instructions, skills, routines, tools. No chats, memory, or secrets." onClick={async () => { try { const f = await routines({ op: "export", slug: b().slug }); if (f) aporiaAlerts.push({ title: "Template exported", detail: f, level: "success" }) } catch (err) { setError(String((err as Error)?.message ?? err)) } }}>Export as template</button>
          </Show>
          <button type="button" class="ap-btn" data-action="aporia-bot-save" onClick={() => void save()}>Save</button>
        </div>
      </div>
    </div>
    </Portal>
  )
}

function RoutinesTab(props: { bot: Partial<Bot>; onChange: (r: Bot["routines"]) => void }) {
  const list = () => props.bot.routines ?? []
  const [hist, { refetch }] = createResource(() => props.bot.slug, (slug) => routines({ op: "history", slug }) as Promise<any[]>)
  const [next, setNext] = createSignal<Record<string, string>>({})
  const field = { width: "100%", "box-sizing": "border-box", background: "transparent", color: "inherit", border: "1px solid var(--ap-line-strong)", "border-radius": "8px", padding: "6px 8px", font: "inherit" } as const
  const upd = (i: number, k: string, v: unknown) => props.onChange(list().map((r, j) => (j === i ? { ...r, [k]: v } : r)))
  const check = async (id: string, cron: string) => { const n = await routines({ op: "next", cron }); setNext({ ...next(), [id]: typeof n === "string" ? `next: ${new Date(n).toLocaleString("en-US", { timeZone: "America/Chicago" })} CT` : n?.error ?? "never" }) }
  return (
    <div style={{ display: "flex", "flex-direction": "column", gap: "8px" }} data-component="aporia-routines">
      <span class="ap-muted ap-small">Cron times are America/Chicago. Routines fire even when the window is minimized (Aporetic must be running). Save the bot after editing.</span>
      <For each={list()}>{(r, i) => (
        <div class="ap-card" data-routine={r.id}>
          <label style={{ display: "flex", gap: "6px", "align-items": "center" }}><input type="checkbox" checked={r.enabled} onChange={(e) => upd(i(), "enabled", e.currentTarget.checked)} /> Enabled</label>
          <input style={field} value={r.name} placeholder="Name" onInput={(e) => upd(i(), "name", e.currentTarget.value)} />
          <input style={field} value={r.cron} placeholder="min hour day month weekday, e.g. 0 8 * * 1-5" onInput={(e) => upd(i(), "cron", e.currentTarget.value)} onBlur={() => void check(r.id, r.cron)} />
          <span class="ap-muted ap-small">{next()[r.id] ?? ""}</span>
          <textarea style={{ ...field, "min-height": "60px" }} value={r.prompt} placeholder="What the bot should do each run" onInput={(e) => upd(i(), "prompt", e.currentTarget.value)} />
          <div style={{ display: "flex", gap: "6px", "justify-content": "flex-end" }}>
            <button type="button" class="ap-btn ap-btn-ghost" onClick={() => props.onChange(list().filter((_, j) => j !== i()))}>Delete</button>
            <button type="button" class="ap-btn ap-btn-ghost" data-action="aporia-routine-run" disabled={!props.bot.slug} onClick={async () => { await bots({ op: "save", bot: props.bot }); await routines({ op: "runNow", slug: props.bot.slug, id: r.id }); aporiaAlerts.push({ title: `Running ${r.name}`, detail: "The result shows in its chat and in run history.", level: "info" }); setTimeout(() => void refetch(), 3000) }}>Run now</button>
          </div>
        </div>
      )}</For>
      <button type="button" class="ap-btn ap-btn-ghost" data-action="aporia-routine-add" onClick={() => props.onChange([...list(), { id: `r${Date.now()}`, name: "New routine", cron: "0 9 * * 1-5", prompt: "", enabled: false }])}>+ Add routine</button>
      <div class="ap-section-label">Run history <button type="button" class="ap-sub-toggle" onClick={() => void refetch()}>Refresh</button></div>
      <For each={hist() ?? []} fallback={<span class="ap-muted ap-small">No runs yet.</span>}>{(h) => (
        <div class="ap-small"><strong>{h.name}</strong> · {h.event}{h.manual ? " (manual)" : ""} · {new Date(h.at).toLocaleString("en-US", { timeZone: "America/Chicago" })} CT<Show when={h.excerpt || h.error}><div class="ap-muted">{h.error ?? h.excerpt}</div></Show></div>
      )}</For>
    </div>
  )
}
