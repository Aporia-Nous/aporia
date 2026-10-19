# AP-BF-01 — Browser-first Computer View consent/attach + honest computerLive

| Field | Value |
|-------|-------|
| status | **OPEN for independent review** — implemented + live-DEV verified (executor); **not** Stage 4 complete; **not** INDEPENDENT PASS until verifier |
| branch | `stage4-an-shell` |
| tip | *(set after commit)* |
| code | *(set after commit)* |
| base | `3c42a81c0e` (AP-STAGE4-4E tip docs) / code base `af9ab9943a` |
| worktree | `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4` |
| scope | Consent → attach local browser workspace; `computerLive` true only when attached; labeled cursor overlay; disconnect clears Live; browser-first not VM |
| merge/push/install | **No** |

## What shipped

1. `computer-attach.ts` state machine: disconnected → consenting → attached; backend `local-browser` only.
2. AnShell Computer View: Connect / Confirm / Disconnect; Live badge only when consented+attached.
3. Labeled **Bot cursor** overlay when Live (UI affordance only — not painted into agent captures; page pixels = BF-02).
4. Session rescope clears Live; home/draft cannot attach without a session.
5. STAGE4-11 stream + STAGE4-12 composer ownership markers unchanged (unit + live CDP).

## Files

- `packages/app/src/shell/an/computer-attach.ts` (+ test)
- `packages/app/src/shell/an/session-layout.tsx` — wire attach → `computerLive`
- `packages/app/src/shell/an/an-shell.tsx` / `an-shell.css` — panel actions + cursor
- `packages/app/src/shell/an/tokens.ts` / `types.ts` / `index.ts` / `cards/map.ts`

## Checks

- `bun test src/shell/an src/aporia/flows-util.test.ts` → **49 pass / 0 fail** (expected after commit)
- Live CDP `cdp-probe-stage4-bf01-attach.mjs` → RESULT `ok:true` (`liveOk` + `disconnectOk`; composerOwned+streamOwned)
- Shots: `26-bf01-computer-live-attach.png`, `27-bf01-computer-disconnected.png`
- Board copies: `business-control/evidence/2026-10-19-26-…` / `27-…`

## Honest residuals

- Page pixel feed into Computer View = **AP-BF-02** (not claimed).
- Control lock / Takeover semantics = **AP-BF-03**.
- User-launched external Edge/Chrome connector = **AP-BF-04**.
- Attach is AnShell consent gate for local browser workspace path; does not yet drive plugin-browser pane RPC open (reuse path remains).
- Not Stage 4 complete.

## Board

- `AP-BF-01` → OPEN (implemented + live-DEV verified; await independent PASS)
- `AP-STAGE4-4E` unchanged (still await independent PASS)
