# Bot Scopes & Routing (Phase 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let each bot own a slice of the context (topics) and check before it creates anything, so there is one source of truth and no duplicate knowledge.

**Architecture:** Pure helpers decide (a) which stored entries a bot may see, given its scopes, and (b) whether a new fact duplicates an existing one. The dispatcher and the bot record carry a `scopes` field; nothing else changes.

**Tech Stack:** TypeScript, `bun test`.

**Spec:** `docs/superpowers/specs/2026-10-12-bot-system-design.md` (§4 per-bot slice + routing, duplicate check)

## Global Constraints

- A bot with no scopes sees nothing scoped (Phase 2's fallback to `all` stays only until scopes exist for it).
- A duplicate is "same topic AND same normalised text" — case/whitespace-insensitive.
- Adding `scopes` must not break existing bot records (missing field = no scopes).

## Review Focus

- A bot with `scopes: []` must not silently see the whole store once scopes ship.
- Text that differs only by case/whitespace/line endings must count as the same fact.
- A bot whose scope matches no entry must get an empty set (Phase 2 then says "no source").

---

### Task 1: Scope filter + duplicate check (pure)

**Files:**
- Create: `packages/app/src/aporia/context-scope.ts`
- Test: `packages/app/src/aporia/context-scope.test.ts`

**Interfaces:**
- Produces:
  - `scopedEntries(entries: { id: string; topic: string }[], scopes: string[] | undefined): { id: string; topic: string }[]`
  - `normaliseFact(text: string): string`
  - `isDuplicate(candidate: { topic: string; text: string }, existing: { topic: string; text: string }[]): boolean`

- [ ] **Step 1: Write the failing tests**

```ts
import { test, expect } from "bun:test"
import { scopedEntries, normaliseFact, isDuplicate } from "./context-scope"

test("scopedEntries keeps only entries whose topic is in scope", () => {
  const entries = [{ id: "1", topic: "billing" }, { id: "2", topic: "perseus" }]
  expect(scopedEntries(entries, ["billing"]).map((e) => e.id)).toEqual(["1"])
})

test("undefined scopes means no scope yet — returns everything (Phase-2 fallback)", () => {
  const entries = [{ id: "1", topic: "billing" }]
  expect(scopedEntries(entries, undefined)).toHaveLength(1)
})

test("an empty scope list sees nothing", () => {
  const entries = [{ id: "1", topic: "billing" }]
  expect(scopedEntries(entries, [])).toHaveLength(0)
})

test("normaliseFact ignores case, whitespace, and line endings", () => {
  expect(normaliseFact("  Hello   World\r\n")).toBe(normaliseFact("hello world"))
})

test("isDuplicate is true for the same topic and normalised text", () => {
  const existing = [{ topic: "billing", text: "Ali pays monthly" }]
  expect(isDuplicate({ topic: "billing", text: "ali  pays\nmonthly" }, existing)).toBe(true)
})

test("isDuplicate is false for a different topic or text", () => {
  const existing = [{ topic: "billing", text: "Ali pays monthly" }]
  expect(isDuplicate({ topic: "other", text: "Ali pays monthly" }, existing)).toBe(false)
  expect(isDuplicate({ topic: "billing", text: "something else" }, existing)).toBe(false)
})
```

- [ ] **Step 2: Run — FAIL** (`Cannot find module './context-scope'`).

- [ ] **Step 3: Implement.** `scopedEntries`: `undefined` → return all (fallback); otherwise filter by `scopes.includes(topic)`. `normaliseFact`: lower-case, collapse whitespace to a single space, trim. `isDuplicate`: any existing with same topic and equal `normaliseFact(text)`.

- [ ] **Step 4: Run — PASS.**

- [ ] **Step 5: Commit** — `feat(context): bot scope filter + duplicate check`.

---

### Task 2: Wire scopes + duplicate check into the dispatcher and bot record

**Files:**
- Modify: `packages/desktop/src/main/aporia-bots.ts` (bot record gains optional `scopes: string[]`; pass through list/save ops)
- Modify: `packages/app/src/aporia/bots.tsx` (the `Bot` type gains `scopes?: string[]`)
- Modify: `packages/app/src/aporia/dispatch.tsx` (`turn()`: query with `scopedEntries`; skip a duplicate before storing the reply back)

**Interfaces:**
- Consumes: `scopedEntries`, `isDuplicate` (Task 1); `aporia.context({op:"query"})` (Phase 1).

- [ ] **Step 1: Add `scopes?: string[]` to the `Bot` type and the main-process record; default undefined; confirm existing records still load (no field = undefined).**

- [ ] **Step 2: In `turn()`, replace the Phase-2 `op:"query", q:{}` with the store's entries filtered by `scopedEntries(entries, bot.scopes)`.** Task 2 must receive the bot on the turn signature (or read it from the passed `list`).

- [ ] **Step 3: After a reply, before writing knowledge back, call `isDuplicate(reply-entry, existing)` and skip when true (log it in the delivered message as `(not stored: duplicate)`).**

- [ ] **Step 4: Build the app — PASS.**

- [ ] **Step 5: Commit** — `feat(context): bots see only their scoped context and never store duplicates`.

---

## Self-Review

- **Spec coverage:** §4 scopes + duplicate check → Tasks 1-2.
- **Step scan:** Task 1 is four named tests + one implementation; Task 2 is wiring plus a build.
- **Type consistency:** `scopedEntries`/`isDuplicate`/`normaliseFact` signatures match across tasks; `Bot.scopes` added once.
- **Review Focus:** empty scopes → test; case/whitespace equality → test; no-match scope → empty set → Phase 2 "no source".
