// APORIA: group rooms. A room has several bots; Ali's posts reach all of them and they take turns (see dispatch.tsx).
import { createResource, createSignal, For, onCleanup, Show } from "solid-js"
import { Portal } from "solid-js/web"
import { bots, type Bot } from "./bots"

type Room = { slug: string; name: string; members: string[] }
export function RoomsSection() {
  const [rooms, { refetch }] = createResource(() => bots({ op: "rooms" }) as Promise<Room[]>, { initialValue: [] })
  const [open, setOpen] = createSignal<Room | "new" | undefined>()
  return (
    <div data-component="aporia-rooms">
      <div class="ap-section-label ap-chats-label">
        Rooms <span class="ap-count">{rooms()?.length ?? 0}</span>
        <button type="button" class="ap-sub-toggle" data-action="aporia-room-new" onClick={() => setOpen("new")}>+ New room</button>
      </div>
      <nav class="ap-bot-list">
        <For each={rooms()}>{(r) => (
          <button type="button" class="ap-session ap-bot-main" onClick={() => setOpen(r)} data-room={r.slug}>
            <span class="ap-avatar ap-bot-avatar">#</span>
            <span class="ap-session-text"><strong class="ap-ellipsis">{r.name}</strong><span class="ap-muted ap-ellipsis">{r.members.length} bots</span></span>
          </button>
        )}</For>
      </nav>
      <Show when={open()}>
        <RoomModal room={open() === "new" ? undefined : (open() as Room)} onClose={() => { setOpen(undefined); void refetch() }} />
      </Show>
    </div>
  )
}

function RoomModal(props: { room?: Room; onClose: () => void }) {
  const [all] = createResource(() => bots({ op: "list" }) as Promise<Bot[]>, { initialValue: [] })
  const [room, setRoom] = createSignal<Room | undefined>(props.room)
  const [name, setName] = createSignal(props.room?.name ?? "")
  const [members, setMembers] = createSignal<string[]>(props.room?.members ?? [])
  const [text, setText] = createSignal("")
  const [log, { refetch }] = createResource(() => room()?.slug, (slug) => bots({ op: "roomRead", slug }) as Promise<{ at: string; from: string; text: string }[]>)
  const t = setInterval(() => { if (!document.hidden) void refetch() }, 3000); onCleanup(() => clearInterval(t))
  const field = { width: "100%", "box-sizing": "border-box", background: "transparent", color: "inherit", border: "1px solid var(--ap-line-strong)", "border-radius": "8px", padding: "6px 8px", font: "inherit" } as const
  const save = async () => setRoom(await bots({ op: "roomSave", room: { slug: room()?.slug, name: name(), members: members() } }))
  const post = async () => { if (!text().trim() || !room()) return; await bots({ op: "roomPost", slug: room()!.slug, from: "Ali", text: text() }); setText(""); void refetch() }
  return (
    <Portal>
    <div class="ap-overlay" role="dialog" aria-modal="true" aria-label="Room" onClick={props.onClose}>
      <div class="ap-modal" onClick={(e) => e.stopPropagation()} data-component="aporia-room">
        <div class="ap-modal-head"><strong>{room()?.name ?? "New room"}</strong><button type="button" class="ap-icon-btn" aria-label="Close" onClick={props.onClose}>✕</button></div>
        <label>Name<input style={field} value={name()} onInput={(e) => setName(e.currentTarget.value)} /></label>
        <div style={{ display: "flex", "flex-wrap": "wrap", gap: "6px" }}>
          <For each={all()}>{(b) => (
            <label class="ap-chip"><input type="checkbox" checked={members().includes(b.slug)} onChange={(e) => setMembers(e.currentTarget.checked ? [...members(), b.slug] : members().filter((m) => m !== b.slug))} /> {b.name}</label>
          )}</For>
        </div>
        <div style={{ display: "flex", "justify-content": "flex-end" }}><button type="button" class="ap-btn ap-btn-ghost" data-action="aporia-room-save" onClick={() => void save()}>Save members</button></div>
        <Show when={room()}>
          <div class="ap-modal-scroll" style={{ "min-height": "200px", gap: "8px" }}>
            <For each={log() ?? []} fallback={<span class="ap-muted">No posts yet. Bots answer in turn, in member order.</span>}>{(e) => (
              <div class="ap-card"><strong>{e.from}</strong> <span class="ap-muted ap-small">{new Date(e.at).toLocaleTimeString()}</span><div style={{ "white-space": "pre-wrap" }}>{e.text}</div></div>
            )}</For>
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            <textarea style={{ ...field, "min-height": "48px" }} placeholder="Post to everyone in the room" value={text()} onInput={(e) => setText(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void post() } }} />
            <button type="button" class="ap-btn" data-action="aporia-room-post" onClick={() => void post()}>Post</button>
          </div>
        </Show>
      </div>
    </div>
    </Portal>
  )
}
