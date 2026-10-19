# AP-STAGE4-10 — Contraptions UI rename

**Status:** **INDEPENDENT PASS (copy rename scope)** — 2026-10-19  
**Work date / recorded:** 2026-10-19 (America/Chicago)  
**Worktree:** `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4` branch `stage4-an-shell`  
**Base tip before slice:** `22e43a666d` (AP-STAGE4-09)  
**Code commit:** `3e5553fd5c`  
**Implementation tip:** `2957aad00b` (docs note after code)  
**Verifier tip:** `d35b59cee5` (this independent PASS section)

## Scope

User-facing **Flows** → **Contraption(s)** with always-on category gloss. Engine IDs unchanged. Product = Aporetic; ice glass untouched. Redstone Easter-egg only.

### Copy pattern (Ali)

| Surface | Copy |
|---|---|
| Tab/nav | **Contraptions** |
| Section head + helper | **Contraptions** · **Automations & integrations · 0 model tokens** |
| Singular | **a Contraption** / Save Contraption / Run Contraption |
| Slash help | category **Contraptions**; description includes Automations & integrations |
| Redstone | `title="redstone stays the private joke"` on helper span only |

### Ali concern (board)

Generic English word → weaker exclusive trademark + needs category gloss. Mitigate with subtitle; do not abandon unless Ali switches. Open question: keep Contraptions+subtitle vs later coined name.

## Files touched

- `packages/app/src/aporia/right-panel.tsx` — tab label
- `packages/app/src/aporia/flows.tsx` — section/list/add/save/slash copy + Easter-egg title
- `packages/app/src/aporia/flows-util.ts` — toast / parse error strings
- `packages/app/src/aporia/flows-util.test.ts` — expectations
- `packages/app/src/aporia/automations.tsx` — file comment

## Still says Flow internally (intentional)

- Module paths: `flows.tsx`, `flows-util.ts`, `FlowCommands`, `FlowsSection`
- Types: `FlowSummary`, `FlowRunDetail`, …
- API: `sdk.api.flow`, `/api/flow`, `flowID`, `flow.*` events
- Command registry id: `aporia.flows`, command ids `flow.${id}`
- CSS: `ap-flows`, `ap-flow-*`, `data-action="flow-*"`
- Engine: F1, FlowRunner, `packages/core/src/flow/`

## Checks

- `bun test src/aporia/flows-util.test.ts` in `packages/app` → **4 pass**
- No merge / no push / not installed Aporetic

## Independent verification (2026-10-19)

Verdict: **PASS** (Flows→Contraptions copy rename + category gloss scope only).

| check | result |
| --- | --- |
| Tip | code `3e5553fd5c`; implementation tip `2957aad00b`; verifier tip `d35b59cee5`; base `22e43a666d` (ancestor OK) |
| Tab/nav | `right-panel.tsx`: automations tab label **Contraptions** |
| Section + subtitle | `flows.tsx`: **Contraptions** + always-on **Automations & integrations · 0 model tokens** |
| Singular / actions | Save/Add/Run/toasts/empty/errors use Contraption(s) — no user-facing **Flows** left in `aporia/` UI strings |
| Slash | category **Contraptions**; description includes Automations & integrations; `FlowCommands` mounted under AnShell |
| Redstone | Easter-egg **only**: `title="redstone stays the private joke"` on helper span — not tab/nav/brand |
| Internals | `flow_*` / `FlowsSection` / `sdk.api.flow` / CSS `ap-flow-*` / engine F1 unchanged (intentional) |
| Re-ran tests | `packages/app` `bun test src/aporia/flows-util.test.ts` → **4 pass / 0 fail** |
| Known gap (OK) | AnShell does **not** mount `AporiaRightPanel` — Contraptions tab/subtitle not visible in current AnShell chrome; not a fail of the copy rename. Slash entries appear only when saved definitions exist. |
| Isolation | No merge/push; product `C:\Tools\aporia` not this branch; Stage 0 worktree untouched; verifier did not modify product code |

Deferred (not this slice): mount Contraptions surface in AnShell chrome; Stage 4 complete; running-DEV acceptance PASS; merge/push.

## running-DEV note (visibility gap, not copy FAIL)

- Electron Aporetic visible on tip worktree; ice glass intact; product Aporetic.
- Shot: `docs/an-rewrite/evidence/screenshots-2026-10-18/15-stage4-10-running-dev-anshell.webp` (+ board copy under `business-control/evidence/2026-10-19-stage4-10-running-dev.webp`).
- **AnShell residual (known OK):** Stage 4 AnShell does not mount `AporiaRightPanel`, so the **Contraptions** tab/subtitle is not visible in current AnShell chrome — rename is in `right-panel` / `flows` sources for classic panel + slash category when saved definitions exist.

## Board

- `AP-NAME-AUTOMATION` → DONE (Contraption chosen)
- `AP-STAGE4-10` → **DONE** — INDEPENDENT PASS (copy rename scope)
- Evidence: `business-control/evidence/2026-10-19-ap-name-contraption-chosen.txt` + `business-control/evidence/2026-10-19-stage4-10-independent-pass.txt`
