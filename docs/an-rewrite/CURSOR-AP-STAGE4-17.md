# AP-STAGE4-17 — Review panel + BF-06 windowing + holographic motion

| Field | Value |
|-------|-------|
| status | **INDEPENDENT PASS** (Review panel + holographic motion scope) — **not** Stage 4 complete |
| branch | `stage4-an-shell` |
| tip | `927b414095` (docs sync; code `aef077a496`) |
| code | `aef077a496` |
| base | `c4be6688a8` (AP-BF-05 tip) |
| independent_verify | 2026-10-19 — re-ran shell/an+flows **101 pass** + core control **6 pass**; live CDP `1792422792481`; open-tab-existing + refuse-second-window; non-regress BF-05 / STAGE4-12/16 / 4E; board evidence `2026-10-19-ap-stage4-17-bf-06-independent-pass.txt` |
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

## Independent verification (2026-10-19)

- `bun test src/shell/an src/aporia/flows-util.test.ts` → **101 pass / 0 fail**
- `bun test ../core/src/mission/control.test.ts` → **6 pass / 0 fail**
- Live CDP `cdp-probe-stage4-17-review-windowing.mjs` → RESULT `ok:true` marker `AP-STAGE4-17 review 1792422792481`
  - `reviewOk` + `tabSwitch` + `liveOk` + `windowingOk` (`refuse-second-window` when Edge open without CDP)
  - Local Live → Review Browser in-app; `noPopupsSandbox:true`
  - `uiOpenTab.hasOpenTabBtn` + motion CSS vars present
- Live BF-06 open-tab-existing: relay HTTP 200 `spawned:false` region `506AC2C5401765E9733BE0F0D06A4599`
- Non-regress: BF-05 `1792423115810`; STAGE4-12 `1792423018528`; STAGE4-16 `1792423024698`; 4E mount ok (re-run after known toggle flake)
- Shots: `60-stage4-17-review-open.png`, `61-stage4-17-review-files.png`, `62-stage4-17-live-review.png`, `63-stage4-17-external-open-tab.png`

## Honest residuals vs Grok-bot bar

- Motion is deliberate but still below Grok-bot polish depth (presence character, continuous light sweeps, micro-springs).
- Code / Documents Review tabs are structured surfaces — editor/doc viewer bind remain OPEN.
- Packaged desktop spawn/open-tab ownership still OPEN (DEV relay path).
- BF-01…06 + STAGE4-11…16 preserved; no ice punch rework beyond motion tokens.
- **Not** Stage 4 complete. No merge/push.

## Board

- `AP-STAGE4-17` → **DONE** INDEPENDENT PASS
- `AP-BF-06` → **DONE** INDEPENDENT PASS (windowing slice; boarded with this pass)
