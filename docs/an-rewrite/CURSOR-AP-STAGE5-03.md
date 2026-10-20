# AP-STAGE5-03 — Inline / Status Computer event densities (Option C)

| Field | Value |
|-------|-------|
| status | **OPEN implemented+live-DEV** — **not** INDEPENDENT PASS; **not** Stage 5 complete |
| decision | Option C continues (AP-STAGE5-MODES DONE) |
| branch | `stage4-an-shell` |
| worktree | `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4` |
| tip | `8c38a2039a` |
| base | STAGE5-02 tip `e209898a04` / docs `df0150b8ae` |
| merge/push/install | **No** |

## Option C contract (this slice)

1. **Status** density = compact quiet Computer entry (attach offer / Live without feed / user asked)
2. **Inline** density = denser Live+feed preview card in Conversation with **Open in Computer View** + **Take control**
3. Densities are **not** shell modes; Conversation stays talk-first when idle (no wallpaper)
4. View / Takeover still suppress stream Computer (one live panel)
5. Preserve EnginePort + BF Takeover honesty + mode pills + Hand-back dock

## What shipped

1. `resolveComputerCardDensity` — `inline` iff Live + feedActive; else `status`
2. `computerToCard` — `eventDensity`, preview fields, Status vs Inline ids/actions/meta
3. `AnCard` — `data-event-density`; Status compact; Inline watch-only preview pane
4. `buildStreamCards` / `buildContextCards` + session-layout feed URL/srcdoc pass-through
5. Card actions: `view` → Computer View mode; `take-control` → Takeover (Live-gated)

## Evidence

| Shot | What |
|------|------|
| `124-stage5-03-conversation-idle-quiet.png` | Idle Conversation — no Computer/Team wallpaper |
| `125-stage5-03-status-density-attach-offer.png` | Connect → Status density Attach offer |
| `126-stage5-03-inline-density-live-preview.png` | Confirm → Inline + Take control + preview |
| `127-stage5-03-takeover-dock-preserved.png` | Takeover Hand-back dock preserved |

Live CDP: `cdp-probe-stage5-03-inline-density.mjs` → marker **`AP-STAGE5-03 inline-density 1792498676761`** EXIT=0 ws.closed

Board evidence: `business-control/evidence/2026-10-20-ap-stage5-03-inline-density-live-dev.txt`

## Tests

`bun test src/shell/an` + `./src/aporia/flows-util.test.ts` from `packages/app` — **150 pass / 0 fail**

## Preserved

- EnginePort path
- BF Takeover / control-lock honesty
- Three shell modes (`conversation` / `view` / `takeover`)
- STAGE5-01/02: no dual “Computer View” stream title; quietEntry + Team handoff residency

## Residuals

- Scope axis (tab group | window) still later Stage 5
- Gold boundary / bot cursor polish still later Stage 5
- Inline iframe preview is watch-only placeholder when feed is srcdoc (full panel in Computer View)
- Independent verifier not run

## Not claimed

- INDEPENDENT PASS
- Stage 5 complete
- merge / push / promote
