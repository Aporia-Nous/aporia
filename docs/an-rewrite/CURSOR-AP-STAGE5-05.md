# AP-STAGE5-05 — Pause + named controlling banner (Option C / handoff H)

| Field | Value |
|-------|-------|
| status | **OPEN implemented+live-DEV** — **not** INDEPENDENT PASS; **not** Stage 5 complete |
| decision | Option C continues (AP-STAGE5-MODES DONE) |
| branch | `stage4-an-shell` |
| worktree | `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4` |
| tip | `165a4b11a5` |
| base | STAGE5-04 tip `b90015847a` / docs `d7a3368c44` |
| merge/push/install | **No** |

## Option C / handoff H contract (this slice)

1. **Pause** pauses bot drive without granting user input (distinct from Takeover)
2. **Resume** restores bot drive; Resume does not end Takeover (Hand back / Stop)
3. Live Computer actions: **Take over / Pause|Resume** beside Disconnect
4. Banner uses **named** controller (`resolveComputerControllerBotName`: roster → agent slug → `Bot` last)
5. Takeover **Hand back / Stop** dock preserved; three modes + no wallpaper
6. **Native window capture / multi-tab CDP isolation** stay residual — not claimed

## What shipped

1. `pauseBot` / `resumeBot` + sync preserves Pause while bot holds lock
2. `resolveComputerControllerBotName` (roster name or title-cased `aporia-*` slug)
3. Scope / control banners: `{name} is controlling` / `{name} paused` / `You are controlling · Bot paused`
4. LiveComputerPanel drive toolbar + named cursor tag
5. Units + live CDP probe

## Evidence

| Shot | What |
|------|------|
| `132-stage5-05-conversation-idle-quiet.png` | Idle Conversation — no wallpaper |
| `133-stage5-05-named-banner-live.png` | Live View — named controlling banner + Pause / Take over |
| `134-stage5-05-pause-resume-banner.png` | After Pause — Resume + `{name} paused` banner |
| `135-stage5-05-takeover-handback-preserved.png` | Takeover Hand-back dock preserved |

Live CDP: `cdp-probe-stage5-05-pause-named-banner.mjs` → marker **`AP-STAGE5-05 pause-named-banner 1792499659831`** EXIT=0 ws.closed

Board evidence: `business-control/evidence/2026-10-20-ap-stage5-05-pause-named-banner-live-dev.txt`

## Tests

`bun test src/shell/an` + `./src/aporia/flows-util.test.ts` from `packages/app` — **159 pass / 0 fail**

## Preserved

- EnginePort path
- BF Takeover / control-lock honesty
- Three shell modes + STAGE5-01..04 Option C (scope/gold, densities, quiet entry)

## Residuals

- Native window-capture adapter / real multi-tab CDP isolation (gates exist; OS capture not claimed) → board **AP-STAGE5-06 OPEN**
- Independent verifier not run
- Auto-pause on user interaction with same target (handoff H) not wired

## Not claimed

- INDEPENDENT PASS
- Stage 5 complete
- Native window capture / full brief H DPI adapters
- merge / push / promote
