# AP-STAGE5-02 — quiet Computer entry + Team handoff card

| Field | Value |
|-------|-------|
| status | **OPEN implemented+live-DEV** — **not** INDEPENDENT PASS; **not** Stage 5 complete |
| decision | Option C continues (AP-STAGE5-MODES DONE) |
| branch | `stage4-an-shell` |
| worktree | `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4` |
| tip | `e209898a04` |
| base | STAGE5-01 tip `40563797f7` / docs `750a3f196f` |
| merge/push/install | **No** |

## Option C contract (this slice)

1. Wire **quietEntry** — stream Computer when relevant only:
   - bot using computer (Live + bot lock)
   - user asked (recent Computer/browser/Takeover intent)
   - Live attach offer (`consenting`)
2. **Team card only on real handoffs** (assistant agent switch) — not roster wallpaper
3. Keep professional Conversation (idle stays talk-first)
4. Preserve mode pills, Takeover Hand-back dock, EnginePort, BF honesty

## What shipped

1. `isQuietComputerEntry` / `isBotUsingComputer` / `userAskedComputerFromMessages`
2. `detectTeamHandoff` / `shouldIncludeTeamStreamCard` / `teamHandoffToCard`
3. `buildStreamCards` / `buildContextCards` auto-residency from attach phase + messages
4. `session-layout` passes `computerAttachPhase` + `computerController` + messages (no hard `includeTeam: false`)
5. Consenting Computer card status **Attach offer**; title still **Computer**

## Evidence

| Shot | What |
|------|------|
| `121-stage5-02-conversation-idle-quiet.png` | Idle Conversation — no Computer/Team wallpaper |
| `122-stage5-02-attach-offer-computer-card.png` | Connect → quiet Computer entry |
| `123-stage5-02-takeover-dock-preserved.png` | Takeover Hand-back dock preserved |

Live CDP: `cdp-probe-stage5-02-quiet-entry.mjs` → marker **`AP-STAGE5-02 quiet-entry 1792498041021`** EXIT=0 ws.closed

Board evidence: `business-control/evidence/2026-10-20-ap-stage5-02-quiet-entry-live-dev.txt`

## Tests

`bun test src/shell/an` (+ flows-util) from `packages/app` — **148 pass / 0 fail**

## Preserved

- EnginePort path
- BF Takeover / control-lock honesty
- Three shell modes (`conversation` / `view` / `takeover`)
- STAGE5-01: no dual “Computer View” stream title; View/Takeover suppress stream Computer

## Residuals

- Inline denser preview card not first-class yet
- Scope axis / gold boundary polish still later Stage 5
- Team handoff needs real multi-agent transcript in live session to show card (unit covers detect)
- Independent verifier not run

## Not claimed

- INDEPENDENT PASS
- Stage 5 complete
- merge / push / promote
