# AP-STAGE4-02 — Wire AnShell into real session path

Work date: October 18, 2026 (America/Chicago). Board task `AP-STAGE4-02`.

## Worktree / branch / HEAD

| item | value |
| --- | --- |
| cwd | `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4` |
| branch | `stage4-an-shell` (continues from AP-STAGE4-01 tip `e98c8ea40a`) |
| base | `e98c8ea40a` — `docs(an-rewrite): record AP-STAGE4-01 commit hash` |
| ownership | this worktree only — not `cursor-aporetic` (Stage 0) and not `C:\Tools\aporia` |
| push | none |
| merge | none |
| running-DEV | not claimed |
| independent PASS | not claimed |
| Stage 4 complete | not claimed |
| Stage 5 / 3-vs-4 modes | OPEN — mode chip remains Conversation/View/Takeover framing only |

## Why this slice

AP-STAGE4-01 landed presentational AnShell + `an` tokens. Deferred: route wire into `AporiaSessionLayout`, sticky `an` theme, real roster/attention binding, stream reuse of message/tool components, mission-switch survival via app patterns.

## Owned files changed

| file | why |
| --- | --- |
| `packages/app/src/shell/an/bind.ts` | Pure roster/attention/mission binders + honest empty/unavailable copy |
| `packages/app/src/shell/an/bind.test.ts` | Unit coverage for binders + mission-switch note |
| `packages/app/src/shell/an/session-layout.tsx` | `AnShellSessionLayout` / Draft / Home: sticky `an`, bound data, stream children |
| `packages/app/src/shell/an/an-shell.css` | Root/stream slot fill + empty roster copy |
| `packages/app/src/shell/an/index.ts` | Export bind + session layouts |
| `packages/app/src/aporia/layout.tsx` | Prefer AnShell when `anShellEnabled` for session/draft/home |
| `packages/app/src/aporia/prefs.ts` | Pref `aporia.an.shell.enabled` (default ON) |
| `packages/app/src/aporia/setting-row.tsx` | Settings toggle for AN shell |
| `packages/app/src/settings/general/general.tsx` | Mount AN shell setting row |
| `docs/an-rewrite/CURSOR-AP-STAGE4-02.md` | this report |
| `docs/an-rewrite/STATUS.md` | Stage 4 wire row |
| `docs/an-rewrite/evidence/2026-10-18-an-*-wire-stage4.txt` | Stored unit results |

## Acceptance mapping (this slice only)

| criterion | result |
| --- | --- |
| Wire AnShell into session layout/route | Done — `AporiaSessionLayout` / Draft / Home switch to AnShell when pref on; `SessionScreenView` stays as children (message/tool reuse) |
| Sticky `an` theme (black/gold, not Lagoon Night) | Done — `useStickyAnTheme` forces theme id `an` + dark while AnShell frame is mounted |
| Real roster/attention where APIs allow | Done — bots bridge → roster (presence `working` only if session status `running`, else `unknown`); `mission.attention.list` → attention; honest unavailable/empty copy otherwise |
| Reuse message/tool in stream | Done — unchanged `SessionScreenView` / `NewSession` / home children in stream slot |
| Mission-switch survival if app patterns support | Documented + preserved — AnShell is chrome only; draft/scroll remain under `ComposerPersistenceProvider` + session tabs; roster click navigates via existing `sessionHref` |
| New teammate full lifecycle | Deferred (not in this slice) |
| Screenshots vs `original-normal.png` | Deferred (needs running-DEV) |
| Stage 4b / Stage 5 modes | Out of scope |
| Independent PASS / running-DEV / merge / push | Not claimed |

## What was deliberately not done

- No edits on `cursor-aporetic` Stage 0 worktree.
- No New teammate create/import/edit/cancel/archive UI (existing bots editor remains under navy layout path).
- No invented mission progress percent (omitted until real task progress API is wired).
- No Lagoon Night / replacement tokens.
- No bun install, no merge/push, no running-DEV.

## Tests and stored outputs

```
cd packages/app && bun test ./src/shell/an/tokens.test.ts ./src/shell/an/bind.test.ts
# 12 pass / 0 fail

cd packages/ui && bun test src/theme/an-theme.test.ts
# 2 pass / 0 fail
```

Stored under `docs/an-rewrite/evidence/2026-10-18-an-shell-wire-stage4.txt` and `…-an-theme-wire-stage4.txt`.

## Pref

- `aporia.an.shell.enabled` — default ON (explicit `"off"` disables). Settings → General → **AN shell**.
- When off: previous navy `AporiaFrame` + sticky `aporia` theme behavior unchanged.

## Next

- New teammate lifecycle in AN chrome.
- Real mission task progress when API is available.
- Screenshot compare after running-DEV authorization.
- Independent review of this source/unit slice — no PASS self-claim.
