# AP-BF-03 — Browser-first Computer View control lock / Takeover

| Field | Value |
|-------|-------|
| status | **OPEN — implemented + live-DEV** (await independent PASS) — **not** Stage 4 complete; **not** self-labeled INDEPENDENT PASS |
| branch | `stage4-an-shell` |
| tip | *(docs tip commit after this report)* |
| code | `10cc4f0751` |
| base | `ec74cc7c4d` (AP-BF-02 tip; code `adb4ddb23c`) |
| worktree | `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4` |
| scope | Single control lock; Live View watch-only; Live Takeover = user input + bot paused; Hand back / Stop restore bot + fresh observation |
| merge/push/install | **No** |

## What shipped

1. `packages/core/src/mission/control.ts` — pure single-controller lock (`none` / `bot` / `user`).
2. AnShell `computer-control.ts` — mirrors core; syncs to Live + Conversation/View/Takeover.
3. Takeover while Live: `pointer-events: auto` on feed; bot paused; Bot cursor hidden; banner **You control**.
4. View / Hand back / Stop: watch-only feed (`pointer-events: none`); bot holds lock; `needsFreshObservation` after leaving user control.
5. Without Live: Takeover is layout-only — never grants user input (BF-01 honesty).
6. Disconnect clears attach + feed + control lock.
7. STAGE4-11/12 + 4E ownership markers unchanged (unit + live CDP).

## Files

- `packages/core/src/mission/control.ts` (+ test)
- `packages/app/src/shell/an/computer-control.ts` (+ test)
- `packages/app/src/shell/an/session-layout.tsx` / `an-shell.tsx` / `an-shell.css` / `types.ts` / `tokens.ts` / `cards/map.ts`
- `docs/an-rewrite/evidence/cdp-probe-stage4-bf03-control.mjs`

## Implementer verification (2026-10-19) — not independent PASS

- Pre-code light CDP BF-02 non-regress: RESULT `ok:true` marker `AP-BF-02 feed 1792415759505`
- `bun test src/shell/an src/aporia/flows-util.test.ts` → **64 pass / 0 fail**
- `bun test ./src/mission/control.test.ts` (core) → **6 pass / 0 fail**
- Live CDP `cdp-probe-stage4-bf03-control.mjs` → RESULT `ok:true` (`viewOk` + `takeoverOk` + `handbackOk` + `stopOk` + `disconnectOk` + `ownershipOk`); marker `AP-BF-03 control 1792416292479`
- Non-regression: 4E Contraptions CDP RESULT `ok:true`; STAGE4-12 composer CDP RESULT `ok:true` (timeline `none`; YOU turns)
- Shots: `31-bf03-live-view-watch-only.png`, `32-bf03-takeover-user-control.png`, `33-bf03-handback-bot-lock.png`, `34-bf03-stop-to-view.png`
- Board evidence: `business-control/evidence/2026-10-19-ap-bf-03-implemented-live-dev.txt`

## Honest residuals

- Independent review / PASS still required (board stays OPEN).
- Bot “drive” is lock state only — plugin-browser pane RPC / CDP capture pipeline not yet driven.
- Stage 5 three-vs-four modes call still OPEN — three-state presentation kept; do not silently pick four.
- User-launched external Edge/Chrome = **AP-BF-04**.
- Not Stage 4 complete. STAGE4-13 / CE-01 left alone.

## Board

- `AP-BF-03` → **OPEN** (implemented + live-DEV; await independent PASS)
- `AP-BF-01` / `AP-BF-02` remain DONE; non-regression re-verified
