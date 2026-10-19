# AP-STAGE4-16 — Ice material punch (frosted glass vs opaque charcoal)

| Field | Value |
|-------|-------|
| status | **OPEN implemented+live-DEV** — **not** INDEPENDENT PASS; **not** Stage 4 complete |
| branch | `stage4-an-shell` |
| tip | `f153ce1936` (code; docs tip may follow) |
| code | `f153ce1936` |
| base | `5167449bd7` (AP-STAGE4-15 INDEPENDENT PASS tip) |
| worktree | `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4` |
| scope | Design-audit high: stronger blur / translucency / specular on AnShell panels, composer dock, Contraptions drawer — match approved AN ice-glass (not OpenCode void charcoal) |
| merge/push/install | **No** |
| cards-in-stream | Untouched (STAGE4-15 PASS retained) |

## Why

STAGE4-08/09 residual: ice translucency subtle on void; live UI still read as opaque charcoal + gold hairlines. Ali / design-audit: punch ice so AnShell reads frosted glass.

## What shipped

1. `packages/ui/src/styles/tokens/an.css` — panel α 0.28 / raised 0.36 / glass 0.2; blur 40 / strong 64; saturate 1.32; ice sheen/edge + stronger specular.
2. `tokens.ts` + `AN_ICE_MATERIAL` marker; tests assert punch + composer void/gold ownership retained.
3. `an-shell.css` — atmosphere ice/gold blooms; Contraptions drawer 0.38/0.52 (was 0.72/0.88 charcoal); session/composer docks punched; YOU-turn ice.
4. `an-card.css` — card glass fallbacks match punch.

## Evidence

| Shot | What |
|------|------|
| `51-before-ice-punch-reload.png` | Reload capture |
| `52-ice-punch-conversation.png` | Conversation ice + owned composer |
| `53-ice-punch-contraptions.png` | Frosted Contraptions drawer blur 64 |
| `54-ice-punch-computer-view.png` | Computer View rails |
| `55-ice-punch-conversation-final.png` | Back to Conversation |

Live CDP: `cdp-probe-stage4-16-ice-punch.mjs` → RESULT `ok:true` marker `AP-STAGE4-16 ice-punch 1792420030131`  
- `--an-blur=40px` / `--an-blur-strong=64px` / saturate 1.32  
- panel α 0.28 / raised 0.36 / sheen 0.14 / edge 0.28  
- roster/nav/card/dock backdrop blur live; composer void `#020509`; gold `#f0c66d`  
- Contraptions drawer `iceDrawer:true` blur 64; bg α 0.38→0.52 (not 0.72/0.88)  
- ownership: `data-an-owned=composer`; timeline `none`; missionCompact; stream cards computer+team

## Tests

`bun test src/shell/an src/aporia/flows-util.test.ts` — **86 pass / 0 fail**.

## Non-regression (live CDP)

- STAGE4-12 → `ok:true` marker `AP-STAGE4-12 composer 1792420048328`
- STAGE4-13 → `ok:true` marker `AP-STAGE4-13 chrome 1792420049489`
- STAGE4-15 → `ok:true` marker `AP-STAGE4-15 cards-in-stream 1792420059078`
- STAGE4-14 presence → `ok:true` marker `AP-STAGE4-14 presence 1792420090516` (13 Listening / 0 Unknown)
- 4E → first toggle-flake `ok:false`; re-run `ok:true` mountOk
- BF-01 → `ok:true` marker `AP-BF-01 attach 1792420059040`

## Honest residuals

- Frost still subtle on near-void underlays (backdrop needs depth behind panels); token+CSS+drawer over content verified.
- Photographic mockup nebula underlay still not shipped (gradients only; no purple/nebula AI-slop).
- BF-05 / CE-01 / 4F left alone.
- **Not** INDEPENDENT PASS (board OPEN implemented+live-DEV). Not Stage 4 complete. No merge/push.

## Not claimed

INDEPENDENT PASS · Stage 4 complete · merge · push · Stage 8 · OpenCode fully replaced
