# Screenshot evidence — 2026-10-18 (America/Chicago)

Authorization: Ali “get your screen shots cuz design isnt quite right” (plus prior running-DEV auth).

## DEV status
- Worktree: `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4`
- Window: Aporetic (electron MainWindowTitle=Aporetic; PrintWindow PID 59784)
- Renderer URL: `http://localhost:5173/` responds 200, but bare browser/`#root` stays empty — AnShell only paints inside Electron
- Isolated DB: assumed opencode-aporia-dev (not inspected / no secrets)

## Captured files (absolute)
- `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4\docs\an-rewrite\evidence\screenshots-2026-10-18\00-desktop-with-aporetic.png` — earlier full desktop with Aporetic visible
- `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4\docs\an-rewrite\evidence\screenshots-2026-10-18\01-conversation-default.png` — earlier full Aporetic window
- `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4\docs\an-rewrite\evidence\screenshots-2026-10-18\02-aporetic-printwindow.png` — **fresh** full Aporetic window via `PrintWindow` (no focus / no SetForegroundWindow)
- `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4\docs\an-rewrite\evidence\screenshots-2026-10-18\03-desktop-full-canvas.webp` — computer-use primary canvas (Aporetic occluded by Cursor)
- `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4\docs\an-rewrite\evidence\screenshots-2026-10-18\04-primary-screen-blit.png` — primary-screen blit without focus (Aporetic occluded)
- `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4\docs\an-rewrite\evidence\screenshots-2026-10-18\05-composer-an-tokens-after.png` — **AP-STAGE4-03 after** PrintWindow (Electron PID 59784); composer center sampled `#020509` (before `01-…` was `#121B39`)
- `…/06-conversation-glass-rail.png` — **AP-STAGE4-04** Conversation: glass + always-on Live computer/Attention empty
- `…/07-view-mode.png` — **AP-STAGE4-04** View active (watch-only rail)
- `…/08-takeover-mode.png` — **AP-STAGE4-04** Takeover: computer primary + Hand back/Stop + chat on rail
- `…/09-conversation-an-cards.png` — **AP-STAGE4-06** Conversation: Mission cards (Computer Idle + Team roster) + Local/unavailable pills + New teammate stub (OPEN review, no PASS)

## Capture notes
- Browser MCP of `localhost:5173` → black empty `#root` (not AnShell). Prefer Electron window capture.
- Working path: `PrintWindow(..., PW_RENDERFULLCONTENT)` on Aporetic HWND; mode flips via CDP `9222` `.an-mode-btn` click.
- If a human-visible desktop shot with Aporetic on top is needed: click the **Aporetic** taskbar button so it is unoccluded, then re-run PrintWindow or Snipping Tool.

## View / Takeover
Captured AP-STAGE4-04 (`07` / `08`). Interactive three-state only — Stage 5 four-mode deferred.

## Design match
Closer (glass + rail + modes) but not Stage 8 PASS. Remaining gaps in `DESIGN-GAPS.md`.
