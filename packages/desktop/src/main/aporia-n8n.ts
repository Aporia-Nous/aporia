// APORIA: tiny bridge to the LOCAL n8n public API. The key is read from the N8N_API_KEY env var
// in the main process and never sent to the renderer. Only localhost is allowed.
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { ipcMain } from "electron"

export const AporiaN8nChannel = "aporia:n8n"
const BASE = (process.env.N8N_BASE_URL || "http://localhost:5678").replace(/\/$/, "")

type Op =
  | { op: "status" }
  | { op: "list" }
  | { op: "setActive"; id: string; active: boolean }
  | { op: "importDir"; dir: string }

async function call(method: string, route: string, body?: unknown) {
  const key = process.env.N8N_API_KEY
  if (!key) throw new Error("N8N_API_KEY is not set")
  const res = await fetch(`${BASE}/api/v1${route}`, {
    method,
    headers: { "X-N8N-API-KEY": key, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`n8n ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return res.status === 204 ? undefined : res.json()
}

export async function handleN8n(input: Op) {
  if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) throw new Error("Only local n8n is allowed")
  switch (input.op) {
    case "status":
      return { configured: !!process.env.N8N_API_KEY, base: BASE }
    case "list": {
      const [workflows, executions] = await Promise.all([
        call("GET", "/workflows?limit=100") as Promise<{ data: { id: string; name: string; active: boolean; updatedAt: string }[] }>,
        call("GET", "/executions?limit=100") as Promise<{ data: { workflowId: string; startedAt: string; status?: string }[] }>,
      ])
      const last = new Map<string, { startedAt: string; status?: string }>()
      for (const run of executions.data) if (!last.has(run.workflowId)) last.set(run.workflowId, run)
      return workflows.data.map((wf) => ({ id: wf.id, name: wf.name, active: wf.active, lastRun: last.get(wf.id) }))
    }
    case "setActive":
      if (!/^[A-Za-z0-9]+$/.test(input.id)) throw new Error("Invalid id")
      return call("POST", `/workflows/${input.id}/${input.active ? "activate" : "deactivate"}`)
    case "importDir": {
      const files = readdirSync(input.dir).filter((f) => f.toLowerCase().endsWith(".json"))
      let imported = 0
      for (const file of files) {
        const wf = JSON.parse(readFileSync(path.join(input.dir, file), "utf8"))
        if (!Array.isArray(wf.nodes)) continue
        // Imported as inactive: the public API ignores/forbids `active` on create.
        await call("POST", "/workflows", { name: wf.name ?? file, nodes: wf.nodes, connections: wf.connections ?? {}, settings: wf.settings ?? {} })
        imported++
      }
      return { imported, files: files.length }
    }
  }
}

export function registerAporiaN8nHandler() {
  ipcMain.handle(AporiaN8nChannel, (_event, input: Op) => handleN8n(input))
}
