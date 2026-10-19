# AP-STAGE4-18 — Deeper holographic UI + Review Code/Documents bind

| Field | Value |
|-------|-------|
| status | **OPEN implemented+live-DEV** — **not** INDEPENDENT PASS; **not** Stage 4 complete |
| branch | `stage4-an-shell` |
| tip | `daacb54dda` (code = tip) |
| code | `daacb54dda` |
| base | `927b414095` (AP-STAGE4-17 / AP-BF-06 tip) |
| worktree | `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4` |
| scope | Deeper holographic ice motion; bind Review Code + Documents to real viewable content |
| merge/push/install | **No** |

## Intent (Ali)

1. Visual bar still open after STAGE4-17/BF-06 — motion intentional but short of Grok-bot class; Code/Documents were surfaces only.
2. Deeper holographic UI/UX: smoother transitions, light/depth, Jarvis-adjacent ice glass; compete with Grok bot / Cursor / Antigravity feel within AN brand (not copy).
3. Bind Code + Documents in Review to real editor/doc preview — not empty shells.

## What shipped

### Holographic depth (AN brand)
- `AN_MOTION_SURFACE` slice → `AP-STAGE4-18` with `jarvis-adjacent-ice-glass`, continuous light, springier panel/tab/live/holo easings.
- CSS: continuous sheen sweep (`.an-review-holo-sweep`), ice depth pulse, preview settle, ambient shell light sweep; stronger `--an-holo-*` tokens in `an.css`.
- Markers: `data-holo="stage4-18"`, `--an-ease-holo`, `--an-holo-sweep`, `--an-holo-depth`.

### Review Code / Documents bind
- `review-content.ts` — classify code vs documents, truncate honestly, line-number format, lightweight escaped doc preview HTML.
- `AnReviewPanel` — path bar + Open; `review-code-editor` / `review-document-preview` with real body content; Files list opens into Code/Documents.
- `session-layout` loads via workspace `file.read` (relative to session directory or absolute path).
- `AN_REVIEW_CONTENT_SURFACE` markers + unit tests.

### DEV ops
- Declared `ws@8.21.0` on `@opencode/app` so `vite.computer-cdp.mjs` resolves under electron-vite/Node (relay plugin load).

## Writer verification (2026-10-19)

- `bun test src/shell/an src/aporia/flows-util.test.ts` → **107 pass / 0 fail**
- `bun test ../core/src/mission/control.test.ts` → **6 pass / 0 fail**
- Live CDP `cdp-probe-stage4-18-holo-review-bind.mjs` → RESULT `ok:true` marker `AP-STAGE4-18 holo-bind 1792423764700` (CDP port `9223` isolated Stage4 DEV)
  - `motionOk`: sweep + ease-holo + depth tokens + `an-review-in, an-ice-depth-pulse`
  - `codeBind`: status `ready`, 270 lines of `tokens.ts` in editor body
  - `docBind`: markdown preview body with heading from STAGE4-17 report
  - STAGE4-12 composer ownership non-regress
- Shots: `64`–`67` under `docs/an-rewrite/evidence/screenshots-2026-10-18/` (+ board evidence copies)

## Honest residuals vs Grok-bot bar

- Continuous sheen + depth pulse close the STAGE4-17 gap but still short of full Grok presence character / micro-spring personality.
- Doc preview is lightweight markdown-ish (not a full MD engine / Office viewer).
- Relative paths require a session workspace directory; absolute paths work from home.
- BF-01…06 + STAGE4-11…17 preserved; no self-PASS.
- **Not** Stage 4 complete. No merge/push.

## Board

- `AP-STAGE4-18` → **OPEN** implemented+live-DEV (await independent verifier)
