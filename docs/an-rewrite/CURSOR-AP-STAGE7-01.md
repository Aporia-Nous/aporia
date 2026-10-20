# AP-STAGE7-01 — Isolation runtime seam (honest missing + measured idle/active)

| Field | Value |
|-------|-------|
| status | **IMPLEMENTED + MEASURED** (await independent PASS) |
| branch | `stage4-an-shell` |
| worktree | `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4` |
| tip / code | *(set at commit)* |
| base | AP-STAGE6-EFFICIENCY `c62dbaf22e` / HEAD `12b76b182c` |
| merge/push/install | **No** |

## Intent

Ali `continue` after Stage 6 stack DONE (ACCEPT + HOST-DB + EFFICIENCY). Board Stage 7 from `APORETIC-STAGE-PLAN` + BUILD-LIST Stage 7 / brief F. First slice: product **IsolationRuntimePort** — honest Podman missing, never auto-install, fixture-measured idle/active resource numbers recorded. Preserve Stage 5–6 stack. Do **not** invent Stage 8/9 polish.

## What shipped

| Piece | Path |
|-------|------|
| `IsolationRuntimePort` + fixture + host adapters | `packages/core/src/runtime/isolation-port.ts` |
| Mission re-export | `packages/core/src/mission/index.ts` |
| Units + metrics | `packages/core/test/isolation-runtime-port.test.ts` |
| Chrome measured-line attach (no fake Running) | `packages/app/src/shell/an/podman-chrome.ts` + card |
| Metrics | `business-control/evidence/2026-10-20-ap-stage7-01-metrics.json` |

## Honesty rules (this slice)

1. **Host missing** (this machine: Podman not on PATH): `availability=unavailable`, `measure()=null`, isolation-required `create` → **BLOCKED**, never auto-install.
2. **Host binary present**: still `measure()=null` until a live Podman query/spawn is authorized — **not** inventing idle/active or containers online. Spawn stays **BLOCKED** in 7-01.
3. **Fixture**: deterministic idle → active → idleStop with recorded `cpuMillis` / `memoryBytes` / `activeRuntimes`.
4. **No per-roster warm containers** — only task-scoped create/execute/idleStop.
5. Browser Computer View remains default (`notDefaultComputerView`).

## Writer verification

- `isolation-runtime-port` → **6 pass**
- `podman-chrome` → **8 pass**; AnShell tokens → **26 pass**
- Stage 6 lean/fold/mnemosyne/i → **33 pass**; efficiency → **4**; CE-01/02 → **12**
- Fixture: idleCpuMillis **12** → activeCpuMillis **862**; idle after stop **12**
- Host live Podman: **BLOCKED** (not installed; no unauthorized install)

## Residuals OK

- Host Podman install / machine start / task-scoped spawn — **BLOCKED** without Ali authorization
- Live host idle/active query — not claimed
- Await independent PASS
- Stage 7 overall not complete; Stage 8/9 not started

## Not claimed

- Independent PASS
- Stage 7 complete / Ali ACCEPT
- Host Podman online / Running
- Merge / push / install
- Stage 8 / 9
