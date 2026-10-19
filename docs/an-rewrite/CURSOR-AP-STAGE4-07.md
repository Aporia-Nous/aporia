# AP-STAGE4-07 — Reduce residual OpenCode stream feel under AnShell

Work date: October 19, 2026 (America/Chicago). Board task `AP-STAGE4-07`.

## Worktree / branch / HEAD

| item | value |
| --- | --- |
| cwd | `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4` |
| branch | `stage4-an-shell` (continues from AP-STAGE4-06 tip `94d59a79b1`) |
| commit | `b8e2794e7f` — `feat(an-shell): stream part glass + tool to card map (AP-STAGE4-07)` |
| tip | `6311f3a58a` — docs tip after code `b8e2794e7f` |
| ownership | this worktree only — not Stage 0 / not installed Aporetic |
| push / merge | none |
| Stage 4 complete | not claimed |
| independent PASS | **not claimed** — OPEN for review |
| running-DEV | CDP probe + `Page.captureScreenshot` shot `10`; modes left intact |

## Why this slice

Ali: design still in progress; still feels OpenCode. `DESIGN-GAPS.md` #4 residual after AP-STAGE4-06 cards: message/tool/edit chrome + nav glyphs.

## Owned files changed

| file | why |
| --- | --- |
| `packages/app/src/shell/an/cards/map.ts` | `toolPartToCard` / `messagesToPartCards`; buildStreamCards accepts messages |
| `packages/app/src/shell/an/cards/map.test.ts` | tool→Task, edit→Proof, skip quiet reads |
| `packages/app/src/shell/an/cards/types.ts` | sources `edit` / `message` |
| `packages/app/src/shell/an/cards/an-card.css` | glass restyle tools/session panel; hide question header dup |
| `packages/app/src/shell/an/session-layout.tsx` | bind messages into stream cards; SVG nav ids |
| `packages/app/src/shell/an/an-shell.tsx` | SVG nav icons; mission pills under title |
| `packages/app/src/shell/an/an-shell.css` | nav gold punch; roster gold punch; pill layout |
| `packages/app/src/session/requests/session-question-dock.tsx` | AnShell → Decision card + dock options |
| `packages/session-ui/src/components/basic-tool.tsx` | `data-status` / `data-an-part` for AnShell CSS |
| `docs/an-rewrite/CURSOR-AP-STAGE4-07.md` | this report |
| `docs/an-rewrite/evidence/screenshots-2026-10-18/10-conversation-stream-glass.png` | Conversation after |
| `docs/an-rewrite/evidence/screenshots-2026-10-18/DESIGN-GAPS.md` | Gap #4 / #7 status |

## Mapping vs still OpenCode

| surface | mapping |
| --- | --- |
| Active tools (running/streaming/error) | → Task Mission cards (real tool name/detail) |
| Completed edit/write/patch tools | → Proof Mission cards |
| Quiet completed reads | Not duplicated into Mission stack (stay in stream, glass-restyled) |
| Permission dock | Still Approval (STAGE4-06) |
| Question dock | Decision AnCard + interactive options body |
| Inline tool chrome | Glass Task/Proof labels via CSS (`::before`); body stays interactive |
| Session panel | Void glass border/shadow under AnShell |
| Nav | Line SVG icons (not emoji glyphs); active gold punch |
| Roster selection | Stronger gold border/glow |
| Proof with no edits | Mapper `messageProofUnavailableCard` exists; **not** auto-injected (avoid clutter) |

## Still looks OpenCode (honest residual)

- Empty-session **Session** panel / composer chrome still reads as a floating chat dock vs full mockup thread-of-cards.
- Assistant/user **text** turns are restyled lightly, not wrapped as AN cards (correct — conversation prose).
- No live tool/edit in this CDP session → Mission stack shows Computer+Team only (honest).
- Mission pills still stub Private/Efficient/Verified as unavailable.
- Illustrated mockup nav icon set not fully matched (line SVG pass only).
- Typography still Segoe/system.

## Tests

`bun test src/shell/an/` from `packages/app` — **29 pass / 0 fail** (was 26; +3 part-map tests).

## Pixel / CDP evidence

| check | result |
| --- | --- |
| CDP probe | `hasShell`, mode `conversation`, cards Computer+Team, `navSvgCount=4`, `selectedBorder=rgb(240, 198, 109)`, pills Local + 3× unavailable |
| Shot | `10-conversation-stream-glass.png` via CDP `Page.captureScreenshot` (PrintWindow returned black this run) |
| Modes | Conversation unchanged; View/Takeover chrome not intentionally touched |

## Not claimed

independent PASS · Stage 4 complete · merge · push · Stage 8 / running-DEV acceptance · fake tool/Proof invention · full Session panel rewrite
