# Bot Grounded Answers (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make a bot answer only from sourced context entries, cite them, and flag an answer that cites nothing — so it never answers from guesswork.

**Architecture:** A pure module builds the grounded prompt from entries and verifies a reply's citations. The existing dispatcher (`dispatch.tsx` `turn()`) calls it before/after a turn. Nothing else changes.

**Tech Stack:** TypeScript, Solid renderer (dispatcher lives here), `bun test`.

**Spec:** `docs/superpowers/specs/2026-10-12-bot-system-design.md` (§2 grounded answers)

## Global Constraints

- Every grounded answer must cite at least one stored entry id, or explicitly say it has no source.
- Entries are read via the existing `aporia.context({op:"all"|"query"})` bridge.
- Do not change how non-bot chats behave.

## Review Focus

- A question that matches no entry must produce a "no source" answer, never a guess or a stale cite.
- A reply that cites an id NOT in the allowed set must fail verification.
- Very many entries must not blow the prompt (cap the entries included).

---

### Task 1: Grounded prompt + citation verification (pure)

**Files:**
- Create: `packages/app/src/aporia/context-grounded.ts`
- Test: `packages/app/src/aporia/context-grounded.test.ts`

**Interfaces:**
- Produces:
  - `buildGroundedPrompt(question: string, entries: { id: string; topic: string; text: string }[], cap = 20): { prompt: string; allowedIds: string[] }`
  - `extractCitations(reply: string): string[]` — ids matched as `[<id>]` or bare hex ids of length >= 8.
  - `verifyGrounded(reply: string, allowedIds: string[]): { ok: boolean; reason: "ok" | "no-source" | "uncited" | "bad-cite" }`

- [ ] **Step 1: Write the failing tests**

```ts
import { test, expect } from "bun:test"
import { buildGroundedPrompt, extractCitations, verifyGrounded } from "./context-grounded"

test("prompt lists entries with ids and caps the count", () => {
  const entries = Array.from({ length: 30 }, (_, i) => ({ id: "id" + i, topic: "t", text: "x" + i }))
  const { prompt, allowedIds } = buildGroundedPrompt("q", entries, 20)
  expect(allowedIds).toHaveLength(20)
  expect(prompt).toContain("id0")
  expect(prompt).not.toContain("id25")
})

test("empty entries yields an explicit no-source instruction", () => {
  const { prompt, allowedIds } = buildGroundedPrompt("q", [])
  expect(allowedIds).toHaveLength(0)
  expect(prompt.toLowerCase()).toContain("no source")
})

test("extractCitations finds bracketed and bare ids", () => {
  expect(extractCitations("as [abc12345] says")).toContain("abc12345")
  expect(extractCitations("see 0123abcd too")).toContain("0123abcd")
  expect(extractCitations("nothing here")).toEqual([])
})

test("verifyGrounded: cited id in the allowed set is ok", () => {
  expect(verifyGrounded("because [abc12345]", ["abc12345"]).ok).toBe(true)
})

test("verifyGrounded: no citation at all is uncited", () => {
  expect(verifyGrounded("definitely true", ["abc12345"]).reason).toBe("uncited")
})

test("verifyGrounded: citing an id outside the set is bad-cite", () => {
  expect(verifyGrounded("[deadbeef]", ["abc12345"]).reason).toBe("bad-cite")
})

test("verifyGrounded: empty allowed set with an answer is no-source", () => {
  expect(verifyGrounded("I think...", []).reason).toBe("no-source")
})
```

- [ ] **Step 2: Run tests — FAIL** (`Cannot find module './context-grounded'`).

- [ ] **Step 3: Implement the three functions.** `buildGroundedPrompt` slices to `cap`, joins `- [id] (topic): text`, and when empty returns a prompt containing the exact words "no source" plus an instruction to say it cannot answer without a source. `extractCitations` uses a regex for `[id]` and bare 8+ hex sequences. `verifyGrounded`: no allowedIds → `no-source`; no citations → `uncited`; any citation not in allowed → `bad-cite`; else `ok`.

- [ ] **Step 4: Run tests — PASS.**

- [ ] **Step 5: Commit** — `feat(context): grounded prompt builder + citation verification`.

---

### Task 2: Wire into the dispatcher turn

**Files:**
- Modify: `packages/app/src/aporia/dispatch.tsx` (`turn()` ~line 52)
- Test: covered by Task 1's pure functions (the wiring is a call site; verified by a build + manual check).

**Interfaces:**
- Consumes: `buildGroundedPrompt`, `verifyGrounded` (Task 1); `aporia.context` bridge.

- [ ] **Step 1: Build the app** (`bun run build` in packages/desktop, or the repo build script) — confirm it compiles.

- [ ] **Step 2: In `turn()`, before prompting:** read the bot's scoped entries via `window.electron.aporia.context({ op: "query", q: { topic } })` (fall back to `op:"all"` when the bot has no scope yet), call `buildGroundedPrompt`, and wrap the message with the returned `prompt`.

- [ ] **Step 3: After the reply:** call `verifyGrounded(reply, allowedIds)`; when not `ok`, append a visible line to the delivered message, e.g. `⚠️ ungrounded (no source cited)`.

- [ ] **Step 4: Build again — PASS.**

- [ ] **Step 5: Commit** — `feat(context): bots answer only from grounded entries and flag uncited replies`.

---

## Self-Review

- **Spec coverage:** §2 grounded answers → Tasks 1-2. Scopes/rules (§4) are Phase 3; Task 2 falls back to `all` until then.
- **Step scan:** Task 1 steps are one action each with named tests; Task 2 is wiring plus a build.
- **Type consistency:** `buildGroundedPrompt`/`verifyGrounded` signatures match across tasks.
- **Review Focus:** no-match → test; out-of-set cite → test; entry cap → test.
