# Visual deltas vs approved design (honest gap list)

Compared DEV screenshots to:
- aporetic-design-reference/original-normal.png
- aporetic-design-reference/original-view.png
- aporetic-design-reference/original-take.png
- aporetic-design-reference/original-AN-visual-style.png
- tokens in packages/app/src/shell/an/tokens.ts (gold #f0c66d, void #020509, text #f0e6d2)

## Critical / clearly wrong
1. **Composer is navy/indigo, not AN black/gold.** ~~Sampled composer fill ~#121b37~~ → **Addressed AP-STAGE4-03** (after `05-composer-an-tokens-after.png` center `#020509`). OPEN review / PASS recorded separately.
2. **No View / Takeover UI.** ~~Chip label-only~~ → **Addressed AP-STAGE4-04**: interactive Conversation / View / Takeover; layout changes; shots `07-view-mode.png`, `08-takeover-mode.png`. OPEN for review (not PASS).
3. **Attention / right rail collapsed.** ~~Width 0 when empty~~ → **Addressed AP-STAGE4-04**: always-on Live computer + Attention with honest empty; shot `06-conversation-glass-rail.png`. OPEN for review.

## Layout / structure gaps (still open)
4. **Stream is still OpenCode message chrome** (tool edit cards, raw git logs, model footer) — not the approved Task / Approval / Proof / Team / Computer card language.
5. **Mission header incomplete vs mockup:** no progress %, no Local/Private/Efficient/Verified pills (unless real data), no “Computer online” / Podman status strip, no profile avatar cluster.
6. **Roster footer missing:** no “+ Add a bot”, no Podman/runtime status card at sidebar bottom.
7. **Nav icons are placeholder glyphs** (⌂ ▦ ▣ ⚙) vs approved illustrated icon set; gold active punch-up improved in AP-STAGE4-04 but icons still scaffolded.

## Atmosphere / material
8. **Flat void vs cinematic glass:** ~~matte void only~~ → **Partially addressed AP-STAGE4-04** (CSS atmosphere + softer glass). Still not photographic nebula/landscape underlay from mockup PNGs — gradients only by design (no fake telemetry imagery).
9. **Selected roster gold muted:** ~~#aa8d52~~ → **Punch-up in AP-STAGE4-04** (token gold border + glow). Re-check vs electric gold on review.
10. **Typography:** shell CSS still Segoe UI Variable/system; approved sheet reads more custom/premium.

## What is roughly on-direction
- Far-left AN mark + gold accents on roster selection
- Black/charcoal base close to ink/void tokens
- Interactive Conversation / View / Takeover framing
- Always-on Live computer + Attention rail
- Roster of real bots with gold names

## Recommended next fix slice
**AP-STAGE4-04 (glass + rail + three-state) — source + screenshots OPEN for review (2026-10-19):** report `CURSOR-AP-STAGE4-04.md`. Not independent PASS. Remaining: card language (#4), mission/runtime chrome (#5–6), nav icons (#7), photographic atmosphere optional.

Follow-on: Task/Approval/Proof cards; New teammate; Stage 5 four-mode still deferred.
