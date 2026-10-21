# AP-CE-01 — Contraptions efficiency (mechanical-first contract + 0-token metrics)

| Field | Value |
|-------|-------|
| status | **IMPLEMENTED + measured fixtures** — OPEN until independent PASS |
| branch | `stage4-an-shell` |
| worktree | `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4` |
| tip / code | `27af7302f7` |
| docs tip | `b0b908f875` (pin ancestor `6bc1a70bb8`) |
| base | Stage 5 ACCEPT docs tip `c2b65acad2` / code `6e73823dc7` |
| merge/push/install | **No** |

## Intent

Board `AP-CE-01`: Contraptions mechanical-first contract + measured 0-token path for common automations (align FLOW-GENIUS mechanical-first). Done means = **plan + fixture metrics**; no blind rewrite; no Stage 6 lean pack (needs FLOW-GENIUS-01 Ali confirm).

## Contract (efficiency)

1. **Mechanical first** — registered Contraption slash / manual / subflow → `FlowRunner` (F1). Chat / unregistered slash → `SessionRunner`.
2. **0 model tokens on F1** — deterministic steps (`set` / `transform` / `if` / `switch` / `merge` / `wait` / `http` / `run-flow`) record `tokens: 0`. AI spend only appears when F3 AI steps exist.
3. **Measure, don’t invent %** — fixtures write coherent metrics; no claimed “saved %” vs SessionRunner.
4. **Presentation ≠ process** — Stage 5 Review-sidebar UX (Conversation primary; Computer View in Review; Takeover in-view) unchanged by this slice.
5. **Engine IDs** stay `flow_*` / `FlowRunner`; user brand = Contraptions + subtitle Automations & integrations.

## What shipped

| Piece | Path |
|-------|------|
| Intent gate (pure) | `packages/core/src/flow/intent-gate.ts` — `classifyComposerText` / `classifyFlowTrigger` / `isZeroTokenPath` |
| Export | `FlowIntentGate` from `packages/core/src/flow/index.ts` |
| Fixture + metrics test | `packages/core/test/flow-ce01-efficiency.test.ts` (7 pass) |
| Metrics JSON | `business-control/evidence/2026-10-20-ap-ce-01-metrics.json` |

**Not shipped (honest residuals):** composer / SessionRunner wiring of the gate (= later FLOW-GENIUS-03 ranking); AP-CE-02 browser named steps; Stage 6 lean pack; FLOW-GENIUS-01 Ali confirm.

## Writer verification

- `bun test test/flow-ce01-efficiency.test.ts` → **7 pass / 0 fail**; `CE01_METRICS` allZeroTokens=true modelTokensSum=0
- Fixtures: `fetch-shape` (set→http→if→transform), `greet` (pure set→if→transform→merge), `greet-slash` (slash trigger)
- Stage 5 UX / AnShell / EnginePort / native BLOCKED / OS UNSUPPORTED **untouched**

## Not claimed

- Independent PASS (await verifier re-run)
- Stage 6 / FLOW-GENIUS-02
- Composer wire / product “routing live”
- Merge / push / install
