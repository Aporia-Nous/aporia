# AP-BF-01 — Browser-first Computer View consent/attach + honest computerLive

| Field | Value |
|-------|-------|
| status | **INDEPENDENT PASS** (consent/attach + honest `computerLive` scope) — **not** Stage 4 complete; page feed remains **AP-BF-02** |
| branch | `stage4-an-shell` |
| tip | `a6dd3ebbaa` |
| code | `997aaf54c0` |
| base | `13a31f0fbd` (after AP-STAGE4-4E tip sync; code base `af9ab9943a`) |
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

## Independent verification (2026-10-19)

- `bun test src/shell/an src/aporia/flows-util.test.ts` → **49 pass / 0 fail**
- Live CDP `cdp-probe-stage4-bf01-attach.mjs` (full path from disconnected) → RESULT `ok:true` (`liveOk` + `disconnectOk`; consenting→Confirm; backend `local-browser`; composerOwned+streamOwned); marker `AP-BF-01 attach 1792414911054`
- Non-regression: 4E Contraptions CDP RESULT `ok:true`; STAGE4-12 composer CDP RESULT `ok:true` marker `1792414928178` (timeline `none`; YOU turns)
- Shots: `26-bf01-computer-live-attach.png`, `27-bf01-computer-disconnected.png`
- Board evidence: `business-control/evidence/2026-10-19-ap-bf-01-independent-pass.txt`

## Honest residuals

- Page pixel feed into Computer View = **AP-BF-02** (not claimed).
- Control lock / Takeover semantics = **AP-BF-03**.
- User-launched external Edge/Chrome connector = **AP-BF-04**.
- Attach is AnShell consent gate for local browser workspace path; does not yet drive plugin-browser pane RPC open (reuse path remains).
- Not Stage 4 complete.

## Board

- `AP-BF-01` → **DONE** (INDEPENDENT PASS consent/attach scope)
- `AP-STAGE4-4E` remains DONE (INDEPENDENT PASS); non-regression re-verified
