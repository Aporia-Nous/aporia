# AP-BF-05 — Live CDP page pixels into Computer View

| Field | Value |
|-------|-------|
| status | **OPEN — implemented + live-DEV verified** (screencast / page-pixel scope) — **not** INDEPENDENT PASS; **not** Stage 4 complete |
| branch | `stage4-an-shell` |
| tip | *(set after docs sync)* |
| code | *(set after code commit)* |
| base | `bf6e89c418` (AP-STAGE4-16 tip; ice punch — do not rework) |
| worktree | `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4` |
| scope | Real CDP page pixels in Computer View for consented Edge/Chrome; local-browser keeps iframe pixels; honesty preserved |
| merge/push/install | **No** |

## Intent (Ali re-scope)

Closes BF-04 residual **“no screencast to Edge/Chrome pixels yet.”**  
Former plan slot “VM/Podman isolation” remains deferred (Stage 7 / 4F) — **not** this slice.

## What shipped

1. `computer-screencast.ts` — phase machine; `computerLive` still from BF-01 attach only; pixels only when a real frame arrives (`cdp-screencast`).
2. `computer-screencast-cdp.ts` — resolve loopback region; try `Page.startScreencast` WebSocket; **Electron fallback**: poll loopback HTTP relay (`Page.captureScreenshot` JPEG).
3. `computer-screencast-relay.ts` + `vite.computer-cdp.mjs` + `scripts/computer-cdp-relay-server.mjs` — loopback-only relay (`127.0.0.1:5199` default for electron-vite DEV).
4. AnShell Computer View shows `<img data-an-part="computer-screencast-frame">` when streaming; placeholder srcdoc while connecting (not a fake Live screenshot).
5. Local-browser Live still uses iframe page pixels (`data-pixel-source="iframe"`).
6. BF-01 consent, BF-02 feed, BF-03 Takeover, BF-04 external region path preserved (unit + live).

## Files

- `packages/app/src/shell/an/computer-screencast.ts` (+ test)
- `packages/app/src/shell/an/computer-screencast-cdp.ts`
- `packages/app/src/shell/an/computer-screencast-relay.ts`
- `packages/app/src/shell/an/computer-feed.ts` / `computer-attach.ts` / `an-shell.tsx` / `an-shell.css` / `session-layout.tsx` / `types.ts` / `tokens.ts` / `index.ts`
- `packages/app/vite.computer-cdp.mjs` / `vite.js` / `scripts/computer-cdp-relay-server.mjs`
- `docs/an-rewrite/evidence/cdp-probe-stage4-bf05-screencast.mjs`

## Writer verification (2026-10-19) — not independent PASS

- `bun test src/shell/an src/aporia/flows-util.test.ts` → **95 pass / 0 fail**
- `bun test ../core/src/mission/control.test.ts` → **6 pass / 0 fail**
- Standalone relay `http://127.0.0.1:5199` + user-launched Edge `--remote-debugging-port=9333`
- Live CDP `cdp-probe-stage4-bf05-screencast.mjs` → RESULT `ok:true` (`screencastOk` + `takeoverOk` + `disconnectOk` + `localOk`); marker `AP-BF-05 screencast 1792421286447`
- Shots: `56-bf05-external-consent.png`, `57-bf05-screencast-live.png`, `58-bf05-screencast-takeover.png`, `59-bf05-screencast-disconnected.png`
- Ice / STAGE4-16 tip `bf6e89c418` left alone (no ice rework)

## Honest residuals

- Electron renderer cannot open CDP WebSocket; pixels use loopback HTTP relay (`captureScreenshot` poll). True `Page.startScreencast` WS path remains for hosts that allow it.
- Relay must be running for electron-vite DEV (`bun scripts/computer-cdp-relay-server.mjs`) unless Vite hosts the plugin.
- Production/desktop-packaged relay ownership still OPEN (Vite plugin covers Vite-hosted DEV).
- VM/Podman isolation = deferred (not this BF-05). CE-01 / 4F left alone.
- Stage 5 three-vs-four modes still OPEN. **Not** Stage 4 complete. No merge/push.

## Board

- `AP-BF-05` → **OPEN** (implemented + live-DEV) — do **not** self-label INDEPENDENT PASS
- `AP-BF-01`…`04` remain DONE; non-regression via unit + this live path
