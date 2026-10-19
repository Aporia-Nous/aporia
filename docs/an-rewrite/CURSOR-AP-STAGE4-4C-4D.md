# AP-STAGE4-4C + AP-STAGE4-4D — Presence chrome + Computer View

Work date: October 19, 2026 (America/Chicago). Board tasks `AP-STAGE4-4C` and `AP-STAGE4-4D` (combined slice).

**Status: OPEN for review — not independent PASS. No merge into `stage4-an-shell`. No push.**

## Worktree / branch / HEAD

| item | value |
| --- | --- |
| cwd | `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4-presence` |
| branch | `stage4-presence-computer-view` (from `stage4-an-shell` tip `4f1fe0fea9`) |
| base | `4f1fe0fea9` — AP-STAGE4-10 tip |
| ownership | **separate worktree** — does not collide with MODELS-01a on main Stage 4 worktree |
| push | none |
| merge into `stage4-an-shell` | **none** (parent merges after reviews) |
| Stage 4 complete | not claimed |
| independent PASS | **not claimed** — OPEN for review |
| running-DEV | not loaded; CDP was down this slice — fixture chrome shots only |

## Why this slice

Ali design (`DESIGN-DIRECTION-ALI.md`): Bot Team presence listening/thinking/speaking/working/waiting; user-facing **Computer View** (not bare View); ice glass / Aporetic; honesty — scaffold ≠ live computer control.

## Owned files changed

| file | why |
| --- | --- |
| `packages/app/src/shell/an/tokens.ts` | Presence set → design five + unknown; mode label View → Computer View |
| `packages/app/src/shell/an/bind.ts` | `resolveAnPresence` + `sessionActivityFromMessages` from real signals |
| `packages/app/src/shell/an/session-layout.tsx` | Wire call/session/permission/tool/stream → agent signals |
| `packages/app/src/shell/an/an-shell.tsx` | Presence labels; Computer View title/badge/copy; `computerLive` |
| `packages/app/src/shell/an/an-shell.css` | Presence dots/labels (ice/gold); unavailable badge |
| `packages/app/src/shell/an/cards/map.ts` | Computer card title/status/action → Computer View / Unavailable |
| `packages/app/src/shell/an/types.ts` | `computerLive` prop |
| `packages/app/src/shell/an/*.test.ts` | Pins for presence map + Computer View copy |
| `docs/an-rewrite/CURSOR-AP-STAGE4-4C-4D.md` | this report |
| `docs/an-rewrite/evidence/stage4-4c-4d-fixture*.html` | Chrome fixture (not running-DEV) |
| `docs/an-rewrite/evidence/screenshots-2026-10-18/16-*.png` | Presence + Conversation |
| `docs/an-rewrite/evidence/screenshots-2026-10-18/17-*.png` | Computer View mode |

## Presence mapping (honest)

| Signal (real) | Presence |
| --- | --- |
| Voice call `listening` / `thinking` / `speaking` (selected agent only) | listening / thinking / speaking |
| Permission awaiting user | waiting |
| Session `running` + tool running/streaming | working |
| Session `running` + assistant text streaming | speaking |
| Session `running` + reasoning open | thinking |
| Session `running` without finer parts | thinking |
| Idle / missing / unavailable | **unknown** (never invent listening) |

## Computer View (4D)

- Mode id stays `view`; user-facing label **Computer View**.
- Panel title **Computer View**; badge **Unavailable** when `computerLive` is false.
- Empty/note copy: watch/control backends not attached — chrome only.
- No live computer control backend invented.

## Acceptance mapping (this slice only)

| criterion | result |
| --- | --- |
| Map real signals → listening/thinking/speaking/working/waiting | Done — + unknown escape |
| User-facing Computer View (not bare View) | Done |
| Honesty when control/feed not ready | Done — Unavailable + chrome-only copy |
| Ice glass / Aporetic kept | Done (CSS tokens unchanged feel) |
| Unit tests | **33 pass / 0 fail** (tokens+bind+cards) |
| Screenshots | Fixture `16` / `17` (not running-DEV) |
| Independent PASS / merge / push | **Not claimed** |

## Tests

```
cd packages/app && bun test ./src/shell/an/tokens.test.ts ./src/shell/an/bind.test.ts ./src/shell/an/cards/map.test.ts
# 33 pass / 0 fail
```

Stored: `docs/an-rewrite/evidence/2026-10-19-an-shell-stage4-4c-4d.txt`.

## What was deliberately not done

- Merge into main `stage4-an-shell` / running-DEV restart
- Live computer watch/control backends
- Independent PASS self-claim
- Stage 5 three-vs-four mode reconciliation
- Fake “listening” for idle agents

## Next

- Independent review of this worktree (OPEN).
- Parent merge into `stage4-an-shell` only after reviews.
- Optional running-DEV proof after authorized restart on merged tip.
