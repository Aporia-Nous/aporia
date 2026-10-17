// APORIA: Attention. The cards the mission coordinator raised for a person: an approval it cannot
// grant, a wake it could not deliver, a thread that stopped making progress. They live in the
// server's mission log (not in localStorage like alerts), so they survive a restart, and resolving
// one records a fact there. Polls every 5s; the server's coordinator trigger does the real work.
import { createMemo, createSignal, For, onCleanup, Show } from "solid-js"
import { Portal } from "solid-js/web"
import { useServerSDK } from "@/runtime/server/client"
import { ago, badge, coordinatorLine, type AttentionCard, type CoordinatorStatus } from "./attention-util"

const POLL_MS = 5000

export function AttentionButton() {
  let sdk: any
  try { sdk = useServerSDK() } catch { sdk = undefined }
  const [cards, setCards] = createSignal<AttentionCard[]>([])
  const [status, setStatus] = createSignal<CoordinatorStatus>()
  const [error, setError] = createSignal("")
  const [open, setOpen] = createSignal(false)
  const [busy, setBusy] = createSignal<string>()
  const [now, setNow] = createSignal(Date.now())

  const refresh = async () => {
    const api = sdk?.api?.mission
    if (!api) return
    try {
      const result = await api.attention.list({ state: "open" })
      setCards([...(result?.data ?? [])])
      setStatus(result?.coordinator)
      setError("")
    } catch (e) {
      setError(String((e as Error)?.message ?? e))
    }
    setNow(Date.now())
  }
  void refresh()
  const timer = setInterval(() => void refresh(), POLL_MS)

  const resolve = async (cardID: string) => {
    setBusy(cardID)
    try {
      await sdk.api.mission.attention.resolve({ cardID })
      await refresh()
    } catch (e) {
      setError(String((e as Error)?.message ?? e))
    } finally {
      setBusy(undefined)
    }
  }

  const count = createMemo(() => cards().length)
  let root: HTMLDivElement | undefined
  let panel: HTMLDivElement | undefined
  const outside = (e: MouseEvent) => {
    if (!open()) return
    const target = e.target as Node
    if (root?.contains(target) || panel?.contains(target)) return
    setOpen(false)
  }
  const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
  document.addEventListener("mousedown", outside)
  document.addEventListener("keydown", esc)
  onCleanup(() => {
    clearInterval(timer)
    document.removeEventListener("mousedown", outside)
    document.removeEventListener("keydown", esc)
  })

  return (
    <div ref={root} style={{ position: "relative" }} data-component="aporia-attention">
      <button
        type="button"
        class="ap-icon-btn"
        aria-label={`Needs your attention (${count()} open)`}
        title="Needs your attention"
        onClick={() => { setOpen(!open()); if (open()) void refresh() }}
        style={{ position: "relative", background: "none", border: "none", cursor: "pointer", color: "inherit", padding: "4px" }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22V4" /><path d="M4 4h12l-2 4 2 4H4" /></svg>
        <Show when={count() > 0}>
          <span data-component="aporia-attention-badge" style={{ position: "absolute", top: "-2px", right: "-4px", background: "#f5a524", color: "#1a1300", "border-radius": "9px", "font-size": "10px", "font-weight": "700", "min-width": "16px", height: "16px", display: "flex", "align-items": "center", "justify-content": "center", padding: "0 4px" }}>
            {badge(count())}
          </span>
        </Show>
      </button>
      <Show when={open()}>
        <Portal>
          <div ref={panel} role="dialog" aria-label="Needs your attention" data-component="aporia-attention-panel" style={{ position: "fixed", right: "56px", top: "48px", width: "380px", "max-height": "480px", overflow: "auto", background: "#0f1730", color: "#e6ebf5", border: "1px solid #2a3550", "border-radius": "12px", "box-shadow": "0 10px 30px rgba(0,0,0,.4)", "z-index": 2147483600 }}>
            <div style={{ display: "flex", "justify-content": "space-between", "align-items": "center", padding: "10px 12px", "border-bottom": "1px solid #2a3550" }}>
              <strong>Needs your attention</strong>
              <span style={{ opacity: 0.7, "font-size": "12px" }}>{count()} open</span>
            </div>
            <Show when={error()}>
              <div style={{ padding: "8px 12px", color: "#e5484d", "font-size": "12px" }}>Could not load cards: {error()}</div>
            </Show>
            <Show when={count() > 0} fallback={<div style={{ padding: "18px 12px", opacity: 0.75, "font-size": "13px" }}>Nothing needs you right now.</div>}>
              <For each={cards()}>
                {(card) => (
                  <div data-component="aporia-attention-card" data-card-id={card.id} style={{ padding: "10px 12px", "border-bottom": "1px solid #1d2742", "border-left": "3px solid #f5a524" }}>
                    <div style={{ display: "flex", "justify-content": "space-between", gap: "8px" }}>
                      <strong style={{ "font-size": "13px" }}>{card.title}</strong>
                      <span style={{ opacity: 0.6, "font-size": "11px", "white-space": "nowrap" }}>{ago(card.createdAt, now())}</span>
                    </div>
                    <Show when={card.body}>
                      <div style={{ "font-size": "12px", opacity: 0.85, margin: "4px 0 8px", "white-space": "pre-wrap" }}>{card.body}</div>
                    </Show>
                    <div style={{ display: "flex", "justify-content": "space-between", "align-items": "center" }}>
                      <span style={{ opacity: 0.55, "font-size": "11px" }}>{card.missionId ? `mission ${card.missionId.slice(0, 12)}` : "no mission"}</span>
                      <button type="button" disabled={busy() === card.id} onClick={() => void resolve(card.id)} style={{ padding: "4px 10px", "border-radius": "6px", border: "1px solid #2a3550", background: "#16213f", color: "inherit", cursor: "pointer", "font-size": "12px" }}>
                        {busy() === card.id ? "Resolving…" : "Resolve"}
                      </button>
                    </div>
                  </div>
                )}
              </For>
            </Show>
            <div data-component="aporia-attention-status" style={{ padding: "8px 12px", "font-size": "11px", opacity: 0.6 }}>{coordinatorLine(status(), now())}</div>
          </div>
        </Portal>
      </Show>
    </div>
  )
}
