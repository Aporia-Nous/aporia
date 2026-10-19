# AP-BF-06 — Edge/Chrome existing-window tab (spawn only if none)

| Field | Value |
|-------|-------|
| status | **OPEN implemented+live-DEV** — **not** INDEPENDENT PASS |
| branch | `stage4-an-shell` |
| tip | `aef077a496` |
| code | `aef077a496` |
| base | `c4be6688a8` (AP-BF-05) |
| scope | Prefer tab in existing Edge/Chrome window; spawn OS window only when no browser process |
| merge/push | **No** |

Shipped with **AP-STAGE4-17** (Review panel + motion). See `CURSOR-AP-STAGE4-17.md`.

## Policy

| Condition | Action |
|-----------|--------|
| Loopback CDP reachable | `Target.createTarget({ newWindow: false })` — tab in existing window |
| Browser process running, CDP down | **Refuse** second window (honest residual) |
| No browser process | Spawn one window with `--remote-debugging-port` (no `--new-window`) |

Live proof: relay returned `refuse-second-window` when Edge was already open without debugging — matches Ali rule. Computer View / Review stay in AnShell.
