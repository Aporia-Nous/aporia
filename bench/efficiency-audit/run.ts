import { taskByID, tasks, type Task } from "./tasks"

const BASE = "http://127.0.0.1:49374"
const TEMP = process.env.TEMP ?? "C:\\Users\\Dilla\\AppData\\Local\\Temp"
const ROOT = `${TEMP}\\oc-bench`
const RUNS = `${ROOT}\\runs`
const OUT = `${process.cwd()}\\docs\\efficiency-audit\\phase1-raw.json`
const LOG = `${process.env.USERPROFILE}\\.local\\share\\opencode\\log\\opencode.log`
const MODEL = { providerID: "deepseek", id: "deepseek-flash" }
const MODEL_LABEL = "deepseek/deepseek-flash"

// ---- args
const args = process.argv.slice(2)
const arg = (name: string, fallback?: string) => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? fallback : args[i + 1]
}
const only = arg("only")?.split(/[\s,]+/).filter(Boolean)
const reps = Number(arg("rep", "1"))
const sweep = args.includes("--sweep")
const fixedBudget = arg("budget") === undefined ? undefined : Number(arg("budget"))
const selected = only ? tasks.filter((t) => only.includes(t.id)) : tasks

// ---- http (basic auth from the environment; the credential is never printed)
const password = process.env.OPENCODE_PASSWORD
if (!password) throw new Error("OPENCODE_PASSWORD is not set in this environment")
const auth = "Basic " + Buffer.from(`opencode:${password}`).toString("base64")
let harnessCalls = 0
async function api(path: string, init?: RequestInit) {
  harnessCalls++
  const res = await fetch(BASE + path, {
    ...init,
    headers: { authorization: auth, "content-type": "application/json", ...(init?.headers ?? {}) },
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`HTTP ${res.status} ${path}: ${text.slice(0, 300)}`)
  return text ? JSON.parse(text) : undefined
}

// ---- process sampling
type Proc = { pid: number; ppid: number; rss: number }
async function processes(): Promise<Proc[]> {
  const ps = `Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,WorkingSetSize | ConvertTo-Json -Compress`
  const proc = Bun.spawn(["powershell", "-NoProfile", "-Command", ps], { stdout: "pipe", stderr: "ignore" })
  const text = await new Response(proc.stdout).text()
  await proc.exited
  const rows = JSON.parse(text)
  return (Array.isArray(rows) ? rows : [rows]).map((r: any) => ({
    pid: r.ProcessId,
    ppid: r.ParentProcessId,
    rss: r.WorkingSetSize,
  }))
}
function treeRSS(all: Proc[], root: number) {
  const children = new Map<number, number[]>()
  for (const p of all) {
    const list = children.get(p.ppid) ?? []
    list.push(p.pid)
    children.set(p.ppid, list)
  }
  const seen = new Set<number>()
  const stack = [root]
  let rss = 0
  while (stack.length) {
    const pid = stack.pop()!
    if (seen.has(pid)) continue
    seen.add(pid)
    const proc = all.find((p) => p.pid === pid)
    if (proc) rss += proc.rss
    for (const child of children.get(pid) ?? []) stack.push(child)
  }
  return { rss, count: seen.size }
}
async function serverPID() {
  const proc = Bun.spawn(["netstat", "-ano", "-p", "TCP"], { stdout: "pipe" })
  const text = await new Response(proc.stdout).text()
  await proc.exited
  const line = text.split("\n").find((l) => /:49374\s/.test(l) && /LISTENING/.test(l))
  return line ? Number(line.trim().split(/\s+/).pop()) : undefined
}

// ---- fixture + checks
async function materialize(task: Task, dir: string) {
  await Bun.$`powershell -NoProfile -Command "if (Test-Path '${dir}') { Remove-Item -Recurse -Force '${dir}' }"`.quiet()
  for (const [rel, content] of Object.entries(task.files)) await Bun.write(`${dir}/${rel}`, content)
}

type Run = {
  agent: "aporetic"
  task: string
  mode: "baseline" | "budget"
  budget?: number
  rep: number
  success: boolean
  check: string
  sessionID?: string
  tokens?: { input: number; output: number; reasoning: number; cacheRead: number; cacheWrite: number }
  cost?: number
  parentCost?: number
  childSessions: number
  wallMs: number
  modelRequests: number
  toolCalls: number
  toolCallsByName: Record<string, number>
  toolSequence: string[]
  repeatedToolCalls: number
  skillCalls: number
  subagentCalls: number
  apiRequests: number
  serverLogHttpCalls: number
  peakTreeRSS: number
  startTreeRSS: number
  endTreeRSS: number
  serverPID?: number
  outcome?: string
  error?: string
  command: string
  version: string
  startedAt: string
}

async function runAporetic(task: Task, mode: "baseline" | "budget", budget: number | undefined, rep: number) {
  const dir = `${RUNS}\\aporetic-${task.id}-${mode}${budget ?? ""}-${rep}`
  await materialize(task, dir)
  const prompt =
    budget === undefined
      ? task.prompt
      : `Hard limit: use at most ${budget} tool calls in total. Do not re-read files, do not run verification you do not need.\n\n${task.prompt}`
  const pid = await serverPID()
  const before = pid ? treeRSS(await processes(), pid) : { rss: 0, count: 0 }
  const logStart = await Bun.file(LOG).size
  harnessCalls = 0
  let peak = before.rss
  let samplingDone = false
  const sampling = (async () => {
    while (!samplingDone) {
      await Bun.sleep(3000)
      if (samplingDone || !pid) return
      const s = treeRSS(await processes(), pid)
      if (s.rss > peak) peak = s.rss
    }
  })()

  let sessionID: string | undefined
  let toolCalls = 0
  let toolCallsByName: Record<string, number> = {}
  const toolSequence: string[] = []
  let repeatedToolCalls = 0
  let skillCalls = 0
  let subagentCalls = 0
  let modelRequests = 0
  let tokens: Run["tokens"]
  let cost: number | undefined
  let parentCost: number | undefined
  let childSessions = 0
  let outcome: string | undefined
  let error: string | undefined
  let success = false
  let detail = ""
  const startedAt = new Date().toISOString()
  const t0 = Date.now()

  try {
    const created = await api("/api/session", {
      method: "POST",
      body: JSON.stringify({
        title: task.title,
        model: MODEL,
        location: { directory: dir },
        permissions: [{ action: "*", resource: "*", effect: "allow" }],
      }),
    })
    sessionID = created.data.id
    await api(`/api/session/${sessionID}/prompt`, { method: "POST", body: JSON.stringify({ text: prompt }) })

    const deadline = Date.now() + 300_000
    let info: any
    while (Date.now() < deadline) {
      await Bun.sleep(2000)
      info = (await api(`/api/session/${sessionID}`))?.data
      if (info?.time?.idle && info.time.idle >= t0) break
    }
    if (!info?.time?.idle) throw new Error("timed out waiting for idle")
    cost = info.cost
    parentCost = info.cost
    outcome = info.outcome
    tokens = {
      input: info.tokens.input,
      output: info.tokens.output,
      reasoning: info.tokens.reasoning,
      cacheRead: info.tokens.cache.read,
      cacheWrite: info.tokens.cache.write,
    }
    const messages = (await api(`/api/session/${sessionID}/message?limit=200`)).data as any[]
    const seen = new Set<string>()
    const countMessages = (list: any[]) => {
      for (const m of list) {
        if (m.type !== "assistant") continue
        modelRequests++
        for (const part of m.content ?? []) {
          if (part.type !== "tool") continue
          toolCalls++
          toolCallsByName[part.name] = (toolCallsByName[part.name] ?? 0) + 1
          toolSequence.push(part.name)
          if (part.name === "skill") skillCalls++
          if (part.name === "task" || part.name === "subagent") subagentCalls++
          const signature = part.name + "|" + JSON.stringify(part.state?.input ?? {})
          if (seen.has(signature)) repeatedToolCalls++
          seen.add(signature)
        }
      }
    }
    countMessages(messages)

    // Subagent runs create child sessions; their cost and work belong to this run.
    const allSessions = (await api(`/api/session`)).data as any[]
    const queue = [sessionID]
    const descendants: any[] = []
    while (queue.length > 0) {
      const parent = queue.shift()!
      for (const s of allSessions) {
        if (s.parentID !== parent) continue
        descendants.push(s)
        queue.push(s.id)
      }
    }
    childSessions = descendants.length
    for (const child of descendants) {
      cost = (cost ?? 0) + child.cost
      tokens = {
        input: (tokens?.input ?? 0) + child.tokens.input,
        output: (tokens?.output ?? 0) + child.tokens.output,
        reasoning: (tokens?.reasoning ?? 0) + child.tokens.reasoning,
        cacheRead: (tokens?.cacheRead ?? 0) + child.tokens.cache.read,
        cacheWrite: (tokens?.cacheWrite ?? 0) + child.tokens.cache.write,
      }
      const childMessages = (await api(`/api/session/${child.id}/message?limit=200`)).data as any[]
      countMessages(childMessages)
    }
    const check = await task.check(dir)
    success = check.pass
    detail = check.detail
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
  }

  const after = pid ? treeRSS(await processes(), pid) : { rss: 0, count: 0 }
  samplingDone = true
  await sampling
  const logEnd = await Bun.file(LOG).size
  const slice = await Bun.file(LOG).slice(logStart, Math.min(logEnd, logStart + 20_000_000)).text()
  const serverLogHttpCalls = slice.split("\n").filter((l) => l.includes("http.method=")).length

  const run: Run = {
    agent: "aporetic",
    task: task.id,
    mode,
    budget,
    rep,
    success,
    check: detail,
    sessionID,
    tokens,
    cost,
    parentCost,
    childSessions,
    wallMs: Date.now() - t0,
    modelRequests,
    toolCalls,
    toolCallsByName,
    toolSequence,
    repeatedToolCalls,
    skillCalls,
    subagentCalls,
    apiRequests: harnessCalls,
    serverLogHttpCalls,
    peakTreeRSS: peak,
    startTreeRSS: before.rss,
    endTreeRSS: after.rss,
    serverPID: pid,
    outcome,
    error,
    command:
      "POST /api/session (location=run dir, model=deepseek/deepseek-flash, permissions=allow *) then POST /api/session/:id/prompt",
    version: "2.0.26 (running server on 127.0.0.1:49374)",
    startedAt,
  }
  return run
}

// ---- main
const results: Run[] = []
const previous: Run[] = (await Bun.file(OUT).exists()) ? (JSON.parse(await Bun.file(OUT).text()).runs ?? []) : []
await Bun.write(`${ROOT}\\.keep`, "")
await Bun.$`powershell -NoProfile -Command "New-Item -ItemType Directory -Force '${RUNS}' | Out-Null"`.quiet()

for (const task of args.includes("--skip-baseline") ? [] : selected) {
  for (let rep = 1; rep <= reps; rep++) {
    process.stdout.write(`run ${task.id} baseline rep${rep} ... `)
    const run = await runAporetic(task, "baseline", undefined, rep)
    results.push(run)
    console.log(
      `${run.success ? "PASS" : "FAIL"} tools=${run.toolCalls} models=${run.modelRequests} tok=${run.tokens?.input}/${run.tokens?.output} cost=$${run.cost?.toFixed(4)} ${run.wallMs}ms`,
    )
  }
}

if (fixedBudget !== undefined) {
  for (const task of selected) {
    process.stdout.write(`run ${task.id} budget=${fixedBudget} ... `)
    const run = await runAporetic(task, "budget", fixedBudget, 1)
    results.push(run)
    console.log(
      `${run.success ? "PASS" : "FAIL"} tools=${run.toolCalls} models=${run.modelRequests} tok=${run.tokens?.input}/${run.tokens?.output} cost=$${run.cost?.toFixed(4)} ${run.wallMs}ms`,
    )
  }
}

if (sweep) {
  const minima: Record<string, number | undefined> = {}
  for (const task of selected) {
    const baseline = [...previous, ...results]
      .filter((r) => r.task === task.id && r.mode === "baseline" && r.success)
      .at(-1)
    if (!baseline) continue
    const steps: number[] = []
    for (let b = baseline.toolCalls - 2; b >= 2; b -= 2) steps.push(b)
    let min: number | undefined
    let failed: number | undefined
    for (const budget of steps) {
      process.stdout.write(`run ${task.id} budget=${budget} ... `)
      const run = await runAporetic(task, "budget", budget, 1)
      results.push(run)
      console.log(
        `${run.success ? "PASS" : "FAIL"} tools=${run.toolCalls} models=${run.modelRequests} cost=$${run.cost?.toFixed(4)} ${run.wallMs}ms`,
      )
      if (run.success) min = budget
      else {
        failed = budget
        break
      }
    }
    if (min !== undefined && failed !== undefined && min - failed > 1) {
      const mid = min - 1
      process.stdout.write(`run ${task.id} budget=${mid} ... `)
      const run = await runAporetic(task, "budget", mid, 1)
      results.push(run)
      console.log(`${run.success ? "PASS" : "FAIL"} tools=${run.toolCalls} ...`)
      if (run.success) min = mid
    }
    minima[task.id] = min
    console.log(`min tool budget for ${task.id}: ${min ?? "below-baseline sweep failed"}`)
  }

  const values = Object.values(minima).filter((v): v is number => v !== undefined)
  const union = values.length === selected.length ? Math.max(...values) : undefined
  if (union !== undefined) {
    console.log(`union budget for all tasks: ${union}`)
    for (const task of selected) {
      if (results.some((r) => r.task === task.id && r.mode === "budget" && r.budget === union)) continue
      process.stdout.write(`run ${task.id} budget=${union} (union validation) ... `)
      const run = await runAporetic(task, "budget", union, 1)
      results.push(run)
      console.log(`${run.success ? "PASS" : "FAIL"} tools=${run.toolCalls} cost=$${run.cost?.toFixed(4)}`)
    }
  }
}

const previousRuns: Run[] = (await Bun.file(OUT).exists()) ? (JSON.parse(await Bun.file(OUT).text()).runs ?? []) : []
await Bun.write(
  OUT,
  JSON.stringify({ generatedAt: new Date().toISOString(), model: MODEL_LABEL, runs: [...previousRuns, ...results] }, null, 2) + "\n",
)
console.log(`wrote ${results.length} runs to ${OUT}`)
