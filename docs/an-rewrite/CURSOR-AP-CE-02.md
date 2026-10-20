# AP-CE-02 — Contraptions efficiency wire (intent gate → FlowRunner; skip model tokens)

| Field | Value |
|-------|-------|
| status | **OPEN** (writer implemented + measured; await independent PASS) |
| branch | `stage4-an-shell` |
| worktree | `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4` |
| tip / code | *(set after commit)* |
| docs tip | *(set after docs commit)* |
| base | AP-CE-01 `27af7302f7` / docs `eac2f57495` |
| merge/push/install | **No** |

## Intent

Board residual after CE-01: wire `classifyComposerText` / `classifyFlowTrigger` so mechanical Contraptions skip SessionRunner model tokens when gated. Preserve Stage 5 UX. Do **not** start FLOW-GENIUS-01 or Stage 6 without Ali confirm.

Board title also mentions browser named steps — **residual** this slice (plugin-browser tools remain SessionRunner/F3 path; no new FlowDefinition browser step types).

## Contract (wire)

1. **Composer / EnginePort** — registered `/flow-id …` text → `routeComposerAdmission` → `flow.start` / FlowRunner; `session.prompt` **not** called; `modelTokens: 0`.
2. **FlowCommands + Contraptions Run** — `classifyFlowTrigger` before `flow.start`.
3. **Server `flow.start`** — `classifyFlowTrigger` against listed ids; unregistered → not found.
4. **Chat / unregistered slash / attachments** — SessionRunner unchanged.
5. **Brand** — Aporetic by Aporia Nous; user surface Contraptions; engine IDs `flow_*`.

## What shipped

| Piece | Path |
|-------|------|
| Route helper | `packages/core/src/flow/intent-gate.ts` — `routeComposerAdmission` / `mechanicalStartFromDecision` |
| Core wire fixtures | `packages/core/test/flow-ce02-wire.test.ts` |
| App gate mirror | `packages/app/src/aporia/intent-gate.ts` (+ test) |
| Registry | `packages/app/src/aporia/contraption-registry.ts` |
| EnginePort gate | `packages/app/src/shell/an/engine/oc-server-port.ts` + AnShell `session-layout` wire |
| FlowCommands / panel | `packages/app/src/aporia/flows.tsx` |
| Server flow.start | `packages/server/src/handlers/flow.ts` |
| Metrics | `business-control/evidence/2026-10-20-ap-ce-02-metrics.json` |

## Writer verification

- `bun test test/flow-ce02-wire.test.ts` (+ CE-01) → **12 pass**; `CE02_METRICS` modelTokensSum=0 sessionPromptCallsOnGated=0
- App: intent-gate + flows-util + oc-server-port → **16 pass** (incl. gated slash skips `session.prompt`)
- Server `flow.test.ts` → **1 pass**
- AnShell tokens → **26 pass** (Stage 5 chrome markers intact)

## Not claimed

- Independent PASS (await verifier)
- Browser named FlowDefinition steps
- FLOW-GENIUS-01 / Stage 6
- Merge / push / install
- Live product CDP routing proof
