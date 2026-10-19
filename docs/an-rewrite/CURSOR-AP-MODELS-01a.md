# AP-MODELS-01a — Honest free/BYOK copy + local discoverability

**Status:** **READY FOR REVIEW** (implementation complete; **not** independent PASS) — 2026-10-19  
**Work date / recorded:** 2026-10-19 (America/Chicago)  
**Worktree:** `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4` branch `stage4-an-shell`  
**Base tip before slice:** `4f1fe0fea9` (AP-STAGE4-10 tip)  
**Code commit:** `37e0851fc4`  
**Docs tip:** `fb0058dd99`  
**Scope:** Honest free-model i18n + Ollama/LM Studio discoverability in unpaid picker + Settings popular list. No billing, no OmniRoute, no secrets, no shell/an presence edits, no merge/push.

## Goal

OpenCode-parity free + BYOK UX honesty:

- Free models attributed to **OpenCode** (keyless Zen path), not Aporetic subsidy
- Local path discoverable via **Ollama** / **LM Studio** in unpaid featured + Settings popular
- Paid remains BYOK through existing connect dialogs

## Changes

### i18n honesty

- `dialog.model.unpaid.freeModels.title` in all non-EN app locales: Aporetic/Aporian → **OpenCode** (aligned with `en.ts`)
- EN unchanged: `"Free models provided by OpenCode"` / `"OpenCode Free"`
- New EN keys: `dialog.provider.ollama.note|tagline`, `dialog.provider.lmstudio.note|tagline`

### Discoverability

- `packages/app/src/providers/catalog/order.ts`
  - `popularProviders` includes `ollama`, `lmstudio` (Settings → Providers popular)
  - exported `unpaidFeaturedProviders` includes `ollama`, `lmstudio` after OpenCode entries
- `packages/app/src/providers/models/unpaid.tsx` — uses `unpaidFeaturedProviders`; shows local taglines
- `packages/app/src/settings/providers/providers.tsx` — notes for ollama/lmstudio

### Tests (author-run; not independent PASS)

```text
bun test src/providers/catalog/order.test.ts src/runtime/i18n/free-models-honesty.test.ts
→ 4 pass / 0 fail (135 expect)
```

## Explicitly out of scope

- OmniRoute / Stage M
- Billing / paid provider signup
- Default team bot model string change
- AnShell empty-state tip / product brief UI
- shell/an presence work
- merge / push / install / running-DEV proof
- Independent PASS claim

## Board

- `AP-MODELS-01a` → **OPEN** (ready for review)
- Parent `AP-MODELS-01` remains **OPEN** (parent acceptance not fully closed)
