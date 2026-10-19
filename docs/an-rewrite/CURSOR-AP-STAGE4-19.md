# AP-STAGE4-19 — Presence personality + fuller Documents + Settings AN

| Field | Value |
|-------|-------|
| status | **OPEN implemented+live-DEV** — **not** INDEPENDENT PASS; **not** Stage 4 complete |
| branch | `stage4-an-shell` |
| tip | `5c42714fb6` |
| code | `5c42714fb6` |
| base | `a9b68f07e4` (AP-STAGE4-18 INDEPENDENT PASS tip) |
| worktree | `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4` |
| scope | (1) Presence character / micro-spring personality (2) Fuller Documents viewer (3) Settings AN ice-glass (Ali add-on) |
| merge/push/install | **No** |
| independent verify | Pending — do not self-PASS |

## Intent (Ali)

1. Residuals vs Grok bar after STAGE4-18 PASS — presence character / micro-spring personality within AN ice-glass (not a Grok copy).
2. Fuller Documents viewer in Review — beyond markdown-ish; MD + common doc path; Office free-path if feasible.
3. **Add-on:** Settings UI still OpenCode — skin/replace to AN ice-glass AnShell (same ownership bar as composer STAGE4-13).

## What shipped

### Presence personality
- `AN_PRESENCE_PERSONALITY` + `AN_MOTION_SURFACE` → `AP-STAGE4-19` with micro-spring motions.
- Roster companion aura on selected teammate; per-state presence spring animations (breathe / think / speak / work / wait).
- Markers: `data-presence-personality="stage4-19"`, `data-personality="micro-spring"`, `data-an-part="an-roster-companion-aura"`.

### Fuller Documents
- `documentPreviewHtml` — fences, tables, blockquotes, ordered lists, links, CSV tables.
- Free-path `.docx` OOXML text extract (`docx-text.ts`, no paid deps).
- Honest residuals for xlsx/pptx/legacy Office.
- Markers: `data-docs="stage4-19"`, `data-fuller="stage4-19"`.

### Settings AN ice-glass
- `AN_SETTINGS_SURFACE` + `settings-chrome.ts` + `settings-an.css`.
- Settings screen gets `data-an-owned="settings"` + `data-an-theme="an"` when AnShell enabled.
- Sticky `an` theme while Settings open; About shows Aporetic mark (hides OC wordmark).
- Composer ownership bar preserved (STAGE4-12/13).

## Writer verification (2026-10-19)

- `bun test src/shell/an src/aporia/flows-util.test.ts` → **115 pass / 0 fail**
- `bun test ../core/src/mission/control.test.ts` → **6 pass / 0 fail**
- Live CDP `cdp-probe-stage4-19-presence-docs-settings.mjs` (`APORETIC_CDP_PORT=9223`) → RESULT `ok:true` **EXIT=0** marker `AP-STAGE4-19 presence-docs-settings 1792425160597`
  - `presenceOk`: personality stage4-19, micro-spring dots, companion aura, 13 Listening / 0 Unknown
  - `docsOk`: fuller MD table+pre+bq from fixture
  - `settingsOk`: owned=settings, theme=an, blur ice, OC wordmark hidden
- Shots: `68`–`71` under `docs/an-rewrite/evidence/screenshots-2026-10-18/`
- Probe closes WebSocket + `process.exit` (STAGE4-18 hang fix retained)

## Honest residuals

- xlsx/pptx grids/slides not rendered (honest residual; no paid Office SDK).
- Settings is skinned OC Settings (ownership + ice chrome), not a ground-up AnShell Settings rewrite.
- About legal/anomaly assets still present at reduced opacity (upstream credits).
- Non-regress shell remount after Settings nav can flake in CDP back-nav (presence/docs/settings gates still ok).
- BF-01…06 + STAGE4-11…18 preserved.
- **Not** Stage 4 complete. No merge/push. **Not** self-PASS.

## Board

- `AP-STAGE4-19` → **OPEN** implemented+live-DEV
