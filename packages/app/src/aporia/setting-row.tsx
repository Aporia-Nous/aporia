// APORIA: Settings > General toggle for the Aporia layout.
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
