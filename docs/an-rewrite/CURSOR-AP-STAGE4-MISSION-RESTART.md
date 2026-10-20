# AP-STAGE4-MISSION-RESTART — Mission A→B→A + quit/reopen draft/scroll

**Status:** OPEN implemented+live-DEV (not independent PASS; not Stage 4 complete)  
**Tip:** see HEAD after commit (board records tip); base `ed5c3db237`  
**Work date:** 2026-10-20  
**Worktree:** `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4`  
**Branch:** `stage4-an-shell`

## Scope

Build-list Stage 4 acceptance B / handoff example B: draft + scroll survive Mission/teammate A→B→A and a restart. B1 already proved in-session draft switch; this slice adds durable AnShell maps + live CDP reload proof.

## Implementation

- `session-draft-store.ts` — mirror identity drafts to `localStorage` key `an.shell.drafts.v1`
- `session-scroll-store.ts` — per-identity conversation `scrollTop` at `an.shell.scroll.v1`; save(0) does not clobber mid-scroll
- `conversation-stream.tsx` — restore/save scroll; pin-to-bottom only when streaming / no saved scroll
- `session-layout.tsx` — install `__anScroll` probe; save scroll only when leaving a teammate
- Probe: `docs/an-rewrite/evidence/cdp-probe-stage4-mission-restart.mjs`

## Live-DEV proof

- CDP `:9223` EXIT=0 marker `AP-STAGE4-MISSION-RESTART 1792486714283`; ws closed
- A→B→A: draft + scrollTop 480 Map+DOM (Grok↔Aporetic Dev)
- `Page.reload`: draft DOM+Map restored; scroll **map** durable at 480; DOM mid-scroll after reload may still lose to pin/clamp without CDP pad (residual OK)
- Restart kind: renderer quit/reopen via `Page.reload` (Electron process kept for CDP continuity)

## Tests

`bun test src/shell/an src/composer/session-draft.test.ts` — see tip commit message for pass count.

## Not claimed

- Independent PASS / self-PASS
- Stage 4 complete
- Full Electron process kill+relaunch (renderer reload used)
- Selected-artifact survival (out of this slice)
- New teammate lifecycle / AP-STAGE4-4F
- merge / push / install
