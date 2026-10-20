# AP-ENGINE-E20 — Global SSE fanout encode-fail blast radius

| Field | Value |
|-------|-------|
| status | **OPEN implemented+live-DEV** (**not** INDEPENDENT PASS; **not** self-PASS; **not** Stage 4 complete; **no** merge/push) |
| branch | `stage4-an-shell` |
| tip | `b48a736f05` |
| code | `7c3aef6cbd` |
| base | `a842027e63` (AP-ENGINE-E22 INDEPENDENT PASS) |
| worktree | `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4` |
| scope | E20 EventFeed encode-fail isolation + optional sessionID/directory subscribe filter + metrics |
| merge/push/install | **No** |

## Intent

Stop one public-event encode defect from clearing **all** SSE subscribers. Keep encode-once fanout. Add optional subscribe query filters without changing the default global stream (EnginePort / E21 reconnect / multi-window).

## What shipped

### `packages/server/src/event-feed.ts`
- On `EncodingError`: log + skip frame; **do not** `subscribers.clear()` / fail other queues.
- Optional per-subscriber `sessionID` / `directory` filter after encode-once (`matchesSubscribeFilter`).
- Global events (no location + no `data.sessionID`) still offered to filtered subscribers (credential/MCP).
- Metrics: `subscribers`, `offers`, `overflowDrops`, `encodeFailures`, `encodeMicros`.
- Stream error type is overflow-only; `EncodingError` retained for logging.

### `packages/server/src/handlers/event.ts` + `packages/protocol/src/groups/event.ts`
- Optional `EventSubscribeQuery` (`sessionID`, `directory`) on `event.subscribe`.
- Handler passes filter into `feed.subscribe(filter)`; omitted query → global stream (unchanged default).
- `server.connected` + 15s heartbeat unchanged.

### Spec
- `specs/v2/event-stream-architecture.md` encoding-failure law updated to E20 skip-not-kill.

## Verification (writer; not independent PASS)

- `bun test` `packages/server/test/event-feed.test.ts` → **9 pass / 0 fail**
- `bun test` `packages/app/src/shell/an` → **118 pass / 0 fail**
- Live CDP `cdp-probe-engine-e20.mjs` (`APORETIC_CDP_PORT=9223`) → RESULT `ok:true` **EXIT=0** marker `AP-ENGINE-E20 send 1792460755145` (ws closed)
  - enginePort=`03`; typed+sendClick; Settings `02` AN-owned; Message Grok…; 4E Contraptions
- Shots: `84`–`86`

## Honest residuals

- Default clients still use global unfiltered SSE (volume reduction only when callers opt into query)
- Generated Promise clients not regenerated this slice (optional query server-side; zero-arg subscribe still works)
- Live DEV binary may still be pre-E20 until hard restart — CDP proves EnginePort/sessions/Settings non-regress
- E25 native compact / E11 left alone
- **Not** claimed: INDEPENDENT PASS; Stage 4/8 PASS; merge; push

## Board

- `AP-ENGINE-E20` → **OPEN implemented+live-DEV** (do not self-PASS)
- Next act-first catalog: E25 / E11 (after independent verifier on E20)
