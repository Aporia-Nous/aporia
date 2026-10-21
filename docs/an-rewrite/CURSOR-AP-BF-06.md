# AP-BF-06 — Edge/Chrome existing-window tab (spawn only if none)

| Field | Value |
|-------|-------|
| status | **INDEPENDENT PASS** (windowing scope) — **not** Stage 4 complete |
| branch | `stage4-an-shell` |
| tip | `927b414095` (docs sync; code `aef077a496`) |
| code | `aef077a496` |
| base | `c4be6688a8` (AP-BF-05) |
| independent_verify | 2026-10-19 — re-ran shell/an+flows **101** + core **6**; live refuse-second-window + open-tab-existing HTTP 200 `spawned:false`; board evidence `2026-10-19-ap-stage4-17-bf-06-independent-pass.txt` |
| scope | Prefer tab in existing Edge/Chrome window; spawn OS window only when no browser process |
| merge/push | **No** |

Shipped with **AP-STAGE4-17** (Review panel + motion). See `CURSOR-AP-STAGE4-17.md`.

## Policy

| Condition | Action |
|-----------|--------|
| Loopback CDP reachable | `Target.createTarget({ newWindow: false })` — tab in existing window |
| Browser process running, CDP down | **Refuse** second window (honest residual) |
| No browser process | Spawn one window with `--remote-debugging-port` (no `--new-window`) |

## Independent proof (2026-10-19)

- Unit: `computer-external-window.test.ts` — CDP→open-tab-existing; running-without-CDP→refuse; none→spawn; relay maps region.
- Live refuse: STAGE4-17 probe returned `refuse-second-window` when Edge was open without debugging.
- Live open-tab-existing: `POST /__an/computer-cdp/open-tab` → HTTP 200 `ok:true` `spawned:false` (isolated Edge on `:9333`).
- Computer View / Review stay in AnShell.
- Residual OK: packaged relay ownership OPEN; spawn-when-none live optional (unit-covered).
