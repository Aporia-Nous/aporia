# AP-MODELS-01b — Free-path default model + product brief tip

**Status:** **OPEN** (writer ready-for-review; leave for independent PASS)  
**Work date / recorded:** 2026-10-21 (America/Chicago)  
**Worktree:** `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4` branch `stage4-an-shell`  
**Base tip before slice:** `b408df0824` (AP-STAGE9-ACCEPT docs tip; Stage 9 ACCEPT complete)  
**Code tip (writer):** `c2e49c773b`  
**Scope:** Free-path default session/teammate model + AnShell empty-state / Settings About free+BYOK product brief. No billing, no OmniRoute, no paid model turns, no Podman install, no design freestyle, no merge/push/install.

## Goal

Close parent `AP-MODELS-01` residuals called out after 01a:

1. Default team/bot model string is a **free-path** OpenCode Free alias (not `deepseek/deepseek-flash`)
2. Aporetic **product brief** of free+BYOK surfaces in AnShell Conversation empty state + Settings → About

## Changes

### Free-path default

- New `packages/app/src/shell/an/models-free-path.ts`
  - `AN_FREE_PATH_DEFAULT_MODEL = "opencode/big-pickle"` (OpenCode Free / keyless Zen alias)
  - `AN_FREE_BYOK_CONVERSATION_EMPTY` / `AN_FREE_BYOK_PRODUCT_BRIEF` honest copy
- `AN_TEAMMATE_DEFAULT_MODEL` → free-path constant
- AnShell `session-layout.tsx` bot open fallback uses constant
- Legacy `aporia/bots.tsx` + `aporia/dispatch.tsx` fallbacks aligned

### Product brief UX

- Conversation empty tip = free+BYOK brief (does not claim Aporetic subsidizes inference)
- Settings → About shows `modelsBrief` via `anSettingsAboutIntro()`

### Tests (author-run)

```text
bun test src/shell/an/models-free-path.test.ts src/shell/an/teammate/lifecycle.test.ts src/shell/an/settings-chrome.test.ts src/providers/catalog/order.test.ts src/runtime/i18n/free-models-honesty.test.ts
→ 13 pass / 0 fail (184 expect)
```

## Explicitly out of scope

- OmniRoute / Stage M / billing / paid provider signup
- Paid model turns (Stop/diff G2/G3)
- Podman install / spawn
- Design freestyle / visual fidelity
- running-DEV proof
- merge / push / install / Stage 10

## Board

- `AP-MODELS-01b` → **OPEN** (ready for independent PASS)
- Parent `AP-MODELS-01` remains **OPEN** until independent PASS + Ali acceptance of residuals
