# AP-MODELS-01a — Honest free/BYOK copy + local discoverability

**Status:** **INDEPENDENT PASS (source/unit)** — 2026-10-19  
**Work date / recorded:** 2026-10-19 (America/Chicago)  
**Worktree:** `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4` branch `stage4-an-shell`  
**Base tip before slice:** `4f1fe0fea9` (AP-STAGE4-10 tip)  
**Code commit:** `37e0851fc4`  
**Docs tip (author):** `fb0058dd99`  
**Author sync tip:** `5691df3ffc` (HEAD at independent review)  
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

### Tests (author-run; re-run by independent verifier)

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

## Independent verification (2026-10-19)

Verdict: **PASS** (honest free-model i18n + local discoverability scope only).

| check | result |
| --- | --- |
| Tip | code `37e0851fc4`; HEAD `5691df3ffc`; base `4f1fe0fea9` (ancestor OK) |
| Author tests re-run | `bun test` order + free-models-honesty → **4 pass / 0 fail** (135 expect) |
| Sampled locales (no Aporetic-provides-free) | en/de/fr/es/ja/zh/ko/ar/ru/br/hi/tr `freeModels.title` all attribute to **OpenCode**; zero leftover Aporetic/Aporian on that key |
| Featured local | `unpaidFeaturedProviders` + `popularProviders` contain `ollama`, `lmstudio` after OpenCode entries |
| Settings notes | `PROVIDER_NOTES` includes ollama/lmstudio keys |
| Billing / OmniRoute | none in code commit; no shell/an presence files touched |
| running-DEV | **not** claimed |
| merge / push | **not** done |

Residual OK (parent / later slices): default session model still not free-path; product-brief / AnShell empty-state tip not this slice.

## Board

- `AP-MODELS-01a` → **DONE** (INDEPENDENT PASS source/unit)
- Parent `AP-MODELS-01` remains **OPEN** (residual: free-path default model + product brief UX; no running-DEV proof)
