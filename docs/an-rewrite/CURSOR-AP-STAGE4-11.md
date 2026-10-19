# AP-STAGE4-11 — AnShell owns Conversation stream (de-wrapper)

| Field | Value |
|-------|-------|
| status | **OPEN for review** — vertical slice landed; **not** Stage 4 complete; **not** INDEPENDENT PASS claimed by this writer |
| branch | `stage4-an-shell` |
| tip | `ed17538810` |
| worktree | `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4` |
| scope | AnShell owns user+assistant text Conversation; suppress OpenCode timeline under AnShell; fix card flex crush |
| running-DEV | ACTIVE (watch-as-you-build CDP); running ≠ PASS |
| merge/push | **No** |

## Architecture choice

**Stop CSS-wrapping `SessionScreenView` as the message list.** Under AnShell with an open session:

1. Map `SessionMessageInfo[]` → `AnConversationTurn[]` (`messagesToConversationTurns`).
2. Render turns in `AnConversationStream` (AN ice-glass turns; You / agent labels).
3. Keep session/core APIs + OpenCode **composer** in `.an-stream-legacy--composer-only`.
4. Suppress OpenCode timeline host (`data-an-part="opencode-timeline"`) via CSS under AnShell.
5. Cap Mission cards (`max-height: 28%`) so they cannot crush Conversation (root cause of “sent message invisible”).

Home / draft (no `sessionID`) still shows OpenCode welcome children — no fake session stream.

## Root cause (Ali was right)

Before this slice:

- Mission cards got `.an-stream > * { flex: 1 }`, growing to ~half / then ~all of the stream when Task cards appeared.
- Conversation / OpenCode timeline fought for leftover height → user turns effectively **h≈16px** (in DOM, not visible).
- UI was still a **wrapper** around OpenCode Session chrome, not an owned Conversation path.

INDEPENDENT PASS on earlier STAGE4 / 4C/4D tasks was **source/unit/chrome scope** — **not** Stage 4 complete, **not** OpenCode stream replacement done. Board must stay honest.

## Evidence (watch-as-you-build)

| Shot | What you see |
|------|----------------|
| `19-before-message-visibility.png` | Home; cards flex steal; no session Conversation |
| `19b-before-own-stream-home.png` / `19c-after-open-session.png` | After own-stream + card cap: session open; YOU turns visible |
| `20-after-message-visible.png` | **Proof:** user markers `AP-STAGE4-11 visibility …` visible as YOU turns; assistant replies; OpenCode timeline `display:none`; conv ~327px |

CDP probe: `docs/an-rewrite/evidence/cdp-probe-stage4-11-own-stream.mjs` → RESULT `ok: true`.

## Tests

`bun test` packages/app `src/shell/an` — conversation-turns + prior shell/an suites (35 pass in focused run including new turns tests).

## Honest residual OpenCode / wrapper jank (not done)

- Composer dock still OpenCode prompt chrome (model chip, + menu, mic/call) — glass-skinned, not AN-native.
- Mission cards still sit above Conversation (capped/scrollable); not mockup-tight language.
- Tool/edit bodies not inline AN stream parts — still Mission Task/Proof cards + suppressed OC timeline.
- Assistant turns are plain text (no markdown/rich parts yet).
- Session identity header / review toggles / side docks still OpenCode when not hidden.
- Takeover rail Conversation uses same owned stream but residual OC frame around composer.
- Contraptions panel still not mounted in AnShell (4E deferred).

## Not claimed

- Stage 4 complete
- OpenCode fully replaced
- Install merge / push / promote
- INDEPENDENT PASS (leave for verifier)
