// APORIA: Connector accounts. Several accounts per MCP connector, one row each, with
// Set active / Rename / Reconnect / Disconnect. Hot-reloaded by the server; no restart.
import { createResource, createSignal, For, Show } from "solid-js"
import { useServerSDK } from "@/runtime/server/client"
import { aporiaAlerts } from "./alerts"

type Row = { name: string; label: string; active: boolean }
const bridge = () => (globalThis as any).electron?.aporia?.accounts as undefined | ((i: unknown) => Promise<any>)
const btn = { padding: "4px 8px", "border-radius": "6px", border: "1px solid var(--border-base, #2a3550)", background: "transparent", color: "inherit", cursor: "pointer" }

export function ConnectorAccounts() {
  let sdk: any
  try { sdk = useServerSDK() } catch { sdk = undefined }
  const [groups, { refetch }] = createResource(async () => ((await bridge()?.({ action: "list" })) ?? {}) as Record<string, Row[]>)
  const [adding, setAdding] = createSignal<{ app: string; label: string }>()
  const run = async (input: unknown, ok: string) => {
    try { const r = await bridge()!(input); aporiaAlerts.push({ title: ok, level: "success" }); refetch(); return r }
    catch (e) { aporiaAlerts.push({ title: "Account action failed", detail: String((e as Error).message ?? e), level: "error" }) }
  }
  const server = async (op: "connect" | "disconnect", name: string) => {
    try {
      if (op === "disconnect") {
        // revoke: drop every stored credential for this account's integration, then disconnect
        const list = (await sdk.api.mcp.list({})).data as { name: string; integrationID?: string }[]
        const integrationID = list.find((item) => item.name === name)?.integrationID
        if (integrationID) {
          const integration = (await sdk.api.integration.get({ integrationID })).data
          for (const c of (integration?.connections ?? []).filter((c: any) => c.type === "credential"))
            await sdk.api.credential.remove({ credentialID: c.id })
        }
      }
      await sdk?.api?.mcp?.[op]?.({ server: name }); aporiaAlerts.push({ title: op === "connect" ? `Reconnecting ${name}` : `Disconnected ${name}`, detail: op === "disconnect" ? "Stored tokens cleared." : "Finish sign-in in your browser if asked.", level: "info" }) }
    catch { aporiaAlerts.push({ title: `${op} failed for ${name}`, level: "error" }) }
  }
  return (
    <div data-component="aporia-connector-accounts" style={{ display: "flex", "flex-direction": "column", gap: "10px" }}>
      <h3 style={{ margin: "8px 0 0" }}>Connector accounts</h3>
      <div style={{ opacity: 0.7, "font-size": "12px" }}>Add a second or third account of the same app. Agents use the active one; name a label to use another (e.g. "use asana work").</div>
      <For each={Object.entries(groups() ?? {}).sort(([a], [b]) => a.localeCompare(b))}>{([app, rows]) => (
        <div style={{ border: "1px solid var(--border-base, #2a3550)", "border-radius": "8px", padding: "8px 10px" }}>
          <div style={{ display: "flex", "justify-content": "space-between", "align-items": "center" }}>
            <strong>{app}</strong>
            <button type="button" style={btn} onClick={() => setAdding({ app, label: "" })}>Add account</button>
          </div>
          <Show when={adding()?.app === app}>
            <div style={{ display: "flex", gap: "6px", margin: "6px 0" }}>
              <input placeholder="label, e.g. work" style={{ ...btn, cursor: "text", flex: 1 }} onInput={(e) => setAdding({ app, label: e.currentTarget.value })} />
              <button type="button" style={btn} onClick={async () => { const r = await run({ action: "add", app, label: adding()!.label }, "Account added"); setAdding(undefined); if (r?.name) { if (r.vaultPrefix) aporiaAlerts.push({ title: "Add this account's keys to the Vault", detail: `Use names starting with ${r.vaultPrefix}` }); await server("connect", r.name) } }}>Save</button>
              <button type="button" style={btn} onClick={() => setAdding(undefined)}>Cancel</button>
            </div>
          </Show>
          <For each={rows}>{(row) => (
            <div style={{ display: "flex", gap: "6px", "align-items": "center", padding: "4px 0" }}>
              <span style={{ flex: 1 }}>{row.label} <code style={{ opacity: 0.6, "font-size": "11px" }}>{row.name}</code> <Show when={row.active}><span style={{ color: "#30a46c", "font-size": "11px" }}>active</span></Show></span>
              <Show when={!row.active}><button type="button" style={btn} onClick={() => run({ action: "set-active", name: row.name }, `${row.label} is now active`)}>Set active</button></Show>
              <button type="button" style={btn} onClick={() => { const label = prompt("New label", row.label); if (label) run({ action: "rename", name: row.name, label }, "Renamed") }}>Rename</button>
              <button type="button" style={btn} onClick={() => server("connect", row.name)}>Reconnect</button>
              <button type="button" style={btn} onClick={async () => { if (!confirm(`Disconnect ${row.label}? Stored tokens are cleared.`)) return; await server("disconnect", row.name); if (row.name.includes("--")) await run({ action: "remove", name: row.name }, "Account removed") }}>Disconnect</button>
            </div>
          )}</For>
        </div>
      )}</For>
    </div>
  )
}
