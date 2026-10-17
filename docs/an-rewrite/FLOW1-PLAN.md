# Flow engine stage 1 (F1): engine core and deterministic steps

Branch `an/flow-stage-1`, cut from the Stage 3 tip `3666b13b38`, which records Stage 3's independent PASS (tag
`an/checkpoint-stage3-done` = `bb6e1228c4`). Rollback tag: `an/checkpoint-pre-flow1`. Everything stays local: nothing is
pushed, the installed app and port 4096 are not touched, and Dev checks use `opencode-aporia-dev.db` only.

Source: `docs/flow-engine-design.md` §13, F1. Scope, quoted: *flow schema and versions; runs as `flow.*` events; runner on
the Stage 3 trigger; steps set, transform, if, switch, merge, wait, HTTP (no credentials yet), run-flow; manual trigger and
`/slash` trigger; Flows tab: list, run, history, timeline (read-only).*

## Provisional decisions (Ali can overturn any of them)

| question | provisional answer | why | how to undo |
| - | - | - | - |
| Flow events in `mission_event` or in their own table? | **`mission_event`**, with new `flow.*` types. Flow definitions are events too (`flow.saved`, one per version). | It is the design doc's simplest option. It needs **no migration**: `type` is a plain text column. Runs fold through the same idempotency keys and correlation ids Stage 2 and 3 already prove. It is also the more reversible option: moving to a sibling table later means copying rows, with no schema to unwind. | Copy the `flow.*` rows to a sibling table with the same append and cursor contract, and point `Flows` and `FlowRunner` at it. |
| Visual editor | **Not built.** The Flows tab is read-only, plus a plain "Add flow from JSON" box, because otherwise there is no way to create a flow from the app. | Ali deferred the editor. | n/a |
| Which n8n workflow to port first | **None in F1.** The tests use synthetic flows only. | Ali deferred it. | n/a |
| "Runner on the Stage 3 trigger" | The runner reuses the **trigger's pattern**: a boot pass for crash recovery, then a 1 s poll in the server process. It runs as its own loop rather than inside `CoordinatorTrigger`. | A `wait` step and a retry backoff need time-based wake-ups. The coordinator trigger only fires when the log grows, so it would never resume a waiting run. | Fold `FlowRunner.tick` into the trigger's tick. |
| HTTP permissions | Pulled forward from F2 in its smallest form. A flow **declares the exact hosts** its HTTP steps may call (`permissions.hosts`, no wildcards), and every other host is refused at save time and at run time. Redirects are not followed. | The design doc's rule is "no global allow". An HTTP step without it would be an open fetcher. | Remove the check (not recommended). |

## Acceptance criteria

| id | criterion | proof |
| - | - | - |
| F1-1 | **Flow definitions and versions.** A definition is validated: unique step ids, known step types, valid params, connections to existing steps, no cycles, at least one entry step, an id usable as a slash name, and HTTP hosts declared. Each save of a changed definition appends one `flow.saved` event with version n+1. Saving an identical definition adds nothing. A run records the version it ran, and later edits do not change a running run. | core tests |
| F1-2 | **Runs are events.** `flow.run.requested`, `flow.step.started`, `flow.step.succeeded`, `flow.step.failed`, `flow.run.completed` and `flow.run.failed` are appended with idempotency keys. A run's state is folded from its events alone; there is no other run table. `flow.*` events are outcomes to the mission coordinator, so a flow never wakes a bot. | core tests (fold, decide) |
| F1-3 | **Deterministic steps.** `set`, `transform`, `if`, `switch`, `merge`, `wait`, `http` (declared hosts, no credentials, no redirects, timeout, size cap, retry with backoff on network and 5xx errors) and `run-flow` (a child run, idempotent, depth-limited) behave as documented. Expressions are a small, sandboxed path language with no JavaScript. | core unit tests per step |
| F1-4 | **0 model tokens.** A 5-step deterministic flow (set → http → if → transform → merge, against a local test server) completes, every step records `tokens: 0`, and the run total is 0. | core test |
| F1-5 | **Restart mid-run.** Stop the server after step 2 of 5 and start it again: the run resumes at step 3 and completes, and no step is started or recorded as succeeded twice. | core test on a file database across two boots |
| F1-6 | **Replay starts one run.** The same `flow.run.requested` key (a replayed trigger, or the same manual `requestId`) yields one run. | core and server tests |
| F1-7 | **The crash window.** A step that was started but has no result: a `pure` or `idempotent` step runs again as attempt n+1. An `unsafe` step is **not** run again; it raises exactly one attention card. Resolving that card with `run-again` runs it again, and any other resolution fails the run. | core tests; the unsafe case is a real HTTP POST cut off mid-request, with the server counting hits |
| F1-8 | **Triggers.** Manual: `POST /api/flow/:flowID/run` (the Flows tab's Run button). Slash: `/<flow id> [input]` in the composer runs the flow client-side, with no model call. The input is a JSON object, or `{ "text": … }`. | server test, app unit tests, Dev check |
| F1-9 | **Flows tab.** It lists flows (name, id, version, steps, last run) with a Run button, shows run history per flow and a step timeline per run (status, attempts, timings, error, output preview), and has an "Add flow from JSON" box. There is no editor. The existing n8n section is left as it is. | Dev check screenshots under `/workspace/aporetic/flow1/` |
| F1-10 | **HTTP API.** The `server.flow` group is in the protocol, `openapi.json` and the generated clients (`check:generated` clean), behind the server's normal authorization. An invalid definition gives 400, and an unknown flow or run gives 404. | server test |
| F1-11 | **No regressions.** Every Stage 1–3 gate stays green: coordination, mission, attention, the server route test, the full server suite, app `src/aporia`, desktop `src/main/aporia`, core and server typecheck 0, and only the two pre-existing TS1128 errors in the app and desktop. | stored gate run |
| F1-12 | **Hygiene.** A secret and PII scan before every commit, nothing pushed, and no done tag cut by the executor. An independent verifier reviews the result. | scan output, `git ls-remote` |

## Out of scope for F1 (said plainly)

Schedules, webhooks and event triggers; the credentials vault; the full permission model; AI steps and
classify-or-decide; flow-as-tool; the n8n importer; the visual editor; an attention card for a failed run. All of these
are F2 to F4.
