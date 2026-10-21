# AP-STAGE4-09 — Session/composer dock ice/glass under AnShell

Work date: October 19, 2026 (America/Chicago). Board task `AP-STAGE4-09`.

## Worktree / branch / HEAD

| item | value |
| --- | --- |
| cwd | `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4-dock` |
| branch | `stage4-dock-glass` (branched from `stage4-an-shell` tip `e742188554`) |
| commits | `9da1be6a51` — Session/composer dock ice-glass CSS + hooks |
| tip | `95d0f301c7` — docs + shot 13 + DESIGN-GAPS note (code `9da1be6a51`) |
| ownership | **separate worktree** — does not edit `cursor-aporetic-stage4` (other agent ice polish) |
| push / merge | **none** — not merged into stage4 tip / Stage 0 / installed Aporetic |
| Stage 4 complete | not claimed |
| independent PASS | **not claimed** — OPEN for review |
| running-DEV | CDP inject preview against live Electron (other worktree tip); shot `13` |

## Why this slice

Ali: Session/composer floating dock is the biggest leftover OpenCode feel under AnShell. Feel authority: **frictionless glass/ice — smooth**; approved black/gold packet; keep void/gold composer tokens.

## Owned files changed

| file | why |
| --- | --- |
| `packages/app/src/shell/an/an-shell.css` | Floating Session panel ice/glass; dock settle motion; kill aporia.css indigo composer under AnShell; void/gold composer + ice edge |
| `packages/app/src/shell/an/cards/an-card.css` | Drop conflicting STAGE4-08 panel/dock rules (owned by an-shell.css now) |
| `packages/app/src/composer/editor/editor.css` | Void + ice sheen base aligned with dock (not navy layer-01) |
| `packages/ui/src/styles/tokens/an.css` | `--an-ease-dock` |
| `packages/app/src/shell/an/tokens.ts` + `tokens.test.ts` | Mirror `easeDock`; STAGE4-09 unit assert |
| `packages/app/src/session/session-frame.tsx` | `data-an-part="session-panel-frame"` hook (no shell rewrite) |
| `packages/app/src/session/composer/session-composer-region.tsx` | `data-an-part="session-composer-dock"` hook |
| `docs/an-rewrite/CURSOR-AP-STAGE4-09.md` | this report |
| `docs/an-rewrite/evidence/screenshots-2026-10-18/13-session-dock-glass.png` | Conversation after Session dock glass |
| `docs/an-rewrite/evidence/cdp-probe-stage4-09.mjs` | CDP inject + probe + shot |

## What changed

| surface | change |
| --- | --- |
| Session panel frame | Translucent ice gradients, blur 42 / saturate 1.18, radius 18, specular + soft float shadow, `an-dock-settle` |
| Session title strip | Quiet ice bar (not OpenCode header slab) |
| Composer dock strip | Frost strip; no opaque `bg-base` under AnShell CSS |
| Composer | Void fill + ice sheen; **gold** border (kills aporia.css indigo `#818cf8`); gold send/focus kept |
| Motion | `--an-ease-dock` 320ms; focus lift; reduced-motion honored via existing AnShell rule |

## Prior STAGE4-01..08 kept

Three-state Conversation/View/Takeover · always-on Attention · Aporetic branding · cards · stream glass · composer void/gold · ice feel tokens. No whole-shell rewrite.

## Tests

`bun test src/shell/an/` from `packages/app` — **30 pass / 0 fail** (+1 STAGE4-09 easeDock assert).

## Pixel / CDP evidence

| check | result |
| --- | --- |
| CDP probe | `hasShell`, mode `conversation`; panel blur `blur(42px) saturate(1.18)`; radius `18px`; anim `an-dock-settle`; composer border **gold** `rgba(240,198,109,…)`; gold `#f0c66d` void `#020509` |
| Shot | `13-session-dock-glass.png` via CDP `Page.captureScreenshot` after CSS inject |
| Honest note | Live Electron still serves other agent's stage4 tip; probe **injects** dock CSS from this worktree for visual proof. Ice translucency remains subtle on near-void backdrops (backdrop needs depth). |

## Not claimed

independent PASS · Stage 4 complete · merge · push · Stage 8 / running-DEV acceptance · Lagoon Night · Podman chrome · illustrated nav · merge into `cursor-aporetic-stage4`
