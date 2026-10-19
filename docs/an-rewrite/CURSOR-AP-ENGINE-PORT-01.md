# AP-ENGINE-PORT-01 — EnginePort adapter (send/stream via OC-backed port)

| Field | Value |
|-------|-------|
| status | **OPEN — implemented + live-DEV** (writer verified; **not** INDEPENDENT PASS; **not** Stage 4 complete) |
| branch | `stage4-an-shell` |
| tip | `da612fe6fb` |
| code | `da612fe6fb` |
| base | `d71979708d` (AP-STAGE4-19 INDEPENDENT PASS tip) |
| worktree | `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4` |
| scope | EnginePort interface + OcServerEnginePort; AnShell send/stream via port; Settings → PORT-02 (no skin expand) |
| merge/push/install | **No** |

## Intent (Ali “okay lets do that”)

Kill wrap tax: AnShell product UI talks a thin `EnginePort`; OC server/core SessionRunner/providers/tools/DB stay behind `OcServerEnginePort`. No overnight agent-loop rewrite.

## What shipped

### EnginePort + OcServerEnginePort
- `packages/app/src/shell/an/engine/` — `EnginePort` (prompt, listMessages, listSessions, createSession, sessionStatus, listPermissions, optional subscribe).
- `createOcServerEnginePort(data)` delegates to existing `data.session.*` — **no new agent loop**.

### AnShell routing
- `session-layout.tsx`: `EnginePortProvider`; stream/cards/review messages via `engine.listMessages`; roster/openMember via list/create/status/permissions on port.
- Markers: `data-an-engine="oc-server"` `data-an-engine-port="01"`.
- Composer adapter + queue: under AnShell, `engine.prompt` (fallback raw `data.session.prompt` outside provider).
- OC timeline/composer product UI remain hidden under AnShell (not re-enabled).

### Settings decision
- Full OC Settings React replace exceeds slice hours → **AP-ENGINE-PORT-02** boarded.
- Stop expanding `settings-an.css` / skin wrap; PORT-02 comments on `settings/shell.tsx` + `settings-chrome.ts`.

## Writer verification (2026-10-19)

- `bun test src/shell/an` → **115 pass / 0 fail** (incl. 4 OcServerEnginePort unit tests)
- Live CDP `cdp-probe-engine-port-01.mjs` (`APORETIC_CDP_PORT=9223`) → RESULT `ok:true` **EXIT=0** marker `AP-ENGINE-PORT-01 send 1792427538659`
  - engine=`oc-server`; send → YOU turn visible; `data-an-owned=composer`; timeline `display:none`
  - STAGE4-13 light: `Message Grok…`; 4E Contraptions open
- Shots: `72`–`74` under `docs/an-rewrite/evidence/screenshots-2026-10-18/`
- Probe closes WebSocket + `process.exit`

## Honest residuals

- Settings still skinned OC React (PORT-02) — not AN-native rewrite.
- Dual sync/poll shrink deferred (PORT-03).
- Queue/composer outside AnShell still use raw `data.session.prompt` (classic layout).
- **Not** claimed: OpenCode replaced; agent loop rewritten; Stage 4 complete; INDEPENDENT PASS.
- No merge/push/install/prod DB.

## Board

- `AP-ENGINE-PORT-01` → **OPEN** implemented + live-DEV (await independent verify — do **not** self-PASS)
- `AP-ENGINE-PORT-02` → OPEN (AN Settings via port; drop OC Settings React import)
