# AP-STAGE4-04 — Glass, always-on Attention rail, three-state mode switch

Work date: October 19, 2026 (America/Chicago). Board task `AP-STAGE4-04`.

## Worktree / branch / HEAD

| item | value |
| --- | --- |
| cwd | `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4` |
| branch | `stage4-an-shell` (continues from AP-STAGE4-03 tip `369a549991`) |
| commit | `05b0142d73` — `feat(an-shell): glass, always-on rail, three-state modes (AP-STAGE4-04)` |
| ownership | this worktree only — not `cursor-aporetic` (Stage 0) and not `C:\Tools\aporia` |
| push | none |
| merge | none |
| Stage 4 complete | not claimed |
| independent PASS | **not claimed** — OPEN for review |
| running-DEV | used for re-screenshot + CDP mode clicks; not an acceptance PASS |

## Why this slice

`DESIGN-GAPS.md` remaining critical gaps after AP-STAGE4-03: flat void vs glass; Attention rail collapsed when empty; Conversation chip non-interactive (View/Takeover not capturable). Ali confirmed target is approved glass AN mockup; three-state Conversation / View / Takeover only (Stage 5 four-mode deferred).

## Owned files changed

| file | why |
| --- | --- |
| `packages/ui/src/styles/tokens/an.css` | Softer glass panels, stronger blur, attention widths |
| `packages/app/src/shell/an/tokens.ts` | Translucent panel tokens + `anShellLayout()` flags |
| `packages/app/src/shell/an/types.ts` | `onModeChange`, Hand back/Stop, computer empty props |
| `packages/app/src/shell/an/an-shell.tsx` | Mode switcher, always-on rail + live computer empty, takeover stage |
| `packages/app/src/shell/an/an-shell.css` | Atmosphere gradients, glass panels, mode grid layouts, no collapse |
| `packages/app/src/shell/an/session-layout.tsx` | Interactive mode signal; Hand back → Conversation; Stop → View |
| `packages/app/src/shell/an/shell-model.ts` | `attentionAlwaysOn` + layout on model |
| `packages/app/src/shell/an/index.ts` | Export `anShellLayout` |
| `packages/app/src/shell/an/tokens.test.ts` | Glass + three-state layout pins |
| `docs/an-rewrite/CURSOR-AP-STAGE4-04.md` | this report |
| `docs/an-rewrite/STATUS.md` | Stage 4-04 row |
| `docs/an-rewrite/evidence/screenshots-2026-10-18/06..08-*.png` | Conversation / View / Takeover PrintWindow |
| `docs/an-rewrite/evidence/screenshots-2026-10-18/DESIGN-GAPS.md` | Gap status update |

## Acceptance mapping (this slice only)

| criterion | result |
| --- | --- |
| Soft glass + atmospheric depth (CSS only; no fake telemetry) | Done — multi-radial gold/green washes + translucent panels + blur |
| Always-on right rail (Attention + live computer) even when empty | Done — removed `data-attention-collapsed`; honest empty copy |
| Conversation / View / Takeover changes layout (not label-only) | Done — View widens computer rail; Takeover computer primary + chat on rail + Hand back/Stop stubs |
| Hand back / Stop honest when backend missing | Done — chrome-only alerts; no invented computer control |
| Mission pills / nav icon pass / card rewrite | Deferred (priority 4 / out of scope) |
| Independent PASS / merge / push | **Not claimed** — OPEN for review |

## Pixel / running-DEV evidence

| shot | path | note |
| --- | --- | --- |
| Conversation | `docs/an-rewrite/evidence/screenshots-2026-10-18/06-conversation-glass-rail.png` | Mode switch gold on Conversation; Live computer IDLE empty; Attention empty |
| View | `docs/an-rewrite/evidence/screenshots-2026-10-18/07-view-mode.png` | View active; widened rail; watch-only note |
| Takeover | `docs/an-rewrite/evidence/screenshots-2026-10-18/08-takeover-mode.png` | Computer primary; Hand back / Stop; chat on right rail |

CDP (`localhost:9222`): `data-mode` flips conversation↔view↔takeover; `data-attention-always-on` present; `.an-computer` always in DOM.

## Tests and stored outputs

```
cd packages/app && bun test ./src/shell/an/tokens.test.ts ./src/shell/an/bind.test.ts
# 16 pass / 0 fail

cd packages/ui && bun test ./src/theme/an-theme.test.ts
# 3 pass / 0 fail (composer pins unchanged)
```

Stored under `docs/an-rewrite/evidence/2026-10-19-an-shell-stage4-04.txt` and `…-an-theme-stage4-04.txt`.

## What was deliberately not done

- Full Task/Approval/Proof card rewrite
- Real computer backend / live feed
- Mission Local/Private/Efficient/Verified pills without real data
- Nav illustrated icon set polish (beyond gold active punch-up)
- Stage 4b Discord, merge/push/promote
- Independent PASS self-claim

## Next

- Independent review of this visual/behavior slice (OPEN).
- Follow-on: card language, New teammate, mission progress when real; Stage 5 four-mode still deferred.
