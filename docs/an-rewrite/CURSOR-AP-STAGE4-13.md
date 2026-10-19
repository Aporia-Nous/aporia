# AP-STAGE4-13 — AN composer chrome (chips/mic/call → AN)

| Field | Value |
|-------|-------|
| status | **OPEN (implemented + live-DEV)** — **not** INDEPENDENT PASS; **not** Stage 4 complete |
| branch | `stage4-an-shell` |
| tip | `17762b3fe7` |
| code | `17762b3fe7` |
| base | `a8437782b3` (AP-BF-04 tip) |
| worktree | `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4` |
| scope | Residual OC model/agent chips + mic/call → AN companion strip; placeholder `Message {bot}…`; keep gold send; preserve STAGE4-12 `data-an-owned=composer` |
| merge/push/install | **No** |

## What shipped

1. `AN_COMPOSER_SURFACE` STAGE4-13 pins: `hideOcChips`, `hideMicCall`, `keepGoldSend`, `placeholderTemplate: "Message {bot}…"`.
2. `composer-chrome.ts` — bot label + placeholder helpers; owned-host detector.
3. CSS under owned dock: hide `[data-slot="composer-controls"]`, model action, mic/call inject; soft AN placeholder tone.
4. `createComposerModel` placeholder uses AN text when AnShell owns composer.
5. AnShellHosts no longer mounts `ComposerMic`; dictation inject skips AnShell.
6. STAGE4-12 ownership marker unchanged.

## Evidence (watch-as-you-build)

| Shot | What you see |
|------|----------------|
| `39-before-composer-chrome.png` | Session with AN-owned dock |
| `40-composer-chrome-an.png` | **Proof:** placeholder `Message Grok…`; no OC chips/mic/call; gold send |
| `41-composer-chrome-typed.png` | Marker typed |
| `42-after-send-composer-chrome.png` | YOU turn visible; timeline `none` |

CDP: `cdp-probe-stage4-13-composer-chrome.mjs` → RESULT `ok:true` marker `AP-STAGE4-13 chrome 1792417797912`.

## Tests

`bun test src/shell/an src/aporia/flows-util.test.ts` from `packages/app` — **79 pass / 0 fail**.

## Non-regression (live CDP)

- STAGE4-12 composer → RESULT `ok:true` marker `1792417808624`
- 4E Contraptions → RESULT `ok:true` (`mountOk` + `ownershipOk`)
- BF-01 attach → RESULT `ok:true` marker `1792417832789` (`composerOwned` + `streamOwned`)

## Honest residuals

- Model/agent selection still reachable via settings/commands — not AN-native widgets in composer (hidden, not redesigned).
- Attach `+` remains (not OC product chip strip).
- Mission cards above Conversation still not mockup-tight in-stream.
- Presence Unknown / ice subtle / Stage 5 3-vs-4 still OPEN.
- BF-05 / CE-01 left alone.

## Not claimed

- INDEPENDENT PASS
- Stage 4 complete
- OpenCode fully replaced
- merge / push / promote
