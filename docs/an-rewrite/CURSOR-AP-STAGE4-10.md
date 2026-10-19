# AP-STAGE4-10 — Contraptions UI rename

**Status:** OPEN (implemented — **not** independent PASS)  
**Work date / recorded:** 2026-10-19 (America/Chicago)  
**Worktree:** `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4` branch `stage4-an-shell`  
**Base tip before slice:** `22e43a666d` (AP-STAGE4-09)  
**This commit:** `3e5553fd5c`

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
- **Not** claiming independent PASS or Stage 4 complete

## running-DEV note (not PASS)

- Electron Aporetic visible on tip worktree; ice glass intact; product Aporetic.
- Shot: `docs/an-rewrite/evidence/screenshots-2026-10-18/15-stage4-10-running-dev-anshell.webp` (+ board copy under `business-control/evidence/2026-10-19-stage4-10-running-dev.webp`).
- **AnShell residual:** Stage 4 AnShell does not mount `AporiaRightPanel`, so the **Contraptions** tab/subtitle is not visible in current AnShell chrome — rename is in `right-panel` / `flows` sources for classic panel + slash category when saved definitions exist. Slash palette showed no flow entries (none saved). HMR may need session reload to pick UI strings.

## Board

- `AP-NAME-AUTOMATION` → DONE (Contraption chosen)
- `AP-STAGE4-10` → OPEN (this slice)
- Evidence: `business-control/evidence/2026-10-19-ap-name-contraption-chosen.txt`
