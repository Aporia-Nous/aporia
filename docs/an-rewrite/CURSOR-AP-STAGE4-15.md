# AP-STAGE4-15 — Cards in Conversation stream + collapsed Mission stack

| Field | Value |
|-------|-------|
| status | **INDEPENDENT PASS** (cards-in-stream scope) — **not** Stage 4 complete |
| branch | `stage4-an-shell` |
| tip | `5167449bd7` (docs sync; code `e87ff135c0`) |
| code | `e87ff135c0` |
| base | `93d29c01b4` (AP-STAGE4-14 INDEPENDENT PASS tip) |
| independent_verify | 2026-10-19 — re-ran shell/an+flows **85 pass**; CDP `1792419613028`; non-regress 12/13/14/4E/BF-01; board evidence `2026-10-19-stage4-15-independent-pass.txt` |
| worktree | `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4` |
| scope | Design-audit high: Task/Approval/Proof/Computer cards render **in** Conversation stream (mockup); Mission stack above stream collapsed empty; Mission header compact |
| merge/push/install | **No** |
| presence | Untouched (AP-STAGE4-14 PASS retained) |

## Why

Design direction + audit residual: Mission cards sat as a stack **above** Conversation and crushed the mockup contract (“cards in conversation”). Mission chrome was too tall.

## What shipped

1. `buildConversationStreamItems` — chronological turns + tool Task/Proof cards + context (session task, approval, computer, team).
2. `AnConversationStream` renders interleaved `AnStreamItem` rows (`data-an-part="in-conversation-card"`).
3. `buildMissionStackCards({ conversationOwnsCards: true })` → **empty** (stack not primary surface).
4. Mission header `data-an-mission="compact"` — pills collapsed behind `Local · +N` details.
5. CSS: Conversation flex grows; collapsed stack cap unused when empty.

## Evidence

| Shot | What you see |
|------|----------------|
| `47-before-cards-in-stream.png` | Compact mission + stream |
| `48-cards-in-conversation.png` | Conversation owned; Mission stack absent above |
| `49-cards-in-stream-computer-view.png` | Computer View mode retains in-stream cards |
| `50-cards-in-stream-conversation.png` | Computer + Team cards **inside** Conversation list |

Live CDP (independent re-run): `cdp-probe-stage4-15-cards-in-stream.mjs` → RESULT `ok:true` marker `AP-STAGE4-15 cards-in-stream 1792419613028`  
- missionCompact; streamCardsInStream; inConversationCardCount=2; cardTypes `[computer,team]`  
- Mission stack absent; convH=578; composerOwned; timeline none; unknownCount 0

## Tests

`bun test src/shell/an src/aporia/flows-util.test.ts` from `packages/app` — **85 pass / 0 fail** (independent re-run).

## Non-regression (live CDP, independent re-run)

- STAGE4-12 → `ok:true` marker `AP-STAGE4-12 composer 1792419628428`
- STAGE4-13 → `ok:true` marker `AP-STAGE4-13 chrome 1792419629523`
- STAGE4-14 presence → `ok:true` marker `AP-STAGE4-14 presence 1792419660415` (13 Listening / 0 Unknown)
- 4E Contraptions → first toggle-flake `ok:false`; re-run `ok:true` mountOk
- BF-01 attach → `ok:true` marker `AP-BF-01 attach 1792419639036`

## Honest residuals

- Tool→Task/Proof in-stream only when session has active/edit tools (quiet reads still skipped); live quiet session shows ambient Computer+Team.
- Right-rail Computer View panel remains (BF path) — stream Computer card is language chrome, not a second Live feed.
- Full mockup card fidelity (tags, checklists, handoff strip) still deferred.
- Ice-punch / BF-05 / CE-01 left alone.
- Not Stage 4 complete; no merge/push.

## Not claimed

- Stage 4 complete
- merge / push / promote
- OpenCode fully replaced
- Full mockup card fidelity / simultaneous Task+Approval+Proof+Computer on quiet session
