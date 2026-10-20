# AP-STAGE7-02 — EnginePort isolation attach + chrome UX

| Field | Value |
|-------|-------|
| status | **OPEN** (writer implemented + measured — await independent PASS; not Stage 7 complete) |
| branch | `stage4-an-shell` |
| worktree | `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4` |
| tip / code | `270a8906a9` |
| base | AP-STAGE7-01 `3cec86376d` / docs prior `63295605b8` |
| merge/push/install | **No** |

## Intent

Ali continue after AP-STAGE7-01 INDEPENDENT PASS. Next Stage 7 slice: attach isolation onto EnginePort and wire AnShell Podman chrome refresh through that attach — honest missing, measured line only when `measure()` returns a snapshot, never auto-install / fake Running. Host Podman spawn stays **BLOCKED** (not on PATH; no unauthorized install). Preserve Stage 5–6. Do **not** invent Stage 8/9.

## What shipped

| Piece | Path |
|-------|------|
| `EngineIsolationAttach` + host/fixture factories + chrome helpers | `packages/app/src/shell/an/engine/isolation-attach.ts` |
| Optional `EnginePort.isolation` | `packages/app/src/shell/an/engine/types.ts` + `oc-server-port.ts` |
| AnShell host attach + which-cache refresh | `packages/app/src/shell/an/session-layout.tsx` |
| Units + metrics | `packages/app/src/shell/an/engine/isolation-attach.test.ts` |
| Metrics | `business-control/evidence/2026-10-20-ap-stage7-02-metrics.json` |

## Honesty rules (this slice)

1. **Host missing** (this machine: Podman not on PATH): attach `availability=unavailable`, `measure()=null`, isolation-required create **BLOCKED**, chrome no measured line, never auto-install.
2. **Host binary present**: still `measure()=null`; spawn **BLOCKED** — not inventing containers online. Title stays `Podman · installed`, never Running.
3. **Fixture attach**: deterministic idle → active → idleStop via EnginePort; chrome measured-line only when which present + measure snapshot.
4. App cannot import `@opencode/core` — attach shape kept aligned with STAGE7-01 `IsolationRuntimePort`.
5. Browser Computer View remains default.

## Writer verification

- `isolation-attach` → **6 pass**
- `podman-chrome` → **8 pass**; AnShell tokens → **26 pass**
- shell/an + flows-util → **179 pass** (Stage 5 non-regress + STAGE7-02)
- Stage 7-01 `isolation-runtime-port` → **6 pass** (preserved)
- Stage 6 lean/fold/mnemosyne/i → **29 pass**; efficiency → **4**; CE-01/02 → **12**; J → **3+1**
- Fixture via EnginePort: idleCpuMillis **12** → activeCpuMillis **862**; idle after stop **12**
- Host live Podman: **BLOCKED** (not installed; no unauthorized install)

## Residuals OK

- Host Podman install / machine start / task-scoped spawn / live host measure — **BLOCKED** without Ali authorization
- Independent PASS for this slice — pending
- Stage 7 overall not complete; Stage 8/9 not started

## Not claimed

- Stage 7 complete / Ali ACCEPT
- Host Podman online / Running / live idle-active
- Merge / push / install
- Stage 8 / 9
- Independent PASS (writer only)
