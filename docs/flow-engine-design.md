# Aporetic native flow engine — design

Status: draft for Ali's review, 2026-10-17. Written alongside Stage 3 (branch `an/stage-3-coordinator`). Nothing here is
built yet. The engine starts after Stage 3 and takes three or four stages (F1–F4 below).

## 1. Why, in one paragraph

Many jobs Ali hands to an AI model each day are mostly mechanical: fetch something, reshape it, check a field, post
it somewhere. A model does the mechanical part slowly and expensively, and it does it a little differently every time.
n8n proved that these jobs work better as **flows**: a trigger, then a chain of small deterministic steps, with a model
used only where judgment is needed. Ali already has n8n-style workflows and wants to run them **inside Aporetic**: from
a Flows tab, as tools an agent can call, and as slash commands. That moves work off the models and saves tokens.
Aporetic will be a packaged, sold product, so the engine has to be our own code.

## 2. Decisions already made

| decision | why |
| - | - |
| Build a native engine on top of the Stage 2 event log. | The log already gives us append-only facts, idempotency keys, a replay cursor, and (from Stage 3) a running trigger and attention cards. A flow run is just more facts. |
| Do **not** bundle or embed n8n. | n8n ships under the Sustainable Use License. It allows internal business use but not offering n8n inside a product sold to others. That needs a paid n8n Embed licence. Aporetic is a sold product. |
| Perseus is **not** the engine. | It is proprietary, not designed for this, and not in a state to be copied for it. It stays local and separate. |
| Import n8n **workflow JSON** as a data format only. | Reading a JSON file that describes a workflow is interoperability. We write our own code to interpret it. No n8n source, node code or UI is copied. |

## 3. Goals and non-goals

**Goals**

1. Run deterministic flows with **zero model tokens**: HTTP calls, transforms, filters, branches, waits, schedules.
2. Use AI only inside clearly marked AI steps, after the deterministic steps have narrowed the input, and with a budget.
3. A general **classify-or-decide** step that may answer **"I don't know"**. That answer escalates to an attention card
   instead of guessing.
4. Every run is a sequence of events in the log. It survives a restart, and it can be replayed and audited.
5. Exactly-once *recording* and at-least-once *execution*. Side effects that are not idempotent are marked, so the
   engine never repeats them silently.
6. Import Ali's existing n8n workflows for the node types we support, with a clear report of anything we don't support.
7. Three ways in: the Flows tab, flow-as-tool (an agent calls a flow by name), and `/flow-name` slash commands.
8. Credentials stay server-side in a vault. They never go into a prompt, a log line, an event payload or the renderer.

**Non-goals (for F1–F4)**

- Rebuilding n8n's catalogue of hundreds of integrations. We ship a small core set plus a generic HTTP step, and add
  connectors when a real flow needs one.
- A multi-tenant cloud runner. The engine runs in the Aporetic server process on the user's machine.
- Running n8n's own code, community nodes or n8n JavaScript expressions verbatim. (See §9 for how expressions map.)
- A visual editor before F4. Until then a flow is JSON and the Flows tab is a list, a run button and a run history.

## 4. Core concepts

**Flow.** A versioned definition: an id, a name, a trigger, steps, connections, the permissions it declares, and the
names of the credentials it uses (never their values). It is stored as data. Editing a flow creates a new version,
and a run always records which version it ran.

**Trigger.** What starts a run:

| trigger | detail |
| - | - |
| manual | the Run button in the Flows tab |
| slash command | `/name args` in the composer, parsed into the flow's declared inputs |
| tool call | an agent calls the flow as a tool; the input is checked against the flow's input schema |
| schedule | cron in the user's time zone (America/Chicago for Ali), DST-aware, with an explicit catch-up policy (§7) |
| webhook | a local HTTP endpoint with a per-flow secret (§7) |
| event | a mission-log fact matches a filter, for example "a `review.failed` in mission X" |

**Step (node).** One unit of work with typed input and output. Steps come in three kinds, and the kind is part of the
contract:

- **deterministic**: transform, filter, if/switch, merge, set fields, wait, HTTP request, read or write a file in the
  flow's granted folder, run another flow. These cost no tokens.
- **AI**: summarize, extract, draft, classify-or-decide. Each declares a model, a token budget, and a structured output
  schema.
- **human**: approval or a question. The step raises an attention card and waits until the card is resolved.

**Connection.** A directed edge from a step's output to the next step's input. A step can have more than one named
output (`true` / `false` for an if, one per case for a switch, `error` for failure routing).

**Item.** The unit of data flowing between steps: a JSON object, plus optional binary references (files stored on disk,
never inlined into events). A step receives a list of items and emits a list. This matches n8n's item model, which
keeps imported flows meaningful.

**Run (execution).** One execution of one flow version, identified by a run id. That id is the run's correlation id in
the log, so the whole run folds from its events, the same way Stage 2 coordination threads and Stage 3 cards do.

**Credential.** A named secret in the vault (§6). A step names the credential it needs. The vault resolves it at the
moment of the call, inside the server, and only for that call.

### 4.1 Runs as events

A run writes facts and keeps no state outside the log. Proposed event types (new `flow.*` names in the same log):

| event | written when | key |
| - | - | - |
| `flow.run.requested` | a trigger fires | `run:<trigger id>:<occurrence>`, so a webhook retried by its sender, or a schedule tick replayed after a crash, starts one run |
| `flow.step.started` | before a step's side effect | `step:<run>:<step>:<attempt>` |
| `flow.step.succeeded` | after; carries the output, or a reference to it when large | same key + `:ok` |
| `flow.step.failed` | after a failed attempt; carries the error class and whether a retry is scheduled | same key + `:err` |
| `flow.decision.unknown` | a classify-or-decide step returned "I don't know" | raises a `coordination.attention` card |
| `flow.run.completed` / `flow.run.failed` / `flow.run.cancelled` | terminal | `run-end:<run>` |

The Stage 3 trigger already drains the log. A small flow runner subscribes to it the way the coordinator does: it
reads `flow.run.requested` and the step events, folds each open run, and works out the next step. A restart in the
middle of a run resumes from the last recorded fact. A step that has `started` with no matching `succeeded` or
`failed` is the crash window, handled by the idempotency rules in §8.

**One runner per database (stage 1, after the verifier's H1).** Every server process (desktop, CLI, a second copy)
builds the runner, and two of them can open the same database. Only the holder of the runner lease advances runs: a
single row (`flow_runner_lease`: owner, boot, expiry) taken and renewed with one conditional upsert, so two runners
cannot both take it. The lease lasts 30 s, is renewed every 10 s while held (also while a slow step is in flight), is
re-checked against the database right before every step start, and is cleared on a clean shutdown so the next runner
takes over at once. Lease times are wall-clock, because they are compared across processes.

Every `flow.step.started` records the runner's `owner` id and its process `boot` id. A started step with no result is
treated as **cut off by a crash only when its owner no longer holds the lease** (or, for this runner's own steps, when
the step is no longer in flight in this process). While the owner holds the lease the step is simply running: no
retry, no card. A start recorded before this change carries no owner and reads as cut off, as before. If a runner
loses the race to record a start (`inserted: false`), the step belongs to whoever recorded it, and the loser stops
advancing that run instead of counting an action and re-planning.

No lock is held across a step's I/O. Each run has its own lock, held while that run advances (including its own HTTP
call), so one slow step holds up only its own run. Ticks run open runs side by side, skip a run another tick is
already advancing, and the runner loop starts a tick every second without waiting for the previous one.

Known limits: the lease is a lease, not a fence. A runner that stalls for longer than the lease (a suspended laptop,
a debugger) may find another runner has taken over and treated its in-flight step as cut off; for an unsafe step
that means an attention card, never a silent repeat. Clock skew between processes on one machine is not a concern;
the lease is not meant for a database shared across machines.

## 5. The classify-or-decide step

This is the one general AI primitive, and it is how flows avoid both guessing and stopping dead.

- **Input:** the items, a question in plain words, and a closed set of allowed answers (labels). Optionally a few
  worked examples.
- **Output schema:** `{ answer: <one of the labels> | "unknown", confidence: 0..1, reason: string }`.
  `"unknown"` is always an allowed answer, whatever labels the flow defines.
- **Rule:** if the answer is `unknown`, or confidence is below the step's threshold (default 0.7), the engine does not
  take a branch. It writes `flow.decision.unknown` and raises an attention card ("Flow *Inbox triage* could not decide:
  is this a lead or support? — reason …"). The run waits until the card is resolved. The person's choice becomes the
  step's output, and the run continues down that branch.
- **Learning without magic:** each resolved unknown is stored as a labelled example on the flow, which Ali can review.
  Later runs can include those examples in the prompt. Nothing is learned silently.
- **Cheap first:** before calling a model, the step checks deterministic rules the flow defines (keyword, regex,
  sender domain, an exact match from past resolutions). A rule hit answers with no tokens spent.

## 6. Credentials vault (private, server-side)

- Secrets are stored encrypted at rest. The key is held by the OS keychain (Windows DPAPI / Credential Manager), not in
  the database or a file next to it.
- The renderer never receives a secret. The Flows UI shows each credential's name, type, last-used time and the flows
  that use it, and offers a "replace" action that writes a new value straight to the server.
- Steps get a short-lived handle and the server injects the value into the outgoing request. Event payloads, step
  outputs and logs pass through a redactor that knows every live secret value and masks it.
- Credentials the server already stores (the existing credential API) can be referenced by name, so they are not copied.
- n8n import never imports secrets. An imported flow lists the credential *names* it expects, and the user fills them in.

## 7. Scheduling and webhooks

- **Schedules** are cron expressions evaluated in the flow's time zone using wall-clock rules: a 9:00 AM run happens at
  9:00 AM local on both sides of a DST change; a time that does not exist (2:30 AM on spring-forward day) runs at the
  next valid minute; a time that repeats (fall-back) runs once. Tests pin all three.
- **The app can be closed.** The engine runs in the Aporetic server, so while the app is closed, nothing runs. Each
  schedule declares a catch-up policy for missed ticks: `skip`, `run-once` (default), or `run-each` (capped). The
  catch-up happens through the boot drain, the same mechanism that recovers coordinator facts after a crash.
- **Webhooks** listen on `127.0.0.1` by default, at `/hooks/<flow id>/<secret path>`, and can also require an HMAC
  signature. Exposing a webhook beyond the machine (a tunnel, or `0.0.0.0`) is a separate, explicit, per-flow switch
  that shows a warning. It is never a default.
- Each delivery is deduplicated by its delivery id (or a body hash when the sender provides none) inside the
  `flow.run.requested` key, so a sender's retries start one run.

## 8. Retries and idempotency

- Every step attempt has a key: `<run>:<step>:<attempt>`. The log records each attempt exactly once.
- Execution is at-least-once, so each step declares how it behaves when repeated:
  - `pure`: no side effect. It is always safe to re-run.
  - `idempotent`: the side effect carries a key (for example an `Idempotency-Key` HTTP header derived from the step
    key), so a repeat is a no-op at the far end.
  - `unsafe`: a repeat could double the effect (send an email, charge a card). After a crash between `started` and a
    result, the engine does **not** retry an unsafe step automatically. It raises an attention card: "Step *Send
    invoice* may or may not have run. Check, then mark done or run again."
- Retry policy is per step: max attempts (default 3), exponential backoff with jitter, and which error classes are
  retryable (network and 5xx yes; 4xx and validation no).
- **Stage 1 as built:** an `unsafe` HTTP step gets one attempt by default (a 5xx may already have done the work). A
  flow author may set `maxAttempts` up to 5 on an unsafe step; that is an explicit opt-in to automatic repeats after a
  5xx or a network error, and the far end may then see the call more than once. It does **not** change the crash
  window: an unsafe step cut off by a crash still raises a card and is never re-run on its own, whatever its
  `maxAttempts`. Backoff is 1 s, 2 s, 4 s ... capped at 30 s, without jitter in stage 1.
- When retries are used up, the run takes the step's `error` output if the flow wired one. Otherwise the run fails
  and raises one attention card per run, deduped by run id.
- **Loop safety:** a flow that triggers itself is detected through the correlation chain and refused past a depth
  limit. An AI step cannot start a flow unless the flow's permissions allow it.

## 9. n8n workflow JSON import (format only)

An n8n export is a JSON document with `nodes` (`name`, `type`, `typeVersion`, `parameters`, `credentials`) and
`connections` (keyed by source node name, then output type and index). The importer:

1. Parses the JSON and validates its shape. It never executes anything in the file.
2. Maps each `type` through a **mapping table** onto our step kinds, for example `n8n-nodes-base.httpRequest` → HTTP
   request, `…if` → if, `…switch` → switch, `…set` → set fields, `…scheduleTrigger` → schedule,
   `…webhook` → webhook, `…merge` → merge, `…wait` → wait. The table is our own code and data. It names n8n node types
   only so we can recognise them.
3. Translates n8n expressions (`={{ $json.field }}`, `$node["X"].json`) into our own small, sandboxed expression
   language, which supports field paths, comparisons, string and date helpers, and no arbitrary JavaScript. An
   expression we cannot translate fails the import of that step with a clear message. It is not passed through to run.
4. Turns `credentials` references into credential-name placeholders (§6).
5. Produces an **import report**: steps imported, steps that need a credential, and unsupported nodes or expressions
   with the line each came from. A flow with unsupported steps is saved disabled until those steps are fixed or removed.
6. Keeps the original JSON beside the imported flow, so a re-import after a mapping-table improvement is lossless.

Legal note: this is format interoperability, and we copy no n8n source. It is still worth a short check with counsel
before the importer ships in a paid build. "n8n" is a trademark, so product copy should say "imports n8n workflow files"
and never imply a partnership.

## 10. Observability

- **Run timeline** in the Flows tab: each step with its status, duration, attempts, the tokens and cost an AI step
  used, and redacted input and output. It is folded from the run's events, so what you see is what was recorded.
- **Per-flow stats:** runs, success rate, median duration, tokens and money per run, and the total tokens saved
  compared with the AI-only baseline, where the flow replaced a prompt Ali used to run by hand. That last number is
  the reason the engine exists, so it is measured, not assumed.
- **Failures surface once:** retries are visible in the timeline, and only exhausted retries or `unknown` decisions
  raise attention cards. Cards use the Stage 3 dedupe rules, so a failing schedule cannot flood the panel.
- **Logs** go through the redactor (§6). Large outputs are stored as files referenced by the event, which keeps the
  SQLite log small.

## 11. Permission model (no global allow)

- A flow **declares** what it needs: network hosts, folders, credentials by name, other flows, tools, and AI models
  with a token budget. Anything it does not declare is denied.
- The first run asks once. The prompt lists the declared permissions in plain words. Grants are recorded as events
  (`flow.permission.granted` / `revoked`), are visible per flow, and can be revoked.
- There is **no** "allow everything", no wildcard host, and no wildcard path. The broadest grant is a single host or a
  single folder.
- Changing a flow's declared permissions in a new version asks again for the new parts only.
- AI steps cannot widen permissions. A model's output is data. It cannot add a host, read a credential or start an
  undeclared flow.
- Flow-as-tool inherits the **lower** of the agent's permissions and the flow's grants, never the higher.

**HTTP boundary in stage 1 (after the verifier's M1, M2 and LOW findings).** Checked at save and again at run against
the resolved values, because a saved definition may predate a check:
- A url is `http` or `https`, its host (and port) is declared exactly in `permissions.hosts`, a template may fill the
  path or query but never the scheme or host, and the scheme a step's url declares is the one it is called with.
- A url may not carry a user name or password (`https://user:pw@host/`): the HTTP client would turn it into Basic
  auth, and credentials arrive with the vault (F2).
- A flow may not set credential headers (`Authorization`, `Cookie`, `Proxy-Authorization`) or headers that decide
  where or how a request travels: `Host`, `Connection`, `Keep-Alive`, `Transfer-Encoding`, `TE`, `Trailer`,
  `Upgrade`, `Content-Length`, `Expect`, `Forwarded`, `Via`, `X-Real-IP`, `X-Original-URL`, `X-Rewrite-URL`, any
  `Proxy-*` or `X-Forwarded-*`, and method overrides (`X-HTTP-Method-Override`, `X-HTTP-Method`,
  `X-Method-Override`, which would let a "GET", treated as safe to repeat, act as a POST or DELETE).
- Redirects are never followed; responses are capped at 1 MB; a timeout is 1 to 60 s.
- **DNS and private addresses (stance, not a defence):** a declared host is a name, and the runner calls whatever
  that name resolves to at call time. There is no resolve-and-pin and no private-address block, so a declared name
  that resolves to a loopback or private address is called, and a declared public name whose DNS is changed to a
  private address (DNS rebinding) is not stopped. This is deliberate for stage 1: local services (`127.0.0.1:port`,
  home-lab hosts) are a real use, and the boundary is who may save a flow (the owner). Resolve-and-pin with an
  explicit `permissions.privateNetwork` opt-in is planned with the vault (F2), before flows can be saved by anyone
  other than the owner.
- A `set` or `transform.rename` may not write the field `__proto__`, and template resolution defines keys rather than
  assigning them, so no step can replace an item's prototype.

## 12. Open-core boundary

| public core (open source) | private (proprietary, paid tiers) |
| - | - |
| engine runtime, flow schema, run events and the runner | credentials vault implementation and key handling |
| deterministic steps (HTTP, transform, if/switch, merge, wait, set) | connector packs (Gmail, Slack, CRM, payments, …) |
| classify-or-decide step contract and the attention-card escalation | hosted or remote webhook relay, team sync, multi-device |
| n8n JSON importer and the base mapping table | premium mapping-table entries for private connectors |
| Flows tab (list, run, history, timeline) | the visual editor (F4) if Ali wants it in a paid tier |

Rule of thumb: anything that touches secrets, a third-party account, or the hosted side stays private. Everything a
user needs to read, audit and run their own flows locally can be public. The upstream OpenCode code is MIT, so its
notices stay in every build, public or private.

**Licence references (to read, not to copy):** Activepieces (MIT core) and Node-RED (Apache-2.0) are useful to study for
ideas like step contracts, retries and editor patterns. Their licences would allow reuse with attribution, but the plan
is to write our own code. If any snippet is ever adapted, it goes in with its licence notice and a NOTICE entry. n8n
source is not read for implementation.

## 13. Roadmap (after Stage 3)

Each stage ends the same way as Stages 1–3: tests green, a Dev check with screenshots, an independent verification pass,
a local checkpoint tag, nothing pushed.

**F1 — engine core and deterministic steps** (Stage 4)
- Flow schema and versions. Runs as `flow.*` events. Runner on the Stage 3 trigger. Steps: set, transform, if, switch,
  merge, wait, HTTP (no credentials yet), run-flow. Manual trigger and `/slash` trigger. Flows tab: list, run,
  history, timeline (read-only).
- Acceptance: a 5-step deterministic flow runs with **0 model tokens** recorded; killing the server mid-run and
  restarting resumes at the next step with no step recorded twice; a replayed `flow.run.requested` starts one run; a
  `pure` step re-runs after a crash, and an `unsafe` stand-in step raises a card instead of re-running; all earlier
  suites stay green.

**F2 — triggers, credentials, permissions** (Stage 5)
- Schedule (DST rules and catch-up policy), local webhook with secret and HMAC, event trigger. Vault with OS-keychain
  key, redactor, credential-name references. Declared permissions, first-run grant and revoke, no wildcards.
- Acceptance: schedule tests for spring-forward, fall-back and ordinary days in America/Chicago; a missed tick while
  closed runs once on boot under `run-once`; a retried webhook delivery starts one run; a secret never appears in any
  event, log line or renderer payload (scan test); an undeclared host is refused; revoke takes effect on the next step.

**F3 — AI steps and classify-or-decide** (Stage 6)
- AI steps with model, budget and output schema. Classify-or-decide with `unknown`, confidence threshold, rule-first
  check, and escalation to an attention card that resumes the run on resolve. Flow-as-tool for agents. Token and cost
  accounting per run.
- Acceptance: an `unknown` answer raises exactly one card and the run resumes down the branch the person chose; a
  rule hit spends 0 tokens; a step over its budget stops with a clear error instead of spending more; flow-as-tool
  cannot exceed the calling agent's permissions; the per-flow "tokens saved" figure is computed from recorded data.

**F4 — n8n import, editor, packaging** (Stage 7, may split in two)
- Importer, mapping table, expression translator, import report, disabled-until-fixed. Optional canvas editor.
  Open-core split of the repo (public core vs private packs and vault).
- Acceptance: a set of Ali's real exported workflows (stripped of secrets) imports with a report that matches a
  hand-checked expectation; unsupported nodes are listed and never run; an imported flow with credentials filled in
  produces the same outputs as in n8n on recorded fixtures; the public build contains no vault or connector-pack code
  (checked by a build script).

## 14. Risks

| risk | mitigation |
| - | - |
| Scope creep into "rebuild n8n" | non-goals in §3; add a connector only when a real flow needs it; generic HTTP step first |
| n8n semantics we don't match (item pairing, expression edge cases) | importer refuses what it cannot translate; fixtures from real workflows; report, don't guess |
| Licence misread | the embed question is settled by not embedding; importer reviewed by counsel before a paid release; no n8n source read |
| Secrets leaking into events, logs or prompts | vault-only resolution, redactor with live secret set, scan test in F2's acceptance |
| Runaway AI cost or loops | per-step budgets, depth limit on self-triggering, `unknown` escalates instead of retrying the model |
| Webhooks exposed to the internet by accident | localhost default, explicit per-flow opt-in with warning, HMAC |
| Schedules missed while the app is closed | declared catch-up policy, boot-drain catch-up, visible "missed N runs" in the timeline |
| DST and time-zone bugs | wall-clock rules in §7, pinned tests for both transitions |
| SQLite log growth from busy flows | large outputs as files, event payload size cap, optional archive of finished runs later (the log stays append-only; archiving is a copy plus a compaction marker, decided in F1 if needed) |
| Mission log and flow events sharing one table gets noisy | `flow.*` types and run-scoped correlation ids keep queries narrow; if volume demands it, move flows to a sibling table with the same append/cursor contract (a decision for F1, not now) |

## 15. Open questions for Ali

1. Should the visual editor be public core or a paid feature?
2. Which two or three of your existing n8n workflows should be ported first? Ideally they exercise a schedule, HTTP and
   a decide step, and are low-stakes enough to run side by side with n8n for a while.
3. Should flow events share `mission_event` (simplest) or get a sibling table from day one?
