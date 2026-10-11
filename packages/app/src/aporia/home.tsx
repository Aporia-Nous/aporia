// APORIA: brand header for the home/projects screen. Visual only; all controls below are upstream's.
import logo from "./logo.png"
import "./aporia.css"
import { createMemo, createSignal, Show } from "solid-js"
import { useCommand } from "@/shell/commands/command"
import { Icon } from "./icons"
import { Home } from "@/home/route"
import { useGlobal } from "@/runtime/server/runtime"
import { ServerProvider } from "@/runtime/server/current"
import { ServerConnection } from "@/runtime/server/registry"
import { AporiaHomeLayout } from "./layout"
import { aporiaPrefs } from "./prefs"

export function AporiaHomeHeader() {
  return (
    <header class="ap-home-header">
      <img src={logo} alt="" width={32} height={32} />
      <div class="ap-home-header-text">
        <strong>Aporia</strong>
        <span>Your projects and chats</span>
      </div>
    </header>
  )
}

/** Route component for "/": stock Home, framed by the Aporia layout around the local server. */
export function AporiaHomeRoute() {
  const global = useGlobal()
  const conn = createMemo(() => {
    const list = global.servers.list()
    return list.find((item) => ServerConnection.local(item)) ?? list[0]
  })
  return (
    <Show when={aporiaPrefs.layoutEnabled() && conn()} keyed fallback={<Home />}>
      {(value) => (
        <ServerProvider conn={value}>
          <AporiaHomeLayout>
            <AporiaWelcome />
          </AporiaHomeLayout>
        </ServerProvider>
      )}
    </Show>
  )
}

/** Aporia home center: brand, one-click new session, and the (unchanged) project/server manager on demand. */
function AporiaWelcome() {
  const command = useCommand()
  const [manage, setManage] = createSignal(false)
  return (
    <div class="ap-welcome">
      <Show
        when={manage()}
        fallback={
          <div class="ap-welcome-hero">
            <img src={logo} alt="" width={64} height={64} />
            <h1>Aporia</h1>
            <p>Pick a chat on the left, or start something new.</p>
            <div class="ap-welcome-actions">
              <button type="button" class="ap-btn ap-btn-lg" onClick={() => command.trigger("tab.new")}>
                <Icon name="message" size={16} /> New session
              </button>
              <button type="button" class="ap-btn ap-btn-ghost ap-btn-lg" onClick={() => setManage(true)}>
                <Icon name="folder" size={16} /> Projects &amp; servers
              </button>
            </div>
            <span class="ap-muted ap-small">Ctrl+, opens settings</span>
          </div>
        }
      >
        <div class="ap-welcome-manage">
          <button type="button" class="ap-btn ap-btn-ghost" onClick={() => setManage(false)}>
            ← Back
          </button>
          <Home />
        </div>
      </Show>
    </div>
  )
}
