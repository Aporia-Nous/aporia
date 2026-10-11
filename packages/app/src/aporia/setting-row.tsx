// APORIA: Settings > General toggle for the Aporia layout.
import "./aporia.css"
import { createResource, createSignal, For, Show } from "solid-js"
import { Switch } from "@opencode/ui/switch"
import { SettingsRow } from "@/settings/row"
import { aporiaPrefs } from "./prefs"

export function AporiaLayoutSettingRow() {
  return (
    <SettingsRow
      title="Aporia layout"
      description="Three-column chat with a sessions sidebar, Details/Library/Computer panel, and Connect apps. Turn off for the stock view."
    >
      <div data-action="settings-aporia-layout">
        <Switch checked={aporiaPrefs.layoutEnabled()} onChange={(checked) => aporiaPrefs.setLayoutEnabled(checked)} />
      </div>
    </SettingsRow>
  )
}

export function AporiaThemeSettingRow() {
  return (
    <SettingsRow
      title="Aporia theme"
      description="Keep the navy Aporia theme applied. Turn off to choose any other theme in Appearance."
    >
      <div data-action="settings-aporia-theme">
        <Switch checked={aporiaPrefs.aporiaTheme()} onChange={(checked) => aporiaPrefs.setAporiaTheme(checked)} />
      </div>
    </SettingsRow>
  )
}

// APORIA: Owner mode (desktop only). Off by default; state lives in the main process.

type OwnerInfo = { owner: boolean; spendCap?: number; spentToday: number }
type ActivityEntry = { at: string; kind: string; detail: string; ok: boolean; amount?: number }
const ownerBridge = () =>
  (globalThis as { electron?: { aporia?: { owner?: (input: unknown) => Promise<unknown> } } }).electron?.aporia?.owner

export function AporiaOwnerSettingRows() {
  const bridge = ownerBridge()
  const [info, { mutate }] = createResource(() => (bridge ? (bridge({ op: "get" }) as Promise<OwnerInfo>) : undefined))
  const [log, { refetch }] = createResource(() => (bridge ? (bridge({ op: "activity" }) as Promise<ActivityEntry[]>) : undefined))
  const [cap, setCap] = createSignal("")
  const set = async (input: { owner?: boolean; spendCap?: number | null }) => {
    if (!bridge) return
    mutate((await bridge({ op: "set", ...input })) as OwnerInfo)
    await refetch()
  }
  return (
    <Show when={bridge}>
      <SettingsRow
        title="Owner mode"
        description="Full access for your own copy: Votel can use every tool (calls, publishing, wallet) and actions run without approval cards. Everything is logged below. Off by default."
      >
        <div data-action="settings-aporia-owner">
          <Switch
            checked={!!info()?.owner}
            onChange={(checked) => {
              if (checked && !globalThis.confirm("Turn on Owner mode? Agent actions (including calls and spending) will run without asking.")) return
              void set({ owner: checked })
            }}
          />
        </div>
      </SettingsRow>
      <SettingsRow
        title="Daily spend cap"
        description={`Optional. Blocks spend-type Votel actions through Aporia once reached. ${info()?.spendCap ? `Now $${info()!.spendCap}/day, $${(info()?.spentToday ?? 0).toFixed(2)} used today.` : "Off."}`}
      >
        <form
          class="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            const value = Number(cap())
            void set({ spendCap: value > 0 ? value : null })
          }}
        >
          <input
            class="ap-input"
            style={{ width: "88px" }}
            inputmode="decimal"
            placeholder={info()?.spendCap ? String(info()!.spendCap) : "USD"}
            value={cap()}
            onInput={(event) => setCap(event.currentTarget.value.replace(/[^0-9.]/g, ""))}
          />
          <button type="submit" class="ap-btn">{cap() ? "Set" : "Off"}</button>
        </form>
      </SettingsRow>
      <SettingsRow title="Activity log" description="Every Owner-mode action and settings change, newest first.">
        <div class="ap-activity">
          <For each={(log() ?? []).slice(0, 30)} fallback={<span class="ap-muted ap-small">No activity yet</span>}>
            {(entry) => (
              <div class="ap-activity-row" classList={{ "ap-activity-err": !entry.ok }}>
                <span class="ap-muted">{new Date(entry.at).toLocaleString()}</span>
                <span>{entry.detail}</span>
              </div>
            )}
          </For>
        </div>
      </SettingsRow>
    </Show>
  )
}
