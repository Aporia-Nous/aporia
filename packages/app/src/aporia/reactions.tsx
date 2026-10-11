// APORIA: emoji reactions. Bots react to Ali's latest message with the react tool (aporia-memory MCP); Ali reacts to
// a bot reply from the hover bar on each turn. Ali's reactions are fed to the bot on its next turn (agent prompt).
// Pills are drawn into the stock timeline rows ([data-message-id] = the turn's user message).
import { createEffect, onCleanup } from "solid-js"
import { useServerSDK } from "@/runtime/server/client"
import { routines } from "./bots"

const CHOICES = ["👍", "❤️", "🎉", "😂", "✅"]
type Reaction = { at: string; by: "ali" | "bot"; emoji: string; messageID?: string; excerpt?: string }

export function ReactionsLayer(props: { sessionID?: string; agent?: string }) {
  const sdk = useServerSDK()
  const api = sdk.api as any
  createEffect(() => {
    const sessionID = props.sessionID; const agent = props.agent
    if (!sessionID || !agent?.startsWith("aporia-")) return
    const slug = agent.slice("aporia-".length)
    let stop = false
    const paint = async () => {
      if (stop) return
      const [list, page] = await Promise.all([routines({ op: "reactions", slug }) as Promise<Reaction[]>, api.message.list({ sessionID, limit: 100, order: "asc" }).catch(() => undefined)])
      const msgs: any[] = (page?.data ?? page?.items ?? page ?? []) as any[]
      const users = msgs.filter((m) => m.type === "user")
      const byMsg = new Map<string, string[]>()
      for (const r of list ?? []) {
        let id = r.messageID
        if (!id && r.by === "bot") id = [...users].reverse().find((u) => (u.time?.created ?? 0) <= Date.parse(r.at))?.id
        if (!id) continue
        byMsg.set(id, [...(byMsg.get(id) ?? []), `${r.by === "ali" ? "You" : "Bot"} ${r.emoji}`])
      }
      for (const row of Array.from(document.querySelectorAll<HTMLElement>("[data-message-id]"))) {
        const id = row.dataset.messageId!; if (!users.some((u) => u.id === id)) continue
        let bar = row.querySelector<HTMLElement>(":scope > .ap-react-bar")
        if (!bar) {
          bar = document.createElement("div"); bar.className = "ap-react-bar"; row.appendChild(bar)
          const add = document.createElement("span"); add.className = "ap-react-add"
          for (const e of CHOICES) {
            const b = document.createElement("button"); b.type = "button"; b.textContent = e; b.title = `React ${e} to this reply`
            b.onclick = async () => {
              const idx = msgs.findIndex((m) => m.id === id)
              const reply = msgs.slice(idx + 1).find((m) => m.type === "assistant")
              const excerpt = (reply?.content ?? []).filter((c: any) => c.type === "text").map((c: any) => c.text).join(" ").slice(0, 200)
              await routines({ op: "react", slug, reaction: { by: "ali", emoji: e, messageID: id, sessionID, excerpt } }); void paint()
            }
            add.appendChild(b)
          }
          bar.appendChild(add)
        }
        let pills = bar.querySelector<HTMLElement>(".ap-react-pills")
        if (!pills) { pills = document.createElement("span"); pills.className = "ap-react-pills"; bar.prepend(pills) }
        const text = (byMsg.get(id) ?? []).map((t) => `<span class="ap-react-pill">${t.replace(/[<>&]/g, "")}</span>`).join("")
        if (pills.innerHTML !== text) pills.innerHTML = text
      }
    }
    void paint(); const t = setInterval(() => void paint().catch(() => undefined), 4000)
    onCleanup(() => { stop = true; clearInterval(t) })
  })
  return null
}
