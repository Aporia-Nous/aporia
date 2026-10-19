# Visual deltas vs approved design (honest gap list)

Compared DEV screenshot 01-conversation-default.png to:
- aporetic-design-reference/original-normal.png
- aporetic-design-reference/original-view.png
- aporetic-design-reference/original-take.png
- aporetic-design-reference/original-AN-visual-style.png
- tokens in packages/app/src/shell/an/tokens.ts (gold #f0c66d, void #020509, text #f0e6d2)

## Critical / clearly wrong
1. **Composer is navy/indigo, not AN black/gold.** Sampled composer fill ~#121b37 / #151e3e (dominant band #101030). Approved input is dark glass with gold send; token void is #020509. Blue/indigo glow is Lagoon-adjacent / leftover OpenCode chrome — wrong vs approved packet.
2. **No View / Takeover UI.** Chip reads “Conversation” only; not clickable; mode forced in code. Approved three-state workflows require distinct View (computer side panel) and Takeover layouts.
3. **Attention / right rail collapsed.** Grid collapses attention column to width 0 when empty. Approved Conversation/View always show a right panel (attention cards, live computer, recent activity). Right strip of DEV shot is near-black empty — missing chrome.

## Layout / structure gaps
4. **Stream is still OpenCode message chrome** (tool edit cards, raw git logs, model footer) — not the approved Task / Approval / Proof / Team / Computer card language.
5. **Mission header incomplete vs mockup:** no progress %, no Local/Private/Efficient/Verified pills, no “Computer online” / Podman status strip, no profile avatar cluster.
6. **Roster footer missing:** no “+ Add a bot”, no Podman/runtime status card at sidebar bottom (approved always shows local runtime widget).
7. **Nav icons are placeholder glyphs** (⌂ ▦ ▣ ⚙) vs approved illustrated icon set; active state uses gold border but overall reads thinner/scaffolded.

## Atmosphere / material
8. **Flat void vs cinematic glass:** approved has landscape/nebula background through translucent panels; DEV is matte #03060b with only a faint radial gold wash — glass/blur present in CSS but not reading as the mockup depth.
9. **Selected roster gold muted:** sampled border ~#aa8d52 vs token #f0c66d — duller, less glow than approved electric gold selection.
10. **Typography:** shell CSS uses Segoe UI Variable/system; approved sheet reads more custom/premium card typography. Brand title gold is present but overall density still “product shell over chat” not “digital card stage.”

## What is roughly on-direction
- Far-left AN mark + gold accents on roster selection
- Black/charcoal base close to ink/void tokens
- Conversation framing label exists (even if non-interactive)
- Roster of real bots with gold names — structure of Bot Team column is the right idea

## Recommended next fix slice (owned, small)
**AP-STAGE4-03 (composer AN tokens) — source + re-screenshot OPEN for review (2026-10-18):** void fill `#020509` applied under AnShell/`an` (after shot `05-composer-an-tokens-after.png`; center sample `#020509` vs before `#121B39`). Not independent PASS. Remaining critical gaps: View/Takeover UI; Attention rail collapsed.

Follow-on (separate owned slices): interactive Conversation/View/Takeover switch; always-visible Attention rail (honest empty state); mission pills/progress when real data exists.
