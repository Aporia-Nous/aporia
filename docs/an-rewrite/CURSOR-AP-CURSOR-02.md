# AP-CURSOR-02 — bounded Stage 0 S2 implementation report

Work date: October 18, 2026 (America/Chicago). Task file:
`C:/Users/Dilla/OneDrive/Documents/ChatGPT/Aporia Nous/benchmark-stock/CURSOR-IMPLEMENTATION-TASK.txt`
(full file read, including DIRECT USER AUTHORIZATION and STANDING ACCEPTANCE CRITERION).

## Worktree / branch / HEAD

| item | value |
| --- | --- |
| cwd | `C:\Users\Dilla\.cursor\worktrees\opt\cursor-aporetic` |
| branch | `compaction-reclaim-guard` (cut from `cursor-aporetic` @ `0229ce1f2d`) |
| base observed at launch | `0229ce1f2d` (`docs(bench): add phase 1 efficiency audit harness and results`) |
| ownership | this worktree only — not `C:\Tools\aporia` and not `C:\Tools\aporia\.worktrees\opt` |
| push | none |

## Plan / design files actually read or viewed

Read (content):

- `benchmark-stock/CURSOR-IMPLEMENTATION-TASK.txt` (complete)
- `APORETIC-DEV-REWRITE-HANDOFF.md` (sections A–K)
- `APORETIC-DEV-BUILD-LIST.md`
- worktree `docs/an-rewrite/STATUS.md`, `REQUIREMENTS-EVIDENCE.md`
- `benchmark-stock/comparison.md`, `APORETIC-WORK-LOG.md`, `NEXT-STEPS-AND-HANDOFFS.md` (coordination; AP-CURSOR-01 superseded)
- `aporetic-design-reference/README.md`, `manifest-sha256.csv`
- `aporetic-design-reference/aporetic-an-exact-flow-v11-selfcontained.html` (header/structure; raster/hotspot reference, not app code)

Viewed (images via supported image reading):

- `original-AN-visual-style.png`
- `original-three-state-workflows.png`
- `original-normal.png`, `original-view.png`, `original-take.png`

Excluded as required: `replacement-concept-NOT-APPROVED.png`.

### Design-authority reconciliation flags (no visual implementation in this slice)

1. **Modes:** the recovered three-state sheet is Conversation / View / Takeover; the staged build list (Stage 5) requires **four** modes: Status / Inline Preview / Side Panel (View) / Takeover. Later functional requirements override the older three-state count; do not silently collapse to three.
2. **Palette:** a later cached discussion names Lagoon Night (Aporetic) and Marrs Tide (Agora). This task has **no** exact palette approval evidence; do not replace the black/gold reference from the recovered sheets.

## Owned files changed

| file | why |
| --- | --- |
| `packages/core/src/session/compaction.ts` | S2 minimum-reclaim guard inside `due()` |
| `packages/core/test/session-compaction.test.ts` | deterministic S2 regression |
| `docs/an-rewrite/STATUS.md` | S2 PASS (source/unit); remaining Stage 0 gaps |
| `docs/an-rewrite/REQUIREMENTS-EVIDENCE.md` | J row updated |
| `docs/an-rewrite/evidence/2026-10-18-session-suites-s2.txt` | stored suite output |
| `docs/an-rewrite/evidence/2026-10-18-typecheck-s2.txt` | stored typecheck |
| `docs/an-rewrite/CURSOR-AP-CURSOR-02.md` | this report |

## What changed and why

S2 was still open (STATUS + REQUIREMENTS-EVIDENCE). Auto compaction could fire again on the next step after a pass that left almost no headroom under the fire point, wasting model calls without freeing usable context.

`due()` now skips **auto** when:

1. there is a completed checkpoint at the history root, and
2. post-compaction floor (estimated from that checkpoint, capped at current size) leaves less than `min(5_000, 5% of ceiling)` tokens under the ceiling, and
3. growth since that floor is also below that threshold.

Overflow and manual still bypass `due()`. The 5%-of-ceiling cap preserves existing small-window successive-auto behavior (4k compact-model runner test). Keep budget and protected recent-instruction behavior were not touched.

### Standing efficiency note (within this slice)

The guard prevents repeated paid/auto summary requests after a near-zero reclaim. Larger backlog: persist reclaim/retry metrics on the compaction row (helps S3 counters and J’s per-turn retry requirement) without unbounded optimization work here.

## Tests and stored outputs

```
cd packages/core
bun test test/session-compaction.test.ts test/session-runner.test.ts test/session-compact.test.ts test/session-provider-context.test.ts test/session-compaction-transport.test.ts
# Ran 253 tests across 5 files. 253 pass / 0 fail
bun run typecheck
# exit 0
```

Stored: `docs/an-rewrite/evidence/2026-10-18-session-suites-s2.txt`, `docs/an-rewrite/evidence/2026-10-18-typecheck-s2.txt`.

Repair: first suite run had 1 fail (`automatically compacts into a completed summary…`) because a flat 5_000-token threshold blocked small-window auto; fixed by scaling to `min(5_000, 5% of ceiling)`. Second attempt green. No further repairs.

No model/provider calls, benchmarks, network integrations, or new dependencies. `bun install` only restored this worktree’s existing deps so tests could run.

## Commit / checkpoint

Local commit on `compaction-reclaim-guard` after checks (message: `fix(compaction): skip auto after near-zero reclaim`). No push.

## Source proof vs running-DEV proof

| proof | status |
| --- | --- |
| Source / unit (S2 regression + 253 session suite + typecheck) | PASS |
| Running DEV loaded this build | OPEN — deliberately not manufactured (no app restart, no DB mutation) |

## Remaining blockers and next safe slice

No implementation blocker for this slice.

**Next safe slice:** S3 honest UI counters (active context vs cumulative totals) in session-ui footer / Details / compaction row — independent of S4 and of J fixtures 2/3/6. Alternate Stage 0 slice if UI ownership conflicts: J fixture 3 (cancel/error recovery) in `packages/core` only.

## Full-plan completion map (labels only; no invented percentages)

| area | state |
| --- | --- |
| Stage 0 compaction (J) | PARTIAL — keep/preservation + S2 source PASS; S3–S4 + J fixtures 2/3/6 open; running-DEV for S2 open |
| Stage 0a DEV DB isolation | PASS evidence; restart/switch-over caveats remain Ali’s |
| Stage 1 domain model | Independent PASS recorded |
| Stage 2 event/coordinator | Independent PASS recorded |
| Stage 3 attention/trigger/UI | Independent PASS recorded |
| Flow F1 | Closed PASS @ `2a9c5b47ca`; B1–B3 backlog |
| Real-session fact/wake | OPEN (distinct from coordinator PASS) |
| Stage 4 / 4b shell, roster, mission, teammate conversations | OPEN |
| Stage 5 computer modes (four) | OPEN — reconcile with three-state sheet |
| Stage 6 memory/context | OPEN |
| Stage 7 runtime seam | OPEN |
| Stage 8 polish | OPEN |
| Stage 9 independent acceptance; F2–F4 | OPEN |
| Stock auth / matched baseline | RESOLVED / complete — do not rerun |
| Design palette Lagoon Night / Marrs Tide | UNRESOLVED authority — flag only |
| Credentials / prod DB / deploy / Agora / Antigravity / Votel / DNS | out of scope; untouched |

Stop after this bounded slice.
