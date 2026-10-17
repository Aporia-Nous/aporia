// The HTTP step. No credentials (they arrive with the vault in F2), no redirects (a redirect could
// leave the declared hosts), a timeout, and a size cap on what comes back. Everything the definition
// check refuses at save is refused again here, against the resolved values, because a saved
// definition may predate a check and a template fills values only at run time.
import { Effect } from "effect"
import { headerProblem, hostOf, safety, schemeOf, urlProblem, type Definition, type Step } from "./definition.js"
import { resolve, type Item, type Json, type Scope } from "./expr.js"

export const MAX_RESPONSE_BYTES = 1_000_000
export const DEFAULT_TIMEOUT_SECONDS = 30

export type HttpOutcome =
  | { readonly ok: true; readonly item: Item }
  | { readonly ok: false; readonly error: string; readonly retryable: boolean }

const readCapped = async (response: Response): Promise<string | undefined> => {
  if (!response.body) return ""
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_RESPONSE_BYTES) {
      await reader.cancel().catch(() => undefined)
      return undefined
    }
    chunks.push(value)
  }
  return new TextDecoder().decode(Buffer.concat(chunks))
}

export const execute = (input: {
  readonly def: Definition
  readonly step: Step
  readonly scope: Scope
  readonly runId: string
}): Effect.Effect<HttpOutcome> => {
  const p = input.step.params as Record<string, Json>
  const method = String(p.method ?? "GET").toUpperCase()
  const raw = resolve(p.url ?? "", input.scope)
  if (typeof raw !== "string") return Effect.succeed({ ok: false, error: "url did not resolve to text", retryable: false })
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return Effect.succeed({ ok: false, error: "url is not valid", retryable: false })
  }
  const refused = (error: string) => Effect.succeed<HttpOutcome>({ ok: false, error, retryable: false })
  const bad = urlProblem(url)
  if (bad) return refused(bad)
  const declared = schemeOf(typeof p.url === "string" ? p.url : "")
  if (declared && url.protocol !== `${declared}:`)
    return refused(`url scheme ${url.protocol.replace(/:$/, "")} is not the declared ${declared}`)
  const host = hostOf(url.href)
  const allowed = new Set((input.def.permissions?.hosts ?? []).map((h) => h.toLowerCase()))
  if (!host || !allowed.has(host))
    return Effect.succeed({ ok: false, error: `host ${host ?? "?"} is not declared in permissions.hosts`, retryable: false })
  const query = p.query !== undefined ? resolve(p.query, input.scope) : undefined
  if (query && typeof query === "object" && !Array.isArray(query))
    for (const [key, value] of Object.entries(query))
      url.searchParams.set(key, typeof value === "string" ? value : JSON.stringify(value))
  const headers = new Headers()
  const resolvedHeaders = p.headers !== undefined ? resolve(p.headers, input.scope) : undefined
  if (resolvedHeaders && typeof resolvedHeaders === "object" && !Array.isArray(resolvedHeaders))
    for (const [key, value] of Object.entries(resolvedHeaders)) {
      const problem = headerProblem(key)
      if (problem) return refused(`header ${key.slice(0, 60)} ${problem}`)
      try {
        headers.set(key, typeof value === "string" ? value : JSON.stringify(value))
      } catch {
        return refused(`header ${key.slice(0, 60)} has a value that cannot be sent`)
      }
    }
  // Idempotent by declaration: the far end can drop a repeat because the key never changes per step.
  if (safety(input.step) === "idempotent" && method !== "GET" && method !== "HEAD")
    headers.set("Idempotency-Key", `flow-${input.runId}-${input.step.id}`)
  let body: string | undefined
  if (p.body !== undefined && method !== "GET" && method !== "HEAD") {
    const value = resolve(p.body, input.scope)
    body = typeof value === "string" ? value : JSON.stringify(value)
    if (!headers.has("content-type")) headers.set("content-type", typeof value === "string" ? "text/plain" : "application/json")
  }
  const timeout = (typeof p.timeoutSeconds === "number" ? p.timeoutSeconds : DEFAULT_TIMEOUT_SECONDS) * 1000
  return Effect.tryPromise({
    try: async (signal) => {
      const response = await fetch(url, {
        method,
        headers,
        body,
        redirect: "manual",
        signal: AbortSignal.any([signal, AbortSignal.timeout(timeout)]),
      })
      const text = await readCapped(response)
      return { response, text }
    },
    catch: (error) => error,
  }).pipe(
    Effect.map(({ response, text }): HttpOutcome => {
      if (text === undefined) return { ok: false, error: `response is larger than ${MAX_RESPONSE_BYTES} bytes`, retryable: false }
      // Redirects are never followed: the next hop could be a host the flow did not declare.
      if (response.status >= 300 && response.status < 400)
        return { ok: false, error: `HTTP ${response.status}: redirects are not followed`, retryable: false }
      if (response.status >= 500) return { ok: false, error: `HTTP ${response.status}`, retryable: true }
      if (response.status >= 400) return { ok: false, error: `HTTP ${response.status}`, retryable: false }
      const type = response.headers.get("content-type") ?? ""
      let parsed: Json = text
      if (type.includes("json") && text.length > 0) {
        try {
          parsed = JSON.parse(text) as Json
        } catch {
          parsed = text
        }
      }
      return { ok: true, item: { status: response.status, ok: response.ok, contentType: type, body: parsed } }
    }),
    Effect.catch((error) =>
      Effect.succeed<HttpOutcome>({
        ok: false,
        error: error instanceof Error && error.name === "TimeoutError" ? "timed out" : "network error",
        retryable: true,
      }),
    ),
  )
}

/** Backoff before attempt n+1: 1 s, 2 s, 4 s ... capped at 30 s. */
export const backoff = (attempt: number) => Math.min(30_000, 1000 * 2 ** Math.max(0, attempt - 1))

export const maxAttempts = (step: Step) => {
  const declared = step.params.maxAttempts
  if (typeof declared === "number") return declared
  // An unsafe call is never repeated on its own: a 5xx may still have done the work.
  return safety(step) === "unsafe" ? 1 : 3
}
