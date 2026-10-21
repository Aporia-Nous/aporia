# AP-STAGE6-HOST-DB — built-in DEV-local shared memory

| Field | Value |
|-------|-------|
| status | **IMPLEMENTED + MEASURED** (OPEN for independent PASS) |
| branch | `stage4-an-shell` |
| worktree | `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4` |
| tip / code | `e603321625` |
| base | AP-STAGE6-IJ `301bfa6542` / docs `80f806df0f` |
| merge/push/install | **No** |

## Intent

Ali ACCEPT Stage 6 **and** required shared memory built-in (not unavailable-only stub). Ship Aporetic DEV-local Mnemosyne auto-open for the isolated worktree app. Refuse host `~/.config/opencode/mnemosyne/mnemosyne.db`. No production install, no secrets export.

## What shipped

| Piece | Path |
|-------|------|
| DEV-local file-backed port + product default | `packages/core/src/mission/mnemosyne-port.ts` |
| Map notes (built-in available; host refused) | `packages/core/src/mission/memory.ts` |
| Electron isolated DEV path wire | `packages/desktop/src/main/index.ts` → `userData/mnemosyne/store.json` |
| Units (persist reopen + default available + I-6 inject) | `session-mnemosyne-wire.test.ts`, `session-stage6-i.test.ts`, fold/lean |

## Behavior

- `getDefaultMnemosynePort()` → **available** (built-in).
- Path priority: `APORETIC_MNEMOSYNE_PATH` → `XDG_STATE_HOME/aporetic/mnemosyne/store.json` → `~/.local/share/aporetic-dev/mnemosyne/store.json`.
- Desktop sets `APORETIC_MNEMOSYNE_PATH` under `com.aporianous.desktop.dev` userData after `configureApplication()`.
- `OPENCODE_DB=:memory:` (unit tests) → ephemeral available (no durable file).
- Host opencode `mnemosyne.db` path **refused** (`isForbiddenHostMnemosynePath`).
- I-6 unavailable adapter remains as **explicit inject** (honest omit).

## Writer verification

- `session-mnemosyne-wire` → **9 pass** (includes DEV-local persist + default available)
- `session-stage6-i` → **8 pass**
- `session-mission-fold` → **6 pass**; `session-lean-pack` → **6 pass**
- CE-01/02 → **12 pass**; AnShell tokens → **26 pass**
- Stage 5 UX + CE + FG lean/fold/MnemosynePort stack preserved

## Residuals OK

- UI inspect/search/edit chrome for memory (not this slice)
- Electron DEV kill+relaunch not exercised (I-1 synthetic reopen)
- Host opencode plugin DB / Perseus substrate not adopted (honest refuse)
- Independent PASS for this HOST-DB slice

## Not claimed

- Independent PASS (await verifier)
- Stage 7 / FLOW-GENIUS-05
- Merge / push / install
- Opening host `~/.config/opencode/mnemosyne/mnemosyne.db`
