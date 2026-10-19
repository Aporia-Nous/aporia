# AP-STAGE4-14 — Companion presence five-state (live signals)

| Field | Value |
|-------|-------|
| status | **OPEN implemented+live-DEV** — **not** INDEPENDENT PASS; **not** Stage 4 complete |
| branch | `stage4-an-shell` |
| tip | `e51a40692d` (code + report; docs tip sync may follow) |
| code | `e51a40692d` |
| base | `747401a865` (AP-STAGE4-13 INDEPENDENT PASS tip) |
| worktree | `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4` |
| scope | Wire real AnShell/session/call signals → listening / thinking / speaking / working / waiting; Unknown only when truly unknown |
| merge/push/install | **No** |
| composer chrome | Untouched (STAGE4-13 PASS retained) |

## Why

Design audit: AP-STAGE4-4C DONE overclaimed five-state delivery. Live roster was almost all **Unknown**; idle mapped to unknown instead of **listening**. 4C remains chrome/source PASS for presence *set* + Computer View honesty — not live five-state personality.

## What shipped

1. `resolveAnPresence` — known idle/ready → `listening`; call `connecting` → `thinking`; call `error` → `unknown`; empty signal stays `unknown`.
2. `AnPresenceSignal.known` — roster-listed teammates and session rows mark known companions.
3. `botsToRoster` — listed bots always `known: true` (missing session ≠ Unknown).
4. `session-layout` agentSignals — normalize non-running status to `idle`; selected agent without session gets idle/listening (or live call).

## Mapping

| Real signal | Presence |
| --- | --- |
| Voice call listening / thinking / speaking | listening / thinking / speaking |
| Voice call connecting | thinking |
| Voice call error | unknown |
| Permission awaiting user | waiting |
| Session running + tool | working |
| Session running + text stream | speaking |
| Session running + reasoning / no finer parts | thinking |
| Session idle / ready / known companion | **listening** |
| No signal at all | **unknown** |

## Evidence

| Shot | What you see |
|------|----------------|
| `43-before-presence-five-state.png` | Roster Listening (not Unknown) |
| `44-presence-five-state-roster.png` | Conversation + 13 Listening |
| `45-presence-computer-view.png` | Computer View; presence retained |
| `46-presence-busy-state.png` | Selected **Thinking** + others Listening |

Live CDP:
- `cdp-probe-stage4-14-presence.mjs` → RESULT `ok:true` marker `AP-STAGE4-14 presence 1792418494792` — rosterLen 13, fiveCount 13, unknownCount **0**
- `cdp-probe-stage4-14-busy.mjs` → RESULT `ok:true` marker `AP-STAGE4-14 busy 1792418535797` — selectedPresence **thinking**, unknownCount **0**

## Tests

`bun test src/shell/an src/aporia/flows-util.test.ts` from `packages/app` — **80 pass / 0 fail**.

## Non-regression (live CDP)

- STAGE4-12 composer → RESULT `ok:true` (owned composer; YOU turns)
- 4E Contraptions → RESULT `ok:true` mountOk + ownershipOk
- BF-01 attach → RESULT `ok:true` liveOk + disconnectOk

## Honest residuals

- Not every of the five moods appears simultaneously at idle (expected — idle = listening).
- Voice-call listening/speaking needs an active call to show on selected agent.
- Waiting needs a live permission prompt.
- BF-05 / CE-01 / cards-in-stream left alone.
- Stage 5 3-vs-4 still OPEN.

## Not claimed

- INDEPENDENT PASS
- Stage 4 complete
- merge / push / promote
- OpenCode fully replaced
