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
4. **Stream card language:** ~~pure OpenCode only~~ → **Further AP-STAGE4-07** (OPEN for review, **no PASS**): tool/edit parts map to Task/Proof Mission cards when active/completed-edits; inline tools glass-restyled with Task/Proof labels; question→Decision card; session panel void glass; shot `10-conversation-stream-glass.png` (compare `09`). Residual: Session/composer dock still OpenCode-shaped; text turns not card-wrapped; empty session shows Computer+Team only (honest — no invented tools).
5. **Mission header incomplete vs mockup:** ~~missing pills~~ → **Partial**: Local + honest `Private/Efficient/Verified · unavailable` pills under title (overlap fixed AP-STAGE4-07); still no real progress %, Computer-online/Podman strip, or avatar cluster.
6. **Roster footer:** ~~missing~~ → **Partial AP-STAGE4-06**: `+ New teammate` stub (alert only); still no Podman/runtime status card.
7. **Nav icons:** ~~placeholder glyphs (⌂ ▦ ▣ ⚙)~~ → **Partial AP-STAGE4-07**: line SVG icons + stronger gold active punch; not yet full illustrated mockup set.

## Atmosphere / material
8. **Flat void vs cinematic glass:** ~~matte void only~~ → **AP-STAGE4-04 glass** then **feel polish AP-STAGE4-08** (OPEN review, **no PASS**): Ali 2026-10-19 frictionless ice/glass — cooler translucent depth, blur 28/42 + saturate, specular ice edge, softer shadows, mode/rail/card motion; shot `12-ice-glass-feel.png`. Still not photographic nebula underlay (gradients only by design).
9. **Selected roster gold muted:** ~~#aa8d52~~ → **Punch-up AP-STAGE4-07** (token gold `#f0c66d` border + stronger glow; CDP `selectedBorder=rgb(240, 198, 109)`); AP-STAGE4-08 softens punch slightly toward ice-glass (border-strong + softer glow).
10. **Typography:** shell CSS still Segoe UI Variable/system; approved sheet reads more custom/premium.

## What is roughly on-direction
- Far-left AN mark + gold accents on roster/nav selection
- Black/charcoal base close to ink/void tokens
- Interactive Conversation / View / Takeover framing
- Always-on Live computer + Attention rail
- Roster of real bots with gold names
- Mission cards strip (Computer / Team; Task/Proof when session tools present)
- Line nav icons (not emoji clutter)

## Recommended next fix slice
**AP-STAGE4-08 (ice/glass feel) — OPEN for review (2026-10-19):** report `CURSOR-AP-STAGE4-08.md`; shot `12-ice-glass-feel.png`. No independent PASS claimed this slice. Remaining after feel: deeper Session conversation surface vs mockup; Podman/runtime chrome; illustrated nav; Stage 5 four-mode deferred. No merge/push.
