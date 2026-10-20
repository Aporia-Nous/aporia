# AP-ENGINE-PORT-02 — AN Settings via EnginePort (drop OC Settings React)

| Field | Value |
|-------|-------|
| status | **OPEN implemented+live-DEV** (NOT INDEPENDENT PASS; NOT self-PASS; **not** Stage 4 complete) |
| branch | `stage4-an-shell` |
| tip | *(set after commit)* |
| code | *(set after commit)* |
| base | `4c42d1d289` (efficiency top-10 DONE / E13 tip) |
| worktree | `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4` |
| scope | AN Settings host; EnginePort providers/models/BYOK; drop OC Settings React on AnShell path |
| merge/push/install | **No** |

## Intent (Ali “back to work”)

Stop skinning OC Settings as endgame. AnShell Settings = Aporetic by Aporia Nous chrome; OpenCode only tiny fine print; providers/models/BYOK via EnginePort.

## What shipped

### EnginePort PORT-02 surface
- `listProviders` / `listModels` / `syncCatalog` / `connectByok` on `EnginePort`
- `OcServerEnginePort` delegates to `data.location.provider|model` + optional `connectKey` → OC `integration.connect.key`
- Session create/list/status/prompt/messages preserved (PORT-01)

### AN Settings host (no OC Settings React import)
- `packages/app/src/shell/an/settings-panel.tsx` — in-shell panel (like Contraptions)
- About: Aporetic + by Aporia Nous; OpenCode fine print only
- Providers list + BYOK form; Models list — all via `useEnginePort()`
- Markers: `data-an-part=settings` `data-an-owned=settings` `data-an-engine-port=02`
- AnShell nav + Ctrl+, open panel (does **not** navigate to `/settings` OC route)
- Classic `/settings` `SettingsScreen` remains for non-AnShell only

### Preserved
- EnginePort send/stream (PORT-01)
- STAGE4/BF Computer View / Contraptions / composer ownership

## Writer verification (2026-10-19)

- `bun test src/shell/an` → **117 pass / 0 fail** (+2 PORT-02 engine tests)
- Live CDP `cdp-probe-engine-port-02.mjs` (`APORETIC_CDP_PORT=9223`) → RESULT `ok:true` **EXIT=0** marker `AP-ENGINE-PORT-02 settings 1792458661458`
  - settingsOk: owned=settings; theme=an; enginePort=02; no OC settings-screen; mark=Aporetic by Aporia Nous; fineprint OpenCode; providers+BYOK+models
  - composerOk: owned=composer; timeline none; Message Grok…
  - contraptionsOk: 4E open
- Shots: `75`–`77` under `docs/an-rewrite/evidence/screenshots-2026-10-18/`
- Probe closes WebSocket + `process.exit`

## Honest residuals

- Classic `/settings` OC React route still exists (non-AnShell / deep link)
- BYOK OAuth / Console connect flows not reimplemented in AN panel (API-key path via port)
- Models list capped at 80 rows in UI (honest “showing first N”)
- Dual sync/poll shrink still PORT-03
- **Not** claimed: INDEPENDENT PASS; OpenCode replaced; Stage 4 complete; agent loop rewrite
- No merge/push/install/prod DB

## Board

- `AP-ENGINE-PORT-02` → **OPEN implemented+live-DEV** (await independent verifier or Ali)
- Next after: audit second-pass **or** Ali says
