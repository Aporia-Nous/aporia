# AP-ENGINE-E27 — Bus durable notify outside aggregate lock

| Field | Value |
|-------|-------|
| status | **OPEN implemented+live-DEV** (**not** INDEPENDENT PASS; **no** self-PASS; **no** merge/push) |
| branch | `stage4-an-shell` |
| tip | `5cb5d82d6d` |
| code | `3aad10e48c` |
| base | `8d2317def5` (AP-ENGINE-E25 + E11 INDEPENDENT PASS) |
| worktree | `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4` |
| scope | E27: durable commit under `durableLocks`; listener/SSE notify on separate per-aggregate `notifyLocks` |
| merge/push/install | **No** |

## Intent

Stop slow `bus.listen` subscribers (EventFeed offer loop) from extending per-session durable write serialization. Preserve notify order per aggregate, projector/commit atomicity, durable wake before notify, publishAll batch atomicity, EnginePort send/stream.

## What shipped

### `packages/core/src/bus.ts`
- `notifyLocks` KeyedMutex parallel to `durableLocks`.
- `notifyDurable(aggregateID, events)` — serial notify outside durable write lock.
- `publish` / `publishAll` / `replay({ publish })`: commit + durable wake under `durableLocks`; then `notifyDurable`.
- Ephemeral path unchanged (notify without durable lock).

### Tests / probe
- Unit: concurrent durable publish commits while prior listener still blocked; batch non-interleave retained.
- CDP: `cdp-probe-engine-e27.mjs` shots 90–92.

## Writer verification (2026-10-19) — not INDEPENDENT PASS

- `bun test` packages/core `test/bus.test.ts` → **54 pass / 0 fail**
- `bun test` packages/app `src/shell/an` → **118 pass / 0 fail**
- Live CDP `cdp-probe-engine-e27.mjs` (`APORETIC_CDP_PORT=9223`) → RESULT `ok:true` **EXIT=0** marker `AP-ENGINE-E27 send 1792461898423` (ws closed)
  - enginePort=`03`; typed+sendClick; Settings `02` AN-owned; Message Grok…; 4E Contraptions
- Shots: `90`–`92`

## Honest residuals

- Listener notify still serial per aggregate (`notifyLocks`) — only write lock released; publish() callers still await notify
- E23 multi-session SQLite stress / measure left alone (M effort)
- E24 overflow classification left alone
- Live DEV binary may still be pre-E27 until hard restart — CDP proves EnginePort/sessions non-regress
- CDP `markerHit` may prefix-match prior board markers on a crowded stream
- **Not** claimed: INDEPENDENT PASS; Stage 4/8 PASS; merge; push

## Board

- `AP-ENGINE-E27` → **OPEN** implemented+live-DEV (await independent verifier)
- Left alone: E23, E24
