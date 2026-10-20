# AP-STAGE5-06 — Multi-tab CDP isolation + native capture BLOCKED (Option C residual)

| Field | Value |
|-------|-------|
| status | **OPEN implemented+live-DEV** — **not** INDEPENDENT PASS; **not** Stage 5 complete |
| decision | Option C continues (AP-STAGE5-MODES DONE) |
| branch | `stage4-an-shell` |
| worktree | `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4` |
| tip | `cd10464dac` (docs head `a3c13460e5`) |
| base | STAGE5-05 tip `165a4b11a5` / docs `a1c90f5a5b` |
| merge/push/install | **No** |

## Option C / handoff H contract (this slice)

1. **Multi-tab CDP isolation** — tab-group allowlist gates screencast start, navigate, retarget; unauthorized tabs rejected without silent widen
2. **Native OS window capture** — **BLOCKED** (no Electron `desktopCapturer` / `getDisplayMedia` window adapter / HWND+DPI remapper in isolated DEV). Window-scope authorize gates exist; OS pixels are **not** claimed
3. Capability flags: `browserTabGroupIsolation=true`; `nativeWindowCapture=false` / status `BLOCKED`
4. **Auto-pause** on user feed Go while bot may drive (STAGE5-05 residual) — does not grant Takeover input
5. Conversation / Computer View / Takeover + electric-gold scope axis preserved; EnginePort + BF honesty preserved

## What shipped

1. `computer-cdp-isolation.ts` — authorize/filter/resolve/refuse-widen + native attempt refusal + auto-pause helpers + `__anCdpIsolation` probe
2. Session layout — screencast/navigate gated by allowlist; feed Go auto-pauses bot drive
3. LiveComputerPanel — `data-cdp-isolation` / `data-native-capture=blocked` + isolation note
4. Units + live CDP probe

## BLOCKED (honest)

| Item | Evidence |
|------|----------|
| Native OS window capture | `attemptNativeWindowCapture()` always `{ ok:false, status:"BLOCKED" }`; no `desktopCapturer` / window picker in worktree; window-scope CDP path returns `native-blocked` |
| External-browser OS pointer auto-pause | Not wired (no CDP Input / focus listener). Feed-Go auto-pause only |

## Evidence

| Shot | What |
|------|------|
| `136-stage5-06-conversation-idle-quiet.png` | Idle Conversation — no wallpaper; native-capture=blocked attr |
| `137-stage5-06-isolation-live-local.png` | Live local-workspace + isolation note + gold boundary |
| `138-stage5-06-auto-pause-feed-go.png` | Feed Go → botPaused + named paused banner |
| `139-stage5-06-takeover-handback-preserved.png` | Takeover Hand-back dock preserved |

Live CDP: `cdp-probe-stage5-06-cdp-isolation.mjs` → marker **`AP-STAGE5-06 cdp-isolation 1792500355850`** EXIT=0 ws.closed

Board evidence: `business-control/evidence/2026-10-20-ap-stage5-06-cdp-isolation-live-dev.txt`

## Tests

`bun test src/shell/an` + `./src/aporia/flows-util.test.ts` from `packages/app` — **166 pass / 0 fail**

## Preserved

- EnginePort path
- BF Takeover / control-lock honesty
- Three shell modes + STAGE5-01..05 Option C (scope/gold, Pause/named banner, densities, quiet entry)

## Residuals

- Native window-capture adapter when platform/permissions authorize a real adapter (separate task; do not fake)
- External-browser user-interaction auto-pause (OS/CDP Input) still OPEN
- Independent verifier not run
- Full brief H DPI/move/resize remapping for native windows

## Not claimed

- INDEPENDENT PASS
- Stage 5 complete
- Native OS window capture / full-desktop pixels
- merge / push / promote
