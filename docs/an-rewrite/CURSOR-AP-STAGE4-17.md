# AP-STAGE4-17 — Review panel + BF-06 windowing + holographic motion

| Field | Value |
|-------|-------|
| status | **OPEN implemented+live-DEV** — **not** INDEPENDENT PASS; **not** Stage 4 complete |
| branch | `stage4-an-shell` |
| tip | _(filled after tip-sync commit)_ |
| code | _(filled after code commit)_ |
| base | `c4be6688a8` (AP-BF-05 tip) |
| worktree | `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4` |
| scope | Collapsible in-app Review panel; Edge/Chrome reuse existing window→tab; holographic ice motion |
| merge/push/install | **No** |

## Intent (Ali)

1. External Edge/Chrome: open a **tab in the existing window**; spawn a new OS browser window **only if none is running**.
2. Collapsible right **Review** panel hosting browser / code / files / documents — ChatGPT/Cursor-style side surface **inside** AnShell (no extra Electron window).
3. Smoother holographic UI/UX transitions (Grok-bot-class bar within AN ice glass — not a skin copy).

## What shipped

### AP-BF-06 windowing
- `computer-external-window.ts` policy: CDP up → `open-tab-existing`; browser running without CDP → `refuse-second-window`; none running → `spawn-window`.
- Relay `POST /__an/computer-cdp/open-tab` uses `Target.createTarget({ newWindow: false })`; spawn only when policy allows.
- Consent chrome: **Open tab in browser** (`data-action="computer-external-open-tab"`).

### AP-STAGE4-17 Review panel
- `AnReviewPanel` mounted from AnShell nav (`Review`); tabs Browser / Code / Files / Documents.
- Local Live attach prefers opening Review Browser in-app.
- Computer View iframe sandbox drops `allow-popups` / `allow-modals` (stay in-app).

### Motion (holographic ice)
- `AN_MOTION_SURFACE` + CSS vars `--an-ease-panel/tab/live`, `--an-holo-sheen/rim`.
- Intentional motions: panel open (`an-review-in`), tab fade, Live attach glow, card enter, composer settle retained.

## Writer verification (2026-10-19) — not independent PASS

- `bun test src/shell/an src/aporia/flows-util.test.ts` → **101 pass / 0 fail**
- `bun test ../core/src/mission/control.test.ts` → **6 pass / 0 fail**
- Live CDP `cdp-probe-stage4-17-review-windowing.mjs` → RESULT `ok:true` marker `AP-STAGE4-17 review 1792422423948`
  - `reviewOk` + `tabSwitch` + `liveOk` + `windowingOk` (`refuse-second-window` when Edge open without CDP — correct)
  - `uiOpenTab.hasOpenTabBtn` + motion CSS vars present
- Shots: `60-stage4-17-review-open.png`, `61-stage4-17-review-files.png`, `62-stage4-17-live-review.png`, `63-stage4-17-external-open-tab.png`

## Honest residuals vs Grok-bot bar

- Motion is deliberate but still below Grok-bot polish depth (presence character, continuous light sweeps, micro-springs).
- Code / Documents Review tabs are structured surfaces — editor/doc viewer bind remain OPEN.
- Packaged desktop spawn/open-tab ownership still OPEN (DEV relay path).
- BF-01…05 + STAGE4-11…16 preserved; no ice punch rework beyond motion tokens.
- **Not** Stage 4 complete. No merge/push. Do **not** self-PASS.

## Board

- `AP-STAGE4-17` → OPEN implemented+live-DEV
- `AP-BF-06` → OPEN implemented+live-DEV (windowing slice; boarded with this pass)
