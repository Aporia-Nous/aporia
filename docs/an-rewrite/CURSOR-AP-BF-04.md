# AP-BF-04 — External Edge/Chrome consented region path

| Field | Value |
|-------|-------|
| status | **INDEPENDENT PASS** (external Edge/Chrome consented region scope) — **not** Stage 4 complete |
| branch | `stage4-an-shell` |
| tip | `a8437782b3` (docs sync; code `71d24596b4`) |
| code | `71d24596b4` |
| base | `919dc1995e` (AP-BF-03 tip; code `10cc4f0751`) |
| worktree | `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4` |
| scope | Consented attach to user’s own Edge/Chrome region on loopback; preserve BF-01 honesty, BF-02 feed, BF-03 Takeover lock |
| merge/push/install | **No** |

## What shipped

1. `computer-external.ts` — loopback-only endpoint normalize + region id + optional `/json/version` Check (no non-loopback, no credentials).
2. `computer-attach.ts` — path select `local-browser` \| `external-chromium`; external Live requires consented endpoint + region.
3. AnShell consent UI: Local workspace vs My Edge/Chrome; family / endpoint / region fields; Check endpoint.
4. BF-02 feed srcdoc for external region (honest workspace start; CDP screencast residual).
5. BF-03 Takeover lock works on external Live (unit + live CDP).
6. STAGE4-11/12 + 4E ownership markers unchanged (unit + live CDP).

## Files

- `packages/app/src/shell/an/computer-external.ts` (+ test)
- `packages/app/src/shell/an/computer-attach.ts` (+ test)
- `packages/app/src/shell/an/computer-feed.ts` (+ test)
- `packages/app/src/shell/an/computer-control.test.ts`
- `packages/app/src/shell/an/an-shell.tsx` / `an-shell.css` / `session-layout.tsx` / `types.ts` / `tokens.ts` / `index.ts`
- `docs/an-rewrite/evidence/cdp-probe-stage4-bf04-external.mjs`

## Independent verification (2026-10-19)

- HEAD tip `a8437782b3` matches claim; code `71d24596b4` ancestor; base `919dc1995e` ancestor
- `bun test src/shell/an src/aporia/flows-util.test.ts` → **74 pass / 0 fail**
- `bun test ./src/mission/control.test.ts` (core) → **6 pass / 0 fail**
- Live CDP `cdp-probe-stage4-bf04-external.mjs` → RESULT `ok:true` (`externalOk` + `takeoverOk` + `disconnectOk` + `localOk` + `ownershipOk`); marker `AP-BF-04 external 1792417252470`
- Non-regression: BF-01 CDP `ok:true` marker `1792417262649`; BF-02 CDP `ok:true` marker `1792417265642`; BF-03 CDP `ok:true` marker `1792417275854`; 4E Contraptions CDP `ok:true` (re-run after known panel flake); STAGE4-12 composer CDP `ok:true` marker `1792417290185`
- Shots: `35-bf04-external-consent.png`, `36-bf04-external-live.png`, `37-bf04-external-takeover.png`, `38-bf04-external-disconnected.png`
- Board evidence: `business-control/evidence/2026-10-19-ap-bf-04-independent-pass.txt`

## Honest residuals

- Attach registers consented loopback region — does **not** yet open a live CDP screencast / plugin-browser RPC session to Edge/Chrome pixels.
- Check endpoint probes only loopback `/json/version` after user intent; Confirm still shape-validates without requiring a live second browser.
- Toast stack can accumulate across CDP runs (known; attrs authoritative).
- Stage 5 three-vs-four modes call still OPEN.
- VM/Podman = **AP-BF-05** (deferred). Not Stage 4 complete. STAGE4-13 / CE-01 left alone.

## Board

- `AP-BF-04` → **DONE** (INDEPENDENT PASS)
- `AP-BF-01` / `AP-BF-02` / `AP-BF-03` remain DONE; non-regression re-verified
