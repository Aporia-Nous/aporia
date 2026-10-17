# Stage 3 — coordinator trigger, durable attention cards, attention UI

Branch `an/stage-3-coordinator`, cut from the Stage 2 tip `e922ab3972` (which sits one docs commit above the rollback tag
`an/checkpoint-pre-stage3` = `032825e677`). Local only: nothing is pushed, the installed app and port 4096 are not touched,
and every Dev check runs against `opencode-aporia-dev.db` through the Dev app (`run-dev-isolated.cmd`).

Stage 2 left three honest gaps (STATUS.md → Stage 2 → Limitations): nothing in the app calls `Coordinator.drain`, an
attention item is a log row that nobody can see, and nobody can say "dealt with it". Stage 3 closes exactly those three.

## Design in one paragraph

A **trigger** node runs inside the server process (core side, never in a renderer): it drains once at boot, which is the
crash recovery, then checks every 2 s whether the log is ahead of the coordinator cursor and drains only then. A **card** is
not a new table: it is a `coordination.attention` event, and resolving it appends one `attention.resolved` event (actor
`user`, idempotency key `resolve:<card id>`). Card state is folded from the log exactly like a coordination thread, so a
restart needs no repair and cannot drift. `attention.resolved` is an outcome: `decide` returns nothing for it, so resolving a
card can never wake anyone. Three routes expose it (`GET /api/mission/attention`, `POST /api/mission/attention/:cardID/resolve`,
`POST /api/mission/coordinator/drain`) behind the server's existing authorization middleware, and the Aporetic top bar gets an
**Attention** button with a count badge and a panel of open cards, each with a Resolve button.

## Acceptance criteria

| id | criterion | how it is proven |
| - | - | - |
| S3-1 | The running server drains without anyone calling `drain`: once at boot, then whenever the log is ahead of the cursor (poll ≤ 2 s). A failing drain is logged and retried on the next tick; the loop never dies. | core test: a fact appended without handling is handled after the clock advances, with no `drain` call; Dev: a fact written by a separate process is handled by the Dev server (cursor moves, card appears) |
| S3-2 | Cards are durable: an open card is still open after a restart, and a resolved card is still resolved after a restart. No new table, no migration. | core test on a file database across three boots |
| S3-3 | Resolving is idempotent and inert: resolving twice inserts one `attention.resolved`; resolving produces no wake and no new attention; an unknown card id is a 404, not a silent success. | core tests |
| S3-4 | The one-approval-one-card rule from Stage 2 holds end to end: the same `approval.required` raised twice shows one card. | core test through the card list |
| S3-5 | HTTP surface: the three routes exist in the protocol, the server handles them, and the generated client is regenerated (`check:generated` clean after the commit). | client generate + diff, server typecheck |
| S3-6 | Attention UI in the Dev app: the badge shows the open count, the panel lists each card's title, body and age, Resolve removes it, and both states survive a Dev restart. | screenshots under `/workspace/aporetic/stage3/` on the box |
| S3-7 | Nothing regresses: `coordination.test.ts` (13) and `mission.test.ts` (9) still pass with the new tests added; `packages/app` `src/aporia` (54) and `packages/desktop` `src/main/aporia` (62) still pass; core typecheck exit 0; the app typecheck shows only the two pre-existing `custom-elements.d.ts:1` TS1128 errors. | stored gate runs |
| S3-8 | Hygiene: no secrets or personal data in the diff (scan before every commit), nothing pushed, the rollback tag `an/checkpoint-stage3-done` is cut only on an independent PASS. | scan output, `git ls-remote` |

## Out of scope (said plainly so it is not mistaken for done)

- A test of the production waker against a real session. The Dev check uses `approval.required`, which only raises a card,
  so it does not wake a real bot or spend model tokens. The waker stays as Stage 2 left it: compiled, typechecked, untested.
- Anything that *emits* work facts from the app's session loop. Stage 3 makes the coordinator run and its output visible;
  who records `artifact.created` and friends from real sessions is the next stage's job.
- The flow engine. Its design is `docs/flow-engine-design.md`; it builds on this stage's trigger and cards.

## Rollback

`git switch -c <name> an/checkpoint-pre-stage3` (or `e922ab3972`) returns to the Stage 2 tree. No migration is added, so the
dev database needs no restore; extra `attention.resolved` rows are inert to Stage 2 code, which ignores types it does not fold.
