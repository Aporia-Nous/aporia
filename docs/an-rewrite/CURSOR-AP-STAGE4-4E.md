# AP-STAGE4-4E — Mount Contraptions panel in AnShell

| Field | Value |
|-------|-------|
| status | **INDEPENDENT PASS (Contraptions mount scope)** — verified live; **not** Stage 4 complete |
| branch | `stage4-an-shell` |
| tip | `13a31f0fbd` (docs sync; intermediate `3c42a81c0e`; code `af9ab9943a`) |
| code | `af9ab9943a` |
| verifier | independent re-ran shell/an+flows **41 pass**; live CDP 4E RESULT `ok:true`; STAGE4-12 non-regression RESULT `ok:true` marker `1792414609976` |
| base | `5f810a9d51` (AP-STAGE4-12 tip) |
| worktree | `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4` |
| scope | Mount Contraptions under AnShell chrome (Automations & integrations; Redstone Easter-egg only); keep STAGE4-11 stream + STAGE4-12 composer ownership |
| merge/push/install | **No** |

## What shipped

1. Left nav **Contraptions** item (cog icon) under AnShell.
2. Ice-glass drawer `data-an-part="contraptions"` / `data-component="an-contraptions"` with always-on subtitle **Automations & integrations**; Redstone only on `title` of subtitle span.
3. Body reuses existing `AutomationsTab` → `FlowsSection` + n8n block (engine IDs `flow_*` unchanged).
4. `AN_CONTRAPTIONS_SURFACE` token markers; unit pin that composer `data-an-owned="composer"` is unchanged.

## Files

- `packages/app/src/shell/an/contraptions-panel.tsx` — panel
- `packages/app/src/shell/an/session-layout.tsx` — nav toggle + mount
- `packages/app/src/shell/an/an-shell.tsx` — nav icon + default nav entry
- `packages/app/src/shell/an/an-shell.css` — ice drawer
- `packages/app/src/shell/an/tokens.ts` / `tokens.test.ts` / `index.ts`

## Checks

- Independent re-ran `bun test src/shell/an src/aporia/flows-util.test.ts` → **41 pass / 0 fail**
- Live CDP `cdp-probe-stage4-4e-contraptions.mjs` → RESULT `ok:true` (`mountOk:true`; panel 420×736; subtitle + Redstone title attr)
- Shot: `docs/an-rewrite/evidence/screenshots-2026-10-18/25-contraptions-mounted-dev.png`
- Board copy: `business-control/evidence/2026-10-19-25-contraptions-mounted-dev.png`
- STAGE4-12 CDP non-regression `cdp-probe-stage4-12-composer-after.mjs` → RESULT `ok:true` marker `AP-STAGE4-12 composer 1792414609976`

## Ownership non-regression

- Did **not** modify Conversation stream (`AnConversationStream`) or composer dock ownership CSS/markers.
- Unit test still asserts `AN_COMPOSER_SURFACE.ownedAttr === 'data-an-owned="composer"'`.
- Independent session CDP re-verify: `owned=composer`, `composerOnly`, OpenCode timeline `display:none`, YOU turn visible (STAGE4-11 stream + STAGE4-12 composer intact after Contraptions mount).

## Honest residuals

- Classic `AporiaRightPanel` still not mounted under AnShell (Contraptions is AN-native drawer, not full Details/Library/Browser/Call panel).
- Residual OC chips/mic OK.
- 4F nav-Podman deferred.
- Not Stage 4 complete.

## Board

- `AP-STAGE4-4E` → **INDEPENDENT PASS** (Contraptions mount scope); not Stage 4 complete
- `AP-STAGE4-10` gap closed for AnShell visibility (rename still DONE)
- Evidence: `business-control/evidence/2026-10-19-stage4-4e-independent-pass.txt`
