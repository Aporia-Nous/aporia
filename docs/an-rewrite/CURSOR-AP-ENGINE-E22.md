# AP-ENGINE-E22 — MCP ToolsChanged → smarter tools.reload coalesce

| Field | Value |
|-------|-------|
| status | **OPEN implemented+live-DEV** (**not** INDEPENDENT PASS; **not** self-PASS; **not** Stage 4 complete; **no** merge/push) |
| branch | `stage4-an-shell` |
| tip | `0acec036ff` |
| code | `2bd8664241` |
| base | `0550905a33` (AP-ENGINE-E21 + PORT-03 INDEPENDENT PASS) |
| worktree | `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4` |
| scope | E22 MCP ToolsChanged debounce/coalesce + fingerprint-gated reload + recover storm cap |
| merge/push/install | **No** |

## Intent

Stop MCP list-changed / session-recover / multi-server announce bursts from forcing a full `tools.reload()` (and E01 select-cache invalidate) when the catalog fingerprint is unchanged. Raise debounce; coalesce servers; cap recover fail loops.

## What shipped

### `packages/core/src/tool/mcp.ts`
- Debounce **400ms** (was 100ms) via `RECONCILE_DEBOUNCE`.
- Coalesce: accumulate `ToolsChanged` server names into `pendingServers`; one sliding wakeup → one reconcile.
- `catalogFingerprint` (sha1 of sorted server/name/description/codemode/schemas); skip `tools.reload()` when unchanged → no revision bump.
- First `flush` registration unchanged (permission names + execute path intact).

### `packages/core/src/mcp/index.ts`
- Recover storm cap: **2 failures / 30s** → surface `failed` status, stop auto-retry (`recoverCapped` / `noteRecoverFailure`); `onSessionExpired` respects cap.
- Successful recover clears storm tracker; left alone: OAuth Credential.Switched path, Code Mode flags, `onClose` no auto-restart.

## Writer verification (2026-10-19) — not INDEPENDENT PASS

- `bun test` packages/core MCP suites → **111 pass / 1 skip / 0 fail** (includes E22 fingerprint + multi-server coalesce + existing coalesce/plugin-transform)
- `bun test` packages/app `src/shell/an` → **118 pass / 0 fail**
- Live CDP `cdp-probe-engine-e22.mjs` (`APORETIC_CDP_PORT=9223`) → RESULT `ok:true` **EXIT=0** marker `AP-ENGINE-E22 send 1792460226301` (ws closed)
  - enginePort=`03`; send → YOU; Settings `02` AN-owned; Message Grok…; 4E Contraptions
- Shots: `81`–`83`

## Honest residuals

- True per-server incremental editor mutate left as future (fingerprint gate + full-catalog reload still correct when defs change)
- E20 SSE fanout / E25 native compact / E11 left alone
- Running-DEV may still be on prior binary until hard restart picks up core tip — CDP proves EnginePort/sessions/Settings/BYOK path non-regress
- **Not** claimed: INDEPENDENT PASS; self-PASS; merge; push; Stage 4/8 PASS

## Board

- `AP-ENGINE-E22` → **OPEN** implemented+live-DEV (await independent verifier)
- Next act-first catalog: E20 / E25 / E11
