# AP-STAGE4-06 — AN glass card language (Task / Approval / Decision / Proof / Computer / Team)

Work date: October 19, 2026 (America/Chicago). Board task `AP-STAGE4-06`.

## Worktree / branch / HEAD

| item | value |
| --- | --- |
| cwd | `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4` |
| branch | `stage4-an-shell` (continues from AP-STAGE4-05 tip `39bf053c7b`) |
| commit | `8f92dad076` — `feat(an-shell): AN glass cards in stream (AP-STAGE4-06)` |
| tip | `80970f74f3` — docs tip after code |
| ownership | this worktree only — not Stage 0 / not installed Aporetic |
| push / merge | none |
| Stage 4 complete | not claimed |
| independent PASS | **not claimed** — OPEN for review |
| running-DEV | CDP probe + PrintWindow `09`; three-state modes left intact |

## Why this slice

`DESIGN-GAPS.md` #4: stream still OpenCode chrome — not approved Task / Approval / Decision / Proof / Computer / Team card language. Ali: continue; next biggest mockup gap after branding.

## Owned files changed

| file | why |
| --- | --- |
| `packages/app/src/shell/an/cards/*` | Glass card types, map helpers, AnCard / AnStreamCards, unit tests |
| `packages/app/src/shell/an/an-shell.tsx` | Stream card region; Attention rail → Approval cards |
| `packages/app/src/shell/an/an-shell.css` | Attention wrap, New teammate, permission host |
| `packages/app/src/shell/an/session-layout.tsx` | `buildStreamCards` bind; New teammate stub; stream action stubs |
| `packages/app/src/shell/an/bind.ts` | Honest mission pills (Local + unavailable Private/Efficient/Verified) |
| `packages/app/src/shell/an/types.ts` / `index.ts` | streamCards props + card exports |
| `packages/app/src/session/requests/session-permission-dock.tsx` | Under AnShell → Approval card (live deny/always/once) |
| `docs/an-rewrite/CURSOR-AP-STAGE4-06.md` | this report |
| `docs/an-rewrite/evidence/screenshots-2026-10-18/09-conversation-an-cards.png` | Conversation with cards |
| `docs/an-rewrite/evidence/screenshots-2026-10-18/DESIGN-GAPS.md` | Gap #4–6 status |

## Mapping vs still OpenCode

| surface | mapping |
| --- | --- |
| Mission attention items | → Approval cards (stream + Attention rail) |
| Permission dock (AnShell on) | → Approval card; actions wired to decide() |
| Session working | → Task card (no invented progress %) |
| Live computer panel state | → Computer card (honest Idle / no feed) |
| Roster | → Team card summary; Configure stub |
| Question dock | Mapper `questionToDecisionCard` ready; dock UI still OpenCode (glass CSS wrap under shell) |
| Proof | Component + type ready; **no live proof source** — not invented into stream |
| Message / tool / edit parts | Still OpenCode chrome in `.an-stream-legacy` (soft glass CSS only) |

## Secondary (in scope if time)

| item | status |
| --- | --- |
| Mission pills Local / Private / … | Done — Local real; others `· unavailable` |
| New teammate entry | Stub button + honest alert |
| Three-state Conversation/View/Takeover | Unchanged (CDP mode still conversation after reload) |

## Tests

`bun test src/shell/an/` from `packages/app` — **26 pass / 0 fail** (tokens + bind + cards map).

## Pixel / CDP evidence

| check | result |
| --- | --- |
| CDP probe | `hasShell`, `hasStreamCards`, cards Computer+Team, `hasNewTeammate`, pills Local + 3× unavailable |
| Shot | `09-conversation-an-cards.png` PrintWindow Aporetic HWND (PID 59784) |
| Modes | `data-mode=conversation`; View/Takeover chrome not broken |

## Not claimed

independent PASS · Stage 4 complete · merge · push · Stage 8 / running-DEV acceptance · fake Private/Efficient/Verified telemetry · full tool-stream rewrite
