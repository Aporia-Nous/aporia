# AP-ENGINE-E21 + AP-ENGINE-PORT-03 — Reconnect sync storm + dual-sync shrink

| Field | Value |
|-------|-------|
| status | **OPEN implemented+live-DEV** (NOT INDEPENDENT PASS; NOT self-PASS; **not** Stage 4 complete) |
| branch | `stage4-an-shell` |
| tip | *(set after docs sync)* |
| code | *(set after code commit)* |
| base | `741abaa063` (AP-ENGINE-PORT-02 INDEPENDENT PASS) |
| worktree | `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4` |
| scope | E21 SSE reconnect backoff + pinned-only reconnect sync + coalesced bootstrap; PORT-03 EnginePort single session-event writer / dual-sync shrink |
| merge/push/install | **No** |

## Intent

Kill client reconnect → full bootstrap + all-directory sync storms (E21), paired with EnginePort PORT-03 single writer / less dual sync-poll under AnShell.

## What shipped

### E21 — reconnect path
- `packages/client/src/solid/connection.ts`: exponential reconnect backoff with jitter after attempt ≥ 2 (cap 15s); forced resync still immediate; first wait remains 1s.
- `packages/app/src/runtime/server/server-sync/connection.ts`: `reconnectSyncDirectories` (reconnect → pinned/held only); `createCoalescedRunner` + 300ms bootstrap debounce.
- `packages/app/src/runtime/server/sync.tsx`: on reconnect schedule coalesced bootstrap; queue only pinned dirs; first-connect unchanged.
- `packages/app/src/runtime/server/global-sync/queue.ts`: document coalescing; optional concurrency.

### PORT-03 — EnginePort dual-sync shrink
- `EnginePort.subscribe` required; `observeServerEvent` forwards **coarse** session events only (skips `.delta` / `.progress` / `.streamed` — avoids OOM).
- AnShell `session-layout` forwards OC bus → `observeServerEvent`; stream UI still tracks solid Data via `listMessages`.
- Session shell marker `data-an-engine-port="03"` (`AN_ENGINE_PORT`); Settings remains `"02"`.

## Writer verification (2026-10-19)

- `bun test` client solid-connection + app server-sync/queue + `src/shell/an` → **118 pass / 0 fail**
- Live CDP `cdp-probe-engine-e21-port-03.mjs` (`APORETIC_CDP_PORT=9223`) → RESULT `ok:true` **EXIT=0** marker `AP-ENGINE-E21-PORT-03 send 1792459569747`
  - enginePort=`03`; send → YOU; Settings `02` non-regress; Message Grok…; 4E Contraptions; ws closed
- Shots: `78`–`80` under `docs/an-rewrite/evidence/screenshots-2026-10-18/`

## Honest residuals

- E20 SSE fanout / E22 MCP reload left alone
- First-connect still bootstraps + queues all active dirs (by design)
- Reconnect with zero pinned dirs syncs none until access (child-store onBootstrap)
- Durable aggregate-seq replay still unavailable on volatile SSE (no Last-Event-ID)
- Attention poll (5s) and classic non-AnShell paths unchanged
- **Not** claimed: INDEPENDENT PASS; Stage 4 complete; merge/push

## Board

- `AP-ENGINE-E21` + `AP-ENGINE-PORT-03` → **OPEN implemented+live-DEV** (await independent verifier)
- Next act-first catalog: E22 / E20 / E25 / E11
