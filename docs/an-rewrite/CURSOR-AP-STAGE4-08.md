# AP-STAGE4-08 — Frictionless ice/glass feel polish under AnShell

Work date: October 19, 2026 (America/Chicago). Board task `AP-STAGE4-08`.

## Worktree / branch / HEAD

| item | value |
| --- | --- |
| cwd | `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4` |
| branch | `stage4-an-shell` (continues from AP-STAGE4-07 tip `50d20e0007`) |
| commits | `c86e9add7c` — ice-glass tokens; `5dc46d150b` — surfaces/motion/dock CSS |
| tip | `1a76e98315` — docs tip after report `5ff2a85777` (code `c86e9add7c`+`5dc46d150b`) |
| ownership | this worktree only — not Stage 0 / not installed Aporetic |
| push / merge | none |
| Stage 4 complete | not claimed |
| independent PASS | **not claimed** — OPEN for review |
| running-DEV | CDP probe + `Page.captureScreenshot` shot `12`; STAGE4-01..07 behavior kept |

## Why this slice

Ali design feel (authority, 2026-10-19): **frictionless glass or ice — smooth**. Not chunky OpenCode chrome; not matte plastic. Still AN black/gold (gold accents on ice-dark glass) — not Lagoon Night theme swap.

## Owned files changed

| file | why |
| --- | --- |
| `packages/ui/src/styles/tokens/an.css` | Cooler translucent panels, blur 28/42, ice sheen/edge, softer shadow, longer ease |
| `packages/app/src/shell/an/tokens.ts` | Mirror panel/border/glow + `feel: frictionless-ice-glass` |
| `packages/app/src/shell/an/tokens.test.ts` | Ice-translucent assertions (AP-STAGE4-08) |
| `packages/app/src/shell/an/an-shell.css` | Ice atmosphere, specular rails, mode/rail ease, Session/composer glass dock |
| `packages/app/src/shell/an/cards/an-card.css` | Ice-glass cards, `an-card-appear`, softer tool/session chrome |
| `docs/an-rewrite/CURSOR-AP-STAGE4-08.md` | this report |
| `docs/an-rewrite/evidence/screenshots-2026-10-18/12-ice-glass-feel.png` | Conversation after ice/glass polish |
| `docs/an-rewrite/evidence/cdp-probe-stage4-08.mjs` | CDP feel probe |

## What changed for “smooth ice/glass”

| surface | change |
| --- | --- |
| Panels | Cooler `rgba(6,14,22,…)` / raised / glass alpha; ice sheen + specular edge light |
| Blur | `--an-blur` 22→28; `--an-blur-strong` 32→42; `saturate(1.18)` |
| Borders / shadows | Softer gold borders; `--an-shadow-soft` instead of chunky drop |
| Motion (3) | Mode grid `--an-ease-rail` 360ms; rail surface ease; card `an-card-appear` 420ms |
| Session / composer dock | Ice glass dock + void composer fill with ice edge; gold send/focus kept |
| Brand | Gold `#f0c66d` + void `#020509` unchanged; no Lagoon Night |

## Prior STAGE4-01..07 kept

Three-state Conversation/View/Takeover · always-on Attention/Live computer · Aporetic branding · card types · tool→Task/Proof map · composer void/gold · reduced-motion honored.

## Tests

`bun test src/shell/an/` from `packages/app` — **29 pass / 0 fail**.

## Pixel / CDP evidence

| check | result |
| --- | --- |
| CDP probe | `hasShell`, mode `conversation`; `--an-blur=28px`, `--an-blur-strong=42px`; ice sheen/edge set; gold/void AN; card `backdrop-filter: blur(28px) saturate(1.18)`; `animationName=an-card-appear`; dock `rgba(2,6,12,0.28)`; composer `rgb(2,5,9)`; cards Computer+Team |
| Shot | `12-ice-glass-feel.png` via CDP `Page.captureScreenshot` |
| Honest note | Ice translucency is subtle on near-void backgrounds (backdrop needs depth behind); feel is token+CSS verified, visual judgment for reviewer |

## Not claimed

independent PASS · Stage 4 complete · merge · push · Stage 8 / running-DEV acceptance · Lagoon Night · full Session panel rewrite · photographic mockup underlay
