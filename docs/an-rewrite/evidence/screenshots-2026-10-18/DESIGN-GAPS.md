# Visual deltas vs approved design (honest gap list)

Compared DEV screenshots to:
- aporetic-design-reference/original-normal.png
- aporetic-design-reference/original-view.png
- aporetic-design-reference/original-take.png
- aporetic-design-reference/original-AN-visual-style.png
- tokens in packages/app/src/shell/an/tokens.ts (gold #f0c66d, void #020509, text #f0e6d2)

## Critical / clearly wrong
1. **Composer is navy/indigo, not AN black/gold.** ~~Sampled composer fill ~#121b37~~ → **Addressed AP-STAGE4-03** (after `05-composer-an-tokens-after.png` center `#020509`). OPEN review / PASS recorded separately.
2. **No View / Takeover UI.** ~~Chip label-only~~ → **Addressed AP-STAGE4-04** (**INDEPENDENT PASS** 2026-10-19): interactive Conversation / View / Takeover; layout changes; shots `07-view-mode.png`, `08-takeover-mode.png`; CDP confirms mode/layout flips.
3. **Attention / right rail collapsed.** ~~Width 0 when empty~~ → **Addressed AP-STAGE4-04** (**INDEPENDENT PASS** 2026-10-19): always-on Live computer + Attention with honest empty; shot `06-conversation-glass-rail.png`; CDP attWidth ≥320, no collapse.

## Layout / structure gaps
4. **Stream card language:** ~~pure OpenCode only~~ → **Partially addressed AP-STAGE4-06** (OPEN for review, **no PASS**): glass AN cards Task/Approval/Decision/Proof/Computer/Team implemented; stream shows Computer + Team (and Task when working; Approval when attention open); permission dock → Approval card under AnShell; Attention rail uses Approval cards. Residual OpenCode message/tool/edit chrome still present below/alongside — not fully replaced. Shot `09-conversation-an-cards.png`.
5. **Mission header incomplete vs mockup:** ~~missing pills~~ → **Partial AP-STAGE4-06**: Local + honest `Private/Efficient/Verified · unavailable` pills (no fake telemetry); still no real progress %, Computer-online/Podman strip, or avatar cluster.
6. **Roster footer:** ~~missing~~ → **Partial AP-STAGE4-06**: `+ New teammate` stub (alert only); still no Podman/runtime status card.
7. **Nav icons are placeholder glyphs** (⌂ ▦ ▣ ⚙) vs approved illustrated icon set; gold active punch-up improved in AP-STAGE4-04 but icons still scaffolded.

## Atmosphere / material
8. **Flat void vs cinematic glass:** ~~matte void only~~ → **Addressed for Stage 4 CSS glass (AP-STAGE4-04 PASS)**: translucent panels + blur + radial atmosphere verified live. Still not photographic nebula/landscape underlay from mockup PNGs — gradients only by design (no fake telemetry imagery); optional polish later.
9. **Selected roster gold muted:** ~~#aa8d52~~ → **Punch-up in AP-STAGE4-04** (token gold border + glow). Re-check vs electric gold on review.
10. **Typography:** shell CSS still Segoe UI Variable/system; approved sheet reads more custom/premium.

## What is roughly on-direction
- Far-left AN mark + gold accents on roster selection
- Black/charcoal base close to ink/void tokens
- Interactive Conversation / View / Takeover framing
- Always-on Live computer + Attention rail
- Roster of real bots with gold names
- Mission cards strip (Computer / Team) in Conversation stream

## Recommended next fix slice
**AP-STAGE4-06 (AN card language) — OPEN for review (2026-10-19):** report `CURSOR-AP-STAGE4-06.md`; shot `09-conversation-an-cards.png`. No independent PASS claimed this slice. Remaining: deeper tool-part→card map; Decision/Proof live sources; Podman/runtime chrome; nav icons (#7); Stage 5 four-mode deferred. No merge/push.
