# AP-STAGE4-12 — AnShell owns composer dock presentation

| Field | Value |
|-------|-------|
| status | **INDEPENDENT PASS (composer-own scope)** — vertical slice verified live; **not** Stage 4 complete; OpenCode not fully replaced |
| branch | `stage4-an-shell` |
| tip | `5f810a9d51` (code `cf083186a3`; docs intermediate `bc0acb4ca8`) |
| code | `cf083186a3` |
| verifier | independent re-ran shell/an **36 pass**; live CDP RESULT `ok:true` (marker `1792414064184`); shots `21`–`24` YOU visible; panel passthrough + dock ice |
| worktree | `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4` |
| base | `799f176044` (AP-STAGE4-11 tip) |
| scope | AnShell owns composer dock presentation; suppress residual OpenCode panel chrome fighting AN; keep send/session wiring to core |
| running-DEV | ACTIVE (watch-as-you-build CDP); running ≠ PASS |
| merge/push/install | **No** |

## Architecture choice

**Own the composer dock like Conversation owns the stream** — presentation only:

1. Mark dock `data-an-owned="composer"` on `SessionComposerRegion` (core Prompt/submit unchanged).
2. Under `.an-stream-legacy--composer-only`, make `SessionPanelFrame` a **passthrough** host (no ice, no raised shadow, no settle animation).
3. Put the single void/gold ice surface + `an-dock-settle` on the AN-owned composer dock.
4. Quiet OC toolbar chip/mic plastic; mute disabled-send white-ring; keep Enter/send wired to core.
5. No new polling layers.

Home / draft (not composer-only) keeps prior ice strip behavior.

## Evidence (watch-as-you-build)

| Shot | What you see |
|------|----------------|
| `21-before-composer-own.png` | Before: SessionPanelFrame ice + dock strip nested (double OC/AN fight); void/gold composer already present |
| `22-after-composer-own.png` | After: panel passthrough; single ice dock `data-an-owned="composer"` radius 18 / blur 42 / settle |
| `23-composer-typed.png` | Marker typed in AN-owned composer |
| `24-after-send-visible.png` | **Proof:** YOU turn `AP-STAGE4-12 composer …` visible; timeline `display:none`; conv ~328px |

CDP probes:

- `docs/an-rewrite/evidence/cdp-probe-stage4-12-composer-before.mjs`
- `docs/an-rewrite/evidence/cdp-probe-stage4-12-composer-after.mjs` → RESULT `ok: true` (executor marker `1792413819698`; independent re-run marker `1792414064184`)

## Tests

`bun test src/shell/an` from `packages/app` — **36 pass** (includes AP-STAGE4-12 owned-marker test). Independent verifier re-ran **36 pass**.

## Honest residual OpenCode / wrapper jank (not done)

- Model / agent chips + mic / voice-call controls still OpenCode controls (AN-colored, not AN-native widgets).
- Nested void input inside ice dock (soft nesting; not a second raised OC panel).
- Mission Computer/Team cards still sit above Conversation (capped; not mockup-tight).
- Assistant markdown / rich parts still plain text in AN turns.
- Contraptions panel / 4E–4F deferred.
- OpenCode not fully replaced.

## Not claimed

- Stage 4 complete
- OpenCode fully replaced
- running-DEV acceptance PASS / Stage 8 PASS
- Install merge / push / promote
