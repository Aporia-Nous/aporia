# AP-STAGE5-01 — Option C structure fix (Computer title + no wallpaper)

| Field | Value |
|-------|-------|
| status | **OPEN implemented+live-DEV** — **not** INDEPENDENT PASS; **not** Stage 5 complete |
| decision | **AP-STAGE5-MODES DONE** — Ali chose **C** (professional app) |
| branch | `stage4-an-shell` |
| worktree | `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4` |
| base | ~`e14194835c` / prior docs HEAD `a9f60150f3` |
| merge/push/install | **No** |

## Option C contract (this slice)

1. Shell modes **only**: Conversation / Computer View / Takeover  
2. Status + Inline = event card densities — **not** modes; Side Panel = Computer View synonym in docs  
3. Kill dual Computer View: stream card title **Computer** (never “Computer View”); one live panel in View  
4. No wallpaper: do **not** always-push Computer+Team into Conversation; Computer when relevant; Team on handoffs only  
5. “dock” = mode-open chrome (Takeover Hand-back) — not permanent Mission stack  
6. Professional: Conversation talk-first when idle  

## What shipped

1. `computerToCard` — default title **Computer**; action **Open in Computer View**  
2. `shouldIncludeComputerStreamCard` — Conversation + (Live / feed / userControl / quietEntry); **never** in View/Takeover  
3. `buildStreamCards` / `buildContextCards` — Computer via residency; `includeTeam` default **false**  
4. `session-layout` — passes `shellMode`; stops ambient Team wallpaper  
5. Tokens comment — Stage 5 modes call C (four-mode rejected)  

## Evidence

| Shot | What |
|------|------|
| `118-stage5-01-conversation-no-wallpaper.png` | Idle Conversation — no Computer/Team cards |
| `119-stage5-01-computer-view-one-panel.png` | View mode — panel “Computer View”; no stream dual title |
| `120-stage5-01-takeover-handback-dock.png` | Takeover Hand-back dock |

Live CDP: `cdp-probe-stage5-01-modes-structure.mjs` → `ok:true` marker **`AP-STAGE5-01 modes-structure 1792497432154`** EXIT=0 ws.closed  

Board evidence: `business-control/evidence/2026-10-20-ap-stage5-01-structure-live-dev.txt`

## Tests

`bun test src/shell/an` (+ flows-util) from `packages/app` — **145 pass / 0 fail**

## Preserved

- EnginePort path  
- BF Takeover / control-lock honesty  
- Stage 4 three-state mode keys (`conversation` / `view` / `takeover`)  

## Residuals

- Inline denser preview card not first-class yet  
- Team handoff → Team card not wired  
- `quietEntry` unused in session-layout (relevant = Live/feed/control)  
- Scope axis / gold boundary polish still later Stage 5  
- Independent verifier not run  

## Not claimed

- INDEPENDENT PASS  
- Stage 5 complete  
- merge / push / promote  
