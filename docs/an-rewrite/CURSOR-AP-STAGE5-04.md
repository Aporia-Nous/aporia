# AP-STAGE5-04 — Scope axis + electric-gold boundary (Option C)

| Field | Value |
|-------|-------|
| status | **OPEN implemented+live-DEV** — **not** INDEPENDENT PASS; **not** Stage 5 complete |
| decision | Option C continues (AP-STAGE5-MODES DONE) |
| branch | `stage4-an-shell` |
| worktree | `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4` |
| tip | `b90015847a` |
| base | STAGE5-03 tip `8c38a2039a` / docs `a956a42b4d` |
| merge/push/install | **No** |

## Option C contract (this slice)

1. **Scope** (tab group | window | local workspace) is a **separate axis** from Conversation / Computer View / Takeover
2. Opening Inline preview / Computer View **never widens scope** or grants input
3. Unauthorized tab / window actions **reject** (adapter gates) — no silent retarget
4. **Electric-gold** outline identifies the controlled surface (AN gold; never purple; not success)
5. Handoff H banner: `{bot} is controlling · [target]` / `You are controlling · Bot paused`
6. Labeled Bot cursor remains overlay chrome outside captures; Hand-back dock preserved

## What shipped

1. `computer-scope.ts` — kind assign/authorize/rescope + `syncComputerScopeFromAttach` + banner copy
2. LiveComputerPanel — `data-scope-kind` / `data-boundary=electric-gold` / scope banner
3. `session-layout` — scope sync on attach/disconnect/session; preview preserves scope
4. Takeover banner uses handoff H lines with target name
5. Units + live CDP probe

## Evidence

| Shot | What |
|------|------|
| `128-stage5-04-conversation-idle-quiet.png` | Idle Conversation — no wallpaper; scope none |
| `129-stage5-04-scope-boundary-live.png` | Live local-workspace + electric-gold + controlling banner |
| `130-stage5-04-view-scope-preserved.png` | Open in Computer View — scopeKind/target unchanged |
| `131-stage5-04-takeover-controlling-banner.png` | Takeover Hand-back + You are controlling banner |

Live CDP: `cdp-probe-stage5-04-scope-boundary.mjs` → marker **`AP-STAGE5-04 scope-boundary 1792499124664`** EXIT=0 ws.closed

Board evidence: `business-control/evidence/2026-10-20-ap-stage5-04-scope-boundary-live-dev.txt`

## Tests

`bun test src/shell/an` + `./src/aporia/flows-util.test.ts` from `packages/app` — **157 pass / 0 fail**

## Preserved

- EnginePort path
- BF Takeover / control-lock honesty
- Three shell modes + STAGE5-01/02/03 Option C (no wallpaper; Status/Inline densities; quiet entry)

## Residuals

- Native window-capture adapter / real multi-tab CDP isolation still later (gates exist; OS capture not claimed)
- Banner may show generic **Bot** when roster selected name is unavailable
- Pause button (handoff H) not added — Hand back / Stop retained
- Independent verifier not run

## Not claimed

- INDEPENDENT PASS
- Stage 5 complete
- Full brief H acceptance (DPI/native adapters)
- merge / push / promote
