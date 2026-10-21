# AP-STAGE9-01 — Example G + REQUIREMENTS-EVIDENCE reconcile (writer)

| Field | Value |
|-------|-------|
| status | **OPEN** (writer measured — **not** Stage 9 complete; **not** independent PASS) |
| branch | `stage4-an-shell` |
| worktree | `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic-stage4` |
| base | AP-STAGE8-ACCEPT code tip `5bac458f62` / docs `e0dcea9450` |
| code tip (stream crash fix) | *(see HEAD after commit)* |
| marker | `AP-STAGE9-EXAMPLE-G 1792564586730` |
| authority | Ali continue-finish 2026-10-21 (EXCEPT design) |
| merge/push/install | **No** |

## Intent

Run Example G on isolated DEV with honest evidence; reconcile REQUIREMENTS-EVIDENCE A–K; leave independent PASS to a separate verifier.

## Writer-measured Example G

| Check | Result |
|-------|--------|
| G1 existing conversation | **PASS** — AnShell, roster 13, Grok selected, stream+composer |
| G2 Stop control present | OPEN residual — Stop in Takeover/Live (STAGE5-ACCEPT); idle session had none |
| G2 Stop interrupt live | **BLOCKED** — no paid model stream turn |
| G3 live file-edit diff | **BLOCKED** — no paid tool/edit turn |
| G4 draft+IME recover after reload | **PASS** — multiline + composition; `Page.reload` restored draft |

Probe EXIT=0 (`measuredOk` = G1 ∧ G4). Shots `156`–`159`.

## Boot fix (required for Example G)

`conversation-stream.tsx` auto-scroll effect: `void last?.kind === "turn" ? … : last?.card.title` always took the card branch (operator precedence) and threw on turn items → splash stuck. Fixed with parenthesized ternary + `card?.title`.

## Evidence

- `business-control/evidence/2026-10-21-ap-stage9-01-example-g-writer.txt`
- `business-control/evidence/2026-10-21-ap-stage9-handoff-prep.txt` (prior prep)
- `docs/an-rewrite/REQUIREMENTS-EVIDENCE.md` (A–K reconciled; self-checks labelled)
- Probe: `docs/an-rewrite/evidence/cdp-probe-stage9-example-g.mjs`

## Units (writer re-run)

- shell/an + flows-util **190** pass
- a11y+perf **11** pass

## Remaining for Stage 9 complete

1. Independent verifier PASS (read-only) + final receipt DONE/CHANGED/BLOCKED
2. Optional: Stop interrupt + live diff when Ali authorizes a model/tool turn
3. Ali owns install promote (separate)

## Not claimed

- Stage 9 complete / independent PASS
- Full brief-G PASS (Stop interrupt + live diff)
- Visual fidelity / design freestyle
- Merge / push / install / production promote
