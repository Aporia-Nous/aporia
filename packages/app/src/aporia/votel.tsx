// APORIA: Votel panel (read-only). Data comes from the desktop bridge, which only allows list_/get_ tools.
// Calls, spending, and publishing happen only in chat, through the agent's approval cards.
import { createResource, createSignal, For, Show } from "solid-js"
import { EmptyState, Icon, Skeleton } from "./icons"

type Bridge = { votel?: (input: unknown) => Promise<unknown> }
const votel = (input: unknown) => {
  const fn = (globalThis as { electron?: { aporia?: Bridge } }).electron?.aporia?.votel
  return fn ? fn(input) : Promise.reject(new Error("The Votel panel needs the Aporia desktop app"))
}

const pick = (tools: string[], re: RegExp) => tools.find((name) => re.test(name))

const PROMPTS = [
  "Summarize my Votel calls from today and flag anything that needs a follow-up.",
  "List my Votel agents and what each one handles.",
  "Draft follow-up texts for today's missed Votel calls. Show them to me before sending.",
  "What's my Votel wallet balance and minutes left this period?",
]

function Section(props: { title: string; tool?: string }) {
  const [data] = createResource(
    () => props.tool,
    (name) => votel({ op: "call", name }) as Promise<string>,
  )
  return (
    <div class="ap-card ap-votel-card">
      <strong>{props.title}</strong>
      <Show when={props.tool} fallback={<span class="ap-muted ap-small">Not available for this key</span>}>
        <Show when={!data.loading} fallback={<Skeleton rows={2} />}>
          <Show when={!data.error} fallback={<span class="ap-live-failed ap-small">{String(data.error?.message ?? data.error)}</span>}>
            <pre class="ap-votel-pre">{summarize(data() ?? "")}</pre>
          </Show>
        </Show>
      </Show>
    </div>
  )
}

function summarize(text: string) {
  try {
    const value = JSON.parse(text)
    const list = Array.isArray(value) ? value : (Object.values(value).find(Array.isArray) as unknown[] | undefined)
    if (list)
      return list
        .slice(0, 8)
        .map((item) => {
          const o = item as Record<string, unknown>
          return `• ${o.name ?? o.title ?? o.contactName ?? o.from ?? o.id ?? ""}${o.status ? ` · ${o.status}` : ""}${o.createdAt || o.startedAt ? ` · ${new Date(String(o.createdAt ?? o.startedAt)).toLocaleString()}` : ""}`
        })
        .join("\n")
    return Object.entries(value)
      .filter(([, v]) => typeof v !== "object")
      .slice(0, 8)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n")
  } catch {
    return text.slice(0, 600)
  }
}

export function VotelTab() {
  const [status] = createResource(() => votel({ op: "status" }) as Promise<{ configured: boolean }>)
  const [tools] = createResource(
    () => status()?.configured,
    () => votel({ op: "tools" }) as Promise<string[]>,
  )
  const [copied, setCopied] = createSignal("")
  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text).catch(() => undefined)
    setCopied(text)
    setTimeout(() => setCopied(""), 1800)
  }
  return (
    <div class="ap-automations">
      <Show when={status.error}>
        <EmptyState icon="phone" title="Votel unavailable" hint={String(status.error?.message ?? status.error)} />
      </Show>
      <Show when={status() && !status()!.configured}>
        <div class="ap-card">
          <strong>Connect Votel</strong>
          <span class="ap-muted ap-small">Open Connect apps, choose Votel, and paste your API key (Votel, Settings, API Keys).</span>
        </div>
      </Show>
      <Show when={status()?.configured}>
        <Show when={!tools.loading} fallback={<Skeleton rows={3} />}>
          <Show when={!tools.error} fallback={<div class="ap-card ap-card-err">{String(tools.error?.message ?? tools.error)}</div>}>
            <Section title="Wallet and minutes" tool={pick(tools() ?? [], /(wallet|balance|credit|usage|minute)/i)} />
            <Section title="Agents" tool={pick(tools() ?? [], /(list|get)[_-].*agent/i)} />
            <Section title="Recent calls" tool={pick(tools() ?? [], /(list|get)[_-].*call/i)} />
          </Show>
        </Show>
      </Show>
      <div class="ap-section-label">Quick prompts</div>
      <For each={PROMPTS}>
        {(text) => (
          <button type="button" class="ap-prompt" onClick={() => copy(text)} title="Copy, then paste into the chat">
            <Icon name={copied() === text ? "check" : "sparkles"} size={12} />
            <span>{copied() === text ? "Copied, paste into the chat" : text}</span>
          </button>
        )}
      </For>
      <span class="ap-muted ap-small">This panel only reads. Calls, spending, and publishing go through chat approval cards.</span>
    </div>
  )
}
