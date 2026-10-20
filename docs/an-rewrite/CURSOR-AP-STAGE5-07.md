# AP-STAGE5-07 — OS-pointer / CDP focus auto-pause (Option C residual)

| Field | Value |
|-------|-------|
| status | **OPEN implemented+live-DEV** — **not** INDEPENDENT PASS; **not** Stage 5 complete |
| decision | Option C continues (AP-STAGE5-MODES DONE) |
| branch | `stage4-an-shell` |
| worktree | `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4` |
| tip | `cf8c9ac361` |
| base | STAGE5-06 tip `cd10464dac` / docs `55353f1297` |
| merge/push/install | **No** |

## Option C / handoff H contract (this slice)

1. **Computer View chrome** — pointer on Live feed surface / focus on feed URL while bot may drive → auto-pause (no Takeover input)
2. **External CDP page** — focus-gain always; pointer/key only when Aporetic window is blurred (avoids bot-tool false pause while watching)
3. Feed Go auto-pause (STAGE5-06) retained
4. **Native OS window capture** stays **BLOCKED** (not faked)
5. Global OS pointer hook without page/chrome signal = **UNSUPPORTED** (honest)
6. Conversation / Computer View / Takeover + EnginePort + BF honesty preserved

## What shipped

1. `computer-os-pointer-pause.ts` — surface + gates + inject/poll JS + `__anOsPointerPause` probe
2. Relay `GET /__an/computer-cdp/user-interaction` — Runtime.evaluate install+poll on consented region
3. Screencast relay session polls interaction while Live external
4. LiveComputerPanel chrome pointer/focus → session-layout auto-pause
5. Units + live CDP probe

## BLOCKED / UNSUPPORTED (honest)

| Item | Evidence |
|------|----------|
| Native OS window capture | Still `attemptNativeWindowCapture` → BLOCKED (STAGE5-06); missing desktopCapturer not a fail |
| Global OS pointer hook | `globalOsPointerHook=false` / UNSUPPORTED — no system-wide hook outside consented CDP page / Aporetic chrome |

## Evidence

| Shot | What |
|------|------|
| `140-stage5-07-conversation-idle-quiet.png` | Idle Conversation — no wallpaper; native-capture=blocked |
| `141-stage5-07-live-os-pointer-on.png` | Live View — `data-os-pointer-pause=on` |
| `142-stage5-07-chrome-pointer-auto-pause.png` | Feed surface pointer → botPaused + named paused banner |
| `143-stage5-07-chrome-focus-auto-pause.png` | After Resume, feed URL focus → botPaused again |
| `144-stage5-07-takeover-handback-preserved.png` | Takeover Hand-back dock preserved |

Live CDP: `cdp-probe-stage5-07-os-pointer-pause.mjs` → marker **`AP-STAGE5-07 os-pointer-pause 1792500955687`** EXIT=0 ws.closed

Board evidence: `business-control/evidence/2026-10-20-ap-stage5-07-os-pointer-pause-live-dev.txt`

## Tests

`bun test src/shell/an` + `./src/aporia/flows-util.test.ts` from `packages/app` — **170 pass / 0 fail**

## Preserved

- EnginePort path
- BF Takeover / control-lock honesty
- Three shell modes + STAGE5-01..06 Option C (CDP isolation, Pause/named, scope/gold, densities, quiet entry)
- Native capture BLOCKED honesty

## Residuals

- Real native window-capture adapter (desktopCapturer / getDisplayMedia / HWND+DPI) — stays BLOCKED until platform adapter
- Independent verifier not run
- Stage 5 Option C acceptance / Stage 5 complete
- Full brief H DPI remapper for native windows

## Not claimed

- INDEPENDENT PASS
- Stage 5 complete
- Native OS window capture / full-desktop pixels
- Global OS pointer interception
- merge / push / promote
