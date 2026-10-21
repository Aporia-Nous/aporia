# AP-STAGE5-ACCEPT — Option C acceptance (Review-sidebar UX)

| Field | Value |
|-------|-------|
| status | **GATE PASS** — Stage 5 complete = **YES** (technical; accepted residuals) |
| UX authority | STAGE5-08: Conversation primary; Review hosts Computer View; Takeover in-view |
| branch | `stage4-an-shell` |
| worktree | `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4` |
| code tip | `6e73823dc7` (STAGE5-08) |
| docs tip | `96b2dfedac` |
| merge/push/install | **No** |

## Gates

| id | Result |
|----|--------|
| C1 shell + branding | PASS |
| C2 Conversation primary | PASS |
| C3 no peer mode pills | PASS |
| C4 Review hosts Computer View | PASS |
| C5 idle quiet (no wallpaper) | PASS |
| C6 no dual Computer View stream title | PASS |
| C7 live gold + named banner | PASS |
| C8 Pause/Resume without Takeover | PASS |
| C9 Takeover in-view dock | PASS |
| C10 Hand-back keeps primary + Review | PASS |
| C11 CDP isolation | PASS |
| C12 OS-pointer surfaces | PASS |
| C13 EnginePort `03` | PASS |
| C14 shell UX `AP-STAGE5-08` | PASS |
| R1 native capture BLOCKED | acceptable residual |
| R2 global OS hook UNSUPPORTED | acceptable residual |

## Evidence

Live CDP: `cdp-probe-stage5-accept.mjs` → `ok:true` marker **`AP-STAGE5-ACCEPT option-c 1792502317289`** EXIT=0 ws.closed

Units: shell/an + flows-util **170 pass / 0 fail**

Shots: `150`–`155` (idle / Review / live named / pause / takeover / handback)

Board: `business-control/evidence/2026-10-20-ap-stage5-accept-gate.txt`

## Residuals (accepted, not blocking)

- Native OS window capture stays **BLOCKED**
- Global OS pointer hook stays **UNSUPPORTED**

## Not claimed

- merge / push / install / promote
- native capture / global OS hook
- Stage 6–9 / FLOW-GENIUS
