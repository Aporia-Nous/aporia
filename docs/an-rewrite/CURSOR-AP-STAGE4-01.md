# AP-STAGE4-01 — Stage 4 start: AN black/gold tokens + shell scaffolding

Work date: October 18, 2026 (America/Chicago). Board task `AP-STAGE4-01`.

## Worktree / branch / HEAD

| item | value |
| --- | --- |
| cwd | `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4` |
| branch | `stage4-an-shell` (cut from Stage 0 tip `6751eb44a7`) |
| base | `6751eb44a7` — `docs(an-rewrite): record AP-CURSOR-04/05 commit hashes` |
| ownership | this worktree only — not `cursor-aporetic` (Stage 0 writer) and not `C:\Tools\aporia` |
| push | none |
| merge | none |
| running-DEV | not claimed |
| independent PASS | not claimed |
| Stage 5 / 3-vs-4 modes | OPEN — shell chip uses Conversation/View/Takeover framing only |

## Why this slice

Stage 4 build-list: real AN shell (nav rail, roster, mission, attention) plus `an` theme black/gold glass tokens from approved PNGs/HTML. Existing `aporia` theme/CSS is navy-teal and is **not** the approved packet. First coherent slice = tokens + shell scaffolding (not full Stage 4 acceptance, not New teammate lifecycle, not route swap).

## Owned files changed

| file | why |
| --- | --- |
| `packages/ui/src/theme/themes/an.json` | Desktop theme id `an` — black/gold from v11 (`#f0c66d` / `#d79a2e` / `#03070b` / `#020509` / `#3be78c`) |
| `packages/ui/src/theme/default-themes.ts` | Register `anTheme` in `DEFAULT_THEMES` |
| `packages/ui/src/theme/index.ts` | Export `anTheme` |
| `packages/ui/src/theme/context.tsx` | Display names for `an` and `aporia` |
| `packages/ui/src/styles/tokens/an.css` | Glass CSS variables for shell |
| `packages/ui/src/styles/tokens/index.css` | Import AN tokens |
| `packages/ui/src/theme/an-theme.test.ts` | Theme registration + resolve |
| `packages/app/src/shell/an/*` | Shell scaffold: nav / roster / mission / stream / attention + model helpers |
| `docs/an-rewrite/CURSOR-AP-STAGE4-01.md` | this report |
| `docs/an-rewrite/STATUS.md` | Stage 4 start row |
| `docs/an-rewrite/evidence/2026-10-18-an-*-stage4.txt` | Stored unit results |

## Acceptance mapping (this slice only)

| criterion | result |
| --- | --- |
| `an` theme with black/gold from packet | Done — theme JSON + CSS tokens |
| Shell scaffolding: nav / roster / mission / attention | Done — `AnShell` presentational frame |
| Reuse message/tool components | Deferred — stream is a children slot; no fake content |
| Conversations first-class / mission switch survive | Deferred — not wired into session routes |
| New teammate create/import/edit/cancel/archive | Deferred (later Stage 4 slice) |
| Screenshots vs `original-normal.png` | Deferred (needs route wire + running-DEV) |
| Stage 5 four computer modes | Out of scope — mode chip is three-state labels only |
| Independent PASS / running-DEV / merge / push | Not claimed |

## What was deliberately not done

- No edits on `cursor-aporetic` Stage 0 worktree (fixtures 2/6 owned elsewhere).
- No swap of `AporiaSessionLayout` / sticky `aporia` theme enforcement.
- No fake roster presence or invented mission progress.
- No Lagoon Night / Marrs Tide / replacement-concept tokens.
- No bun install (junctioned existing sibling worktree `node_modules` for local unit runs only).

## Tests and stored outputs

```
cd packages/ui && bun test src/theme/an-theme.test.ts
# 2 pass / 0 fail

cd packages/app && bun test ./src/shell/an/tokens.test.ts
# 6 pass / 0 fail
```

Stored under `docs/an-rewrite/evidence/2026-10-18-an-theme-stage4.txt` and `…-an-shell-stage4.txt`.

## Next

- Wire `AnShell` around real session children (draft/scroll continuity) behind an explicit pref.
- Prefer sticky theme `an` over navy `aporia` once wired.
- New teammate flow + real Attention/roster data binding.
- Screenshot compare at reference viewport after running-DEV authorization.
- Independent review of this source/unit slice — no PASS self-claim.
