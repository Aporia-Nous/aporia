# AP-STAGE4-4F — illustrated nav + honest Podman chrome

**Status:** OPEN implemented+live-DEV (writer) — **not** INDEPENDENT PASS; **not** Stage 4 complete  
**Tip (code):** `e14194835c` (`e14194835cad303bec25d050613c0696a033a2b8`)  
**Base:** `1604bd75e1` (NEW-TEAMMATE INDEPENDENT PASS code tip; docs head was `83ee33df03`)  
**Work date:** 2026-10-20  
**Worktree:** `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4`  
**Branch:** `stage4-an-shell`

## Scope

Design-direction / handoff polish: illustrated AN nav rail + understated Podman local-runtime chrome. Never fake Podman online. Never auto-install. Not Stage 7 runtime seam. Browser-first Computer View stays default.

## Implementation

- `nav-illustrated.ts` + `nav-icons.tsx` — fill+stroke illustrated icon set; `data-an-part="nav-illustrated"`
- `podman-chrome.ts` + `podman-card.tsx` — honest phases `checking|missing|present|probe-unavailable`; probe via `electron.aporia.which("podman")`
- Roster footer Podman card + mission pill (`Podman · not installed` / `installed` / `unknown`) — never Running / container counts
- Wire in `session-layout.tsx`; CSS ice-glass card; tokens/export markers
- Probe: `docs/an-rewrite/evidence/cdp-probe-stage4-4f.mjs`

## Live-DEV proof (writer)

- Tests: `bun test src/shell/an src/composer/session-draft.test.ts` — **145 pass / 0 fail**
- CDP `:9223` EXIT=0 marker `AP-STAGE4-4F 1792488117762`; ws closed
- `navIllustrated=true` (6 illustrated icons); `podmanPhase=missing` (honest on this host)
- `neverFakeOnline` / `neverAutoInstall` attrs true; mission pill `Podman · not installed`
- Composer ownership + EnginePort preserved
- Shot `117-stage4-4f-nav-podman.png`

## Not claimed

- INDEPENDENT PASS / self-PASS
- Stage 4 complete (Ali acceptance re-gate still required)
- Stage 7 Podman task-scoped runtime / measured idle-active
- Fake online / auto-install
- merge / push / install

## Residuals

- Stage 7 runtime seam deferred
- OS Podman install remains user action (refresh re-checks PATH only)
- Ali Stage 4 complete re-gate after independent review of 4F
