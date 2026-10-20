# AP-ENGINE-E12 + E14 — Prompt clone skip / attach slice + tool-output byte-first

| Field | Value |
|-------|-------|
| status | **OPEN implemented+live-DEV** (**no** self-PASS / INDEPENDENT PASS) |
| branch | `stage4-an-shell` |
| tip | `d18a68bb93` _(docs tip commit updates)_ |
| code | `d18a68bb93` |
| base | `7b2867c797` (AP-ENGINE-E26 DONE MEASURED) |
| worktree | `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4` |
| scope | E12: skip `structuredClone` when no `session.prompt` hooks; line-range attach without full `split`/`join`. E14: byte-first + newline count before lines[] allocate in tool-output truncate. |
| merge/push/install | **No** |

## Intent

Pass-1 residuals: avoid cloning every prompt for hooks that are not registered; avoid allocating a full lines array before deciding tool-output truncate. Capability-preserving only.

## What shipped

### E12 (`packages/core/src/session/prompt.ts`)
- `hooks.has("session", "prompt")` gates `structuredClone` of prompt + metadata (E06-style).
- Text line-range attachment: `sliceUtf8Lines` single-pass (matches `split.slice.join` semantics) instead of full split/join allocate.

### E14 (`packages/core/src/tool-output.ts`)
- `Buffer.byteLength` + `countLogicalLines` before truncate decision (no `text.split("\n")` on the fit path).
- Truncate path uses `keepPreviewLines` prefix walk under maxLines/maxBytes.

## Writer verification (2026-10-19) — OPEN implemented+live-DEV

- Base `7b2867c797`
- `bun test` packages/core `session-prompt` + `tool-output` + session-owned prompt hooks → pass
- `bun test` packages/app `src/shell/an` → **118** pass / 0 fail
- Live CDP `cdp-probe-engine-e12-e14.mjs` (`APORETIC_CDP_PORT=9223`) → RESULT `ok:true` **EXIT=0** marker `AP-ENGINE-E12-E14 send 1792464278283` (ws closed)
  - enginePort=`03`; Settings `02` AN-owned; Message Grok…; 4E Contraptions
- Shots: `102`–`104`
- Evidence: `business-control/evidence/2026-10-19-ap-engine-e12-e14-live-dev.txt`

## Honest residuals

- **Do not self-PASS** — await independent verifier → INDEPENDENT PASS
- running-DEV may need core reload for in-process prompt/tool-output path (unit is source of truth)
- Full file still read for attachment size/MIME (no FS range API); E12 wins are clone-skip + line-slice allocate
- CDP `markerHit` may prefix-match prior board markers on a crowded stream
- **Not** claimed: INDEPENDENT PASS; Stage 4/8 PASS; merge; push; wall-clock win

## Board

- `AP-ENGINE-E12` / `AP-ENGINE-E14` → **OPEN** implemented+live-DEV
- Await independent verifier
