# AP-ENGINE-E25 + AP-ENGINE-E11 — Native retain skip reload + provider-context sanitize

| Field | Value |
|-------|-------|
| status | **INDEPENDENT PASS** (**no** merge/push; **not** Stage 4/8 PASS) |
| branch | `stage4-an-shell` |
| tip | `8d2317def56f3dfd903dfea3a1571baad90e1466` |
| code | `377670f168` |
| base | `1606bc7af9` (AP-ENGINE-E20 INDEPENDENT PASS) |
| worktree | `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4` |
| scope | E25 skip/reuse `SessionHistory.load` on native trigger retain; E11 `jsonSanitize` without stringify→decode |
| merge/push/install | **No** |

## Intent

Cut mid-path native-compaction tax: do not reload full local history when `context.messages` already exposes real users; stop provider-context encode from double-parsing large replacement windows via JSON string round-trip. Preserve keep-window, provenance, encrypted replay, summary path, EnginePort send/stream.

## What shipped

### E25 — `packages/core/src/session/compaction.ts`
- `needsLocalHistoryForNativeRetain(messages)` — true only when a native checkpoint is already in the loaded view.
- Trigger-mechanism `compactNatively`: reuse `context.messages` when false; `SessionHistory.load(..., "local")` only when true (checkpoint would hide earlier real users).
- Endpoint mechanism + summarize path unchanged.

### E11 — `packages/core/src/session/provider-context.ts`
- `jsonSanitize` walk: omit undefined keys, undefined array slots → null, invoke `toJSON` (Media.Asset → base64), Date → ISO.
- `encode` uses `Schema.decodeUnknownSync(Schema.Json)(jsonSanitize(replacement))` — no `JSON.stringify` + `Schema.fromJsonString` round-trip.

### Tests / probe
- Native: E25 unit + existing live trigger/endpoint retain fixtures.
- Provider-context: E11 encode equals prior stringify sanitize; media/optional-metadata fixtures kept.
- CDP: `cdp-probe-engine-e25-e11.mjs` shots 87–89.

## Independent verification (2026-10-19) — INDEPENDENT PASS

- HEAD `8d2317def5` verified; code `377670f168` + base `1606bc7af9` ancestors
- Source bar confirmed: `needsLocalHistoryForNativeRetain` / reuse `context.messages`; `jsonSanitize` + `Schema.Json` (no stringify→fromJsonString on encode)
- `bun test` packages/core `session-provider-context` + `session-native-compaction` → **16 pass / 0 fail**
- `bun test` packages/app `src/shell/an` → **118 pass / 0 fail**
- Live CDP `cdp-probe-engine-e25-e11.mjs` (`APORETIC_CDP_PORT=9223`) → RESULT `ok:true` **EXIT=0** marker `AP-ENGINE-E25-E11 send 1792461578667` (ws closed)
  - enginePort=`03`; typed+sendClick; Settings `02` AN-owned; Message Grok…; 4E Contraptions
- Shots: `87`–`89` (re-shot; board copies under `business-control/evidence/`)
- Evidence: `business-control/evidence/2026-10-19-ap-engine-e25-e11-independent-pass.txt`

## Honest residuals

- After a prior native checkpoint, local reload still required (correctness — provenance-bound context hides earlier users)
- Live DEV binary may still be pre-E25/E11 until hard restart — CDP proves EnginePort/sessions non-regress
- CDP `markerHit` may prefix-match prior board markers on a crowded stream; typed+sendClick+RESULT still met bar
- Pass-2 residual after top-5 act-first: E27 / E23 / E24 / E08 / E26 / E12 / E14
- **Not** claimed: Stage 4/8 PASS; merge; push

## Board

- `AP-ENGINE-E25` + `AP-ENGINE-E11` → **DONE** INDEPENDENT PASS
- Completes pass-2 top-5 act-first after E21 / E22 / E20
