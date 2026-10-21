# AP-STAGE4-03 — Composer AN tokens (void fill + gold focus/send)

Work date: October 18, 2026 (America/Chicago). Board task `AP-STAGE4-03`.

## Worktree / branch / HEAD

| item | value |
| --- | --- |
| cwd | `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4` |
| branch | `stage4-an-shell` (continues from AP-STAGE4-02 tip `7d0712bb07`) |
| commit | `380620883c` — `fix(an-shell): pin composer to AN void/gold tokens` |
| tip | `8b212b3f2f` — docs/evidence after code |
| ownership | this worktree only — not `cursor-aporetic` (Stage 0) and not `C:\Tools\aporia` |
| push | none |
| merge | none |
| Stage 4 complete | not claimed |
| independent PASS | **not claimed** — OPEN for review |
| running-DEV | used for re-screenshot only; not an acceptance PASS |

## Why this slice

`DESIGN-GAPS.md` critical gap #1: composer sampled navy/indigo ~`#121b37` / `#151e3e` vs approved AN void `#020509` + gold `#f0c66d` / `#d79a2e`. Ali confirmed design isn’t right; this owned slice kills that surface only.

## Owned files changed

| file | why |
| --- | --- |
| `packages/app/src/shell/an/tokens.ts` | `AN_COMPOSER_SURFACE` pin (void/gold + hosts) |
| `packages/app/src/shell/an/tokens.test.ts` | Unit pin; rejects navy samples |
| `packages/app/src/shell/an/an-shell.css` | AnShell-scoped composer void fill + gold focus/send |
| `packages/app/src/shell/an/index.ts` | Export `AN_COMPOSER_SURFACE` |
| `packages/app/src/composer/editor/editor.css` | Beat dark dock `v2-layer-01` navy rule under AnShell/`an` |
| `packages/ui/src/theme/themes/an.json` | Dark `v2Overrides`: base/deep/layer-01 → `#020509`; submit contrast → `#d79a2e` |
| `packages/ui/src/theme/an-theme.test.ts` | Resolve pin for void fill + gold contrast |
| `docs/an-rewrite/CURSOR-AP-STAGE4-03.md` | this report |
| `docs/an-rewrite/STATUS.md` | Stage 4 composer-tokens row |
| `docs/an-rewrite/evidence/2026-10-18-an-*-composer*-stage4.txt` | Stored unit results |
| `docs/an-rewrite/evidence/screenshots-2026-10-18/05-composer-an-tokens-after.png` | After PrintWindow (Electron PID 59784) |

## Acceptance mapping (this slice only)

| criterion | result |
| --- | --- |
| Kill navy/indigo composer when AnShell/`an` active | Done in source + CSS; running-DEV pixel sample center `#020509` (was `#121B39`) |
| Void fill + gold focus/send per approved packet | Void fill applied; gold focus ring + enabled send (`#d79a2e` / hover `#f0c66d`); empty/disabled send stays muted (by design) |
| Small related composer chrome only | Soft gold border under AnShell hosts only |
| View/Takeover, glass redesign, attention rail, cards, New teammate | Out of scope — untouched |
| Independent PASS / merge / push | **Not claimed** — OPEN for review |

## Pixel evidence (running-DEV)

| shot | path | composer center sample |
| --- | --- | --- |
| before | `docs/an-rewrite/evidence/screenshots-2026-10-18/01-conversation-default.png` | `#121B39` |
| after | `docs/an-rewrite/evidence/screenshots-2026-10-18/05-composer-an-tokens-after.png` | `#020509` |

Bottom composer band after: voidish-dominant (navy remnant ≈1 stray sample vs hundreds of void).

## Tests and stored outputs

```
cd packages/app && bun test ./src/shell/an/tokens.test.ts ./src/shell/an/bind.test.ts
# 13 pass / 0 fail

cd packages/ui && bun test ./src/theme/an-theme.test.ts
# 3 pass / 0 fail
```

Stored under `docs/an-rewrite/evidence/2026-10-18-an-composer-tokens-stage4.txt` and `…-an-theme-composer-stage4.txt`.

## What was deliberately not done

- No View/Takeover wiring, attention always-on, card system, New teammate.
- No merge/push/promote.
- No PASS self-claim.
- Stage 0 worktree untouched as writer; DEV electron binary path may resolve packages via shared bun install — edits landed only in `cursor-aporetic-stage4`.

## Next

- Independent review of this visual-token slice (OPEN).
- Follow-on owned slices: interactive Conversation/View/Takeover; always-visible Attention rail; mission pills when real data exists.
