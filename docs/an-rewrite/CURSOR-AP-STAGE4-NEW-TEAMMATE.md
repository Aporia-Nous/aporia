# AP-STAGE4-NEW-TEAMMATE — create/import/edit/cancel/archive lifecycle

**Status:** OPEN implemented+live-DEV (not independent PASS; not Stage 4 complete)  
**Base:** `0dbd710e1e` (MISSION-RESTART INDEPENDENT PASS)  
**Work date:** 2026-10-20  
**Worktree:** `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4`  
**Branch:** `stage4-an-shell`

## Scope

Handoff bot lifecycle example + build-list Stage 4 New teammate flow: create, import (invalid/duplicate detection), edit, cancel (no half-bot), archive (soft retire preserves memory/backup).

## Implementation

- `packages/app/src/shell/an/teammate/lifecycle.ts` — pure validate/import/archive helpers
- `packages/app/src/shell/an/teammate/sheet.tsx` — AN ice-glass sheet + roster footer/menu + `__anTeammate` CDP probe
- `session-layout.tsx` — wire create/import/edit/archive; Team card Configure/New teammate
- `an-shell.tsx` — roster context menu hook
- Probe: `docs/an-rewrite/evidence/cdp-probe-stage4-new-teammate.mjs`

## Live-DEV proof

- CDP `:9223` EXIT=0 marker `AP-STAGE4-NEW-TEAMMATE 1792487408885`; ws closed
- Cancel after fill → no roster slug
- Create → roster member; Edit role preserved; Archive → gone
- Import duplicate of Grok → note + suggested `Grok 2` (cancel — no write)
- Shots `115` / `116`

## Tests

`bun test src/shell/an src/composer/session-draft.test.ts` — **136 pass / 0 fail**

## Not claimed

- Independent PASS / self-PASS
- Stage 4 complete (4F + Ali gate remain)
- OS file-dialog import path exercised live (file input + fixture JSON via probe covered; OS dialog residual OK)
- Paid preview / DeepSeek draft in AN sheet (advanced note honest)
- Pending mission auto-reassign on archive (honesty copy only)
- merge / push / install
- AP-STAGE4-4F untouched
