# AP-STAGE4-05 — Product branding: Aporetic (by Aporia Nous)

Work date: October 19, 2026 (America/Chicago). Board task `AP-STAGE4-05`.

## Worktree / branch

| item | value |
| --- | --- |
| cwd | `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4` |
| branch | `stage4-an-shell` |
| commit | `584fcda036` — `fix(an-shell): product name Aporetic (AP-STAGE4-05)` |
| tip | `b758f70ed3` — docs tip after code |
| ownership | this worktree only — not Stage 0 / not installed Aporetic |
| push / merge | none |
| Stage 4 complete | not claimed |
| independent PASS | not claimed — OPEN for review |

## Authority

Ali correction (2026-10-19): **app product name is Aporetic**, not “Aporia Nous”. Tagline/ownership form: **Aporetic by Aporia Nous**. Aporia Nous is the company/brand; Aporetic is the app.

## What changed

| file | change |
| --- | --- |
| `packages/app/src/shell/an/tokens.ts` | `AN_PRODUCT_NAME` / `AN_PRODUCT_BYLINE` constants |
| `packages/app/src/shell/an/an-shell.tsx` | Nav mark tooltip + roster header default **Aporetic** (was “Aporia Nous”) |
| `packages/app/src/shell/an/types.ts` | Comment: brandTitle = product name |
| `packages/app/src/shell/an/index.ts` | Export naming constants |
| `packages/app/src/shell/an/tokens.test.ts` | Pin product ≠ company name |

## Already correct (left alone)

- Window title / tray / `APP_NAME`: **Aporetic** (`packages/desktop`)
- Settings mark: **Aporetic** + `by Aporia Nous` byline
- Metainfo summary: `Aporetic by Aporia Nous`
- Electron `productName`: Aporetic; publisher display **Aporia Nous** (company — intentional)

## Intentionally still “Aporia Nous” (company)

- Vault category `"Aporia Nous"`
- Electron publisher / MSIX `CN=Aporia Nous` / `publisherDisplayName`
- `package.json` author name
- Bot prompt company context; domain/bundle ids `com.aporianous.*`
- Workspace/folder paths named for the company

## Tests

`bun test packages/app/src/shell/an/tokens.test.ts` — product-name pin + existing Stage 4 token tests.

## Not claimed

independent PASS · running-DEV acceptance · merge · push · Stage 4 complete · monorepo/company folder rename
