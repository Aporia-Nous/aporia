# AP-BF-02 — Browser-first Computer View live page feed + labeled cursor

| Field | Value |
|-------|-------|
| status | **INDEPENDENT PASS** (page feed into Computer View scope) — **not** Stage 4 complete; control lock remains **AP-BF-03** |
| branch | `stage4-an-shell` |
| tip | _(tip-sync after code)_ |
| code | _(filled after code commit)_ |
| base | `a6dd3ebbaa` (AP-BF-01 tip; code `997aaf54c0`) |
| worktree | `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4` |
| scope | Watch-only page feed when Live; labeled Bot cursor overlay outside captures; consent/attach honesty preserved |
| merge/push/install | **No** |

## What shipped

1. `computer-feed.ts` state: cleared ↔ open; opens only when BF-01 `isComputerLive`; clears on disconnect/rescope.
2. Real page surface in Computer View: workspace `srcdoc` at `about:blank`, then http(s) via watch-only iframe (`pointer-events: none`).
3. Address chrome (Go) for navigate — not page input grant; Bot cursor remains UI overlay (`data-cursor-in-capture="false"`).
4. URL policy: `about:blank` + http(s) without credentials; reject `file:` / credentialed URLs.
5. STAGE4-11 stream + STAGE4-12 composer + 4E Contraptions ownership markers unchanged (unit + live CDP).

## Files

- `packages/app/src/shell/an/computer-feed.ts` (+ test)
- `packages/app/src/shell/an/session-layout.tsx` — sync feed ↔ attach
- `packages/app/src/shell/an/an-shell.tsx` / `an-shell.css` — feed iframe + bar
- `packages/app/src/shell/an/tokens.ts` / `types.ts` / `index.ts` / `cards/map.ts`
- `docs/an-rewrite/evidence/cdp-probe-stage4-bf02-feed.mjs`

## Independent verification (2026-10-19)

- `bun test src/shell/an src/aporia/flows-util.test.ts` → **58 pass / 0 fail**
- Live CDP `cdp-probe-stage4-bf02-feed.mjs` → RESULT `ok:true` (`feedOk` + `navOk` + `disconnectOk` + `ownershipOk`); marker `AP-BF-02 feed 1792415373997`
- Non-regression: 4E Contraptions CDP RESULT `ok:true`; STAGE4-12 composer CDP RESULT `ok:true` marker `1792415382497` (timeline `none`; YOU turns)
- Shots: `28-bf02-computer-feed-live.png`, `29-bf02-computer-feed-example.png`, `30-bf02-computer-feed-disconnected.png`
- Board evidence: `business-control/evidence/2026-10-19-ap-bf-02-independent-pass.txt`

## Honest residuals

- Control lock / Takeover semantics = **AP-BF-03**.
- User-launched external Edge/Chrome connector = **AP-BF-04**.
- Feed is AnShell watch-only iframe (local-browser path); does not yet drive plugin-browser pane RPC / CDP capture pipeline (reuse path remains).
- Not Stage 4 complete.

## Board

- `AP-BF-02` → **DONE** (INDEPENDENT PASS page-feed scope)
- `AP-BF-01` remains DONE; non-regression re-verified via Live + Disconnect path
