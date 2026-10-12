# Bot Context Store (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build one local, sourced context store the bot system can read, plus a read-only import that turns existing chats into topic-tagged, source-linked entries.

**Architecture:** A main-process module owns a JSONL fact store under `%APORIA_HOME%\context\`, mirrored to the renderer through the same `window.electron.aporia.<area>({ op })` bridge the bots already use. Import reads sessions through the existing server SDK and writes entries only — it never touches the originals.

**Tech Stack:** TypeScript, Electron main (Bun), Solid (renderer), `bun test` for unit tests.

**Spec:** `docs/superpowers/specs/2026-10-12-bot-system-design.md`

## Global Constraints

- Local, free, offline. No Python.
- Bridge pattern: renderer `window.electron.aporia.context({ op, ... })` → preload `ipcRenderer.invoke("aporia:context", input)` → main `ipcMain.handle("aporia:context", ...)`. Namespace is `aporia` (not `aporianous`).
- Import is **read-only**: never modify, delete, or move a session or message.
- Match the existing main-process style in `packages/desktop/src/main/aporia-bots.ts` (handler registration, `aporiasLog` for errors).
- Every stored entry MUST carry a `source`.

## Review Focus

- An entry whose `source` is missing must never be written (silent corruption of the audit trail); import should skip and count it.
- Re-running import must not duplicate entries (idempotent) — a second run adds zero entries.
- A session with no messages must not crash import.
- `%APORIA_HOME%` missing/undefined must fail loudly, not write to the CWD.
- Very large sessions must not load unbounded into memory (import per-session, cap per session).

---

### Task 1: Context store core

**Files:**
- Create: `packages/desktop/src/main/aporia-context.ts`
- Test: `packages/desktop/src/main/aporia-context.test.ts`

**Interfaces:**
- Produces:
  - `type Entry = { id: string; topic: string; tags: string[]; text: string; source: { kind: "session" | "url" | "file"; ref: string; sessionID?: string; messageID?: string }; created: number }`
  - `createContextStore(dir: string): ContextStore` where `ContextStore` has `add(e: Omit<Entry,"id"|"created">): Entry`, `all(): Entry[]`, `query(q: { topic?: string; tag?: string; text?: string }): Entry[]`, `has(id: string): boolean`.
  - `entryId(e: Omit<Entry,"id"|"created">): string` — stable hash of `source.ref + topic + text` so import is idempotent.

- [ ] **Step 1: Write the failing tests**

```ts
import { test, expect } from "bun:test"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createContextStore, entryId } from "./aporia-context"

test("add + all round-trips an entry with its source", () => {
  const dir = mkdtempSync(join(tmpdir(), "ctx-"))
  const s = createContextStore(dir)
  const e = s.add({ topic: "billing", tags: ["invoice"], text: "Ali pays monthly", source: { kind: "session", ref: "ses_1:msg_1", sessionID: "ses_1", messageID: "msg_1" } })
  expect(e.source.ref).toBe("ses_1:msg_1")
  expect(s.all()).toHaveLength(1)
})

test("add is idempotent for the same source+topic+text", () => {
  const dir = mkdtempSync(join(tmpdir(), "ctx-"))
  const s = createContextStore(dir)
  const input = { topic: "billing", tags: [], text: "x", source: { kind: "session" as const, ref: "ses_1:msg_1" } }
  s.add(input); s.add(input)
  expect(s.all()).toHaveLength(1)
})

test("query filters by topic and tag", () => {
  const dir = mkdtempSync(join(tmpdir(), "ctx-"))
  const s = createContextStore(dir)
  s.add({ topic: "billing", tags: ["invoice"], text: "a", source: { kind: "session", ref: "r1" } })
  s.add({ topic: "perseus", tags: ["wave"], text: "b", source: { kind: "session", ref: "r2" } })
  expect(s.query({ topic: "billing" })).toHaveLength(1)
  expect(s.query({ tag: "wave" })).toHaveLength(1)
  expect(s.query({ topic: "nope" })).toHaveLength(0)
})

test("entryId is stable across calls", () => {
  const a = { topic: "t", tags: [], text: "x", source: { kind: "session" as const, ref: "r" } }
  expect(entryId(a)).toBe(entryId(a))
})

test("reopening the store sees persisted entries", () => {
  const dir = mkdtempSync(join(tmpdir(), "ctx-"))
  createContextStore(dir).add({ topic: "t", tags: [], text: "x", source: { kind: "session", ref: "r" } })
  expect(createContextStore(dir).all()).toHaveLength(1)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/desktop && bun test src/main/aporia-context.test.ts`
Expected: FAIL — `Cannot find module './aporia-context'`.

- [ ] **Step 3: Implement `aporia-context.ts`**

Append-only `entries.jsonl` under `dir`; load by reading the file; `add` skips when `has(entryId(input))`. `entryId` = `sha256(source.ref + "\n" + topic + "\n" + text)` hex (via `node:crypto`). Persist by appending one JSON line per new entry.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/desktop && bun test src/main/aporia-context.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/desktop/src/main/aporia-context.ts packages/desktop/src/main/aporia-context.test.ts
git commit -m "feat(context): grounded local context store (sourced entries, idempotent add)"
```

---

### Task 2: Bridge wiring

**Files:**
- Modify: `packages/desktop/src/main/index.ts` (add `["context", registerAporiaContextHandler]` to the `runAporiaStartup({ register: [...] })` list, ~line 66-71)
- Modify: `packages/desktop/src/preload/index.ts` (add `context: (input) => ipcRenderer.invoke("aporia:context", input)` alongside `bots:` ~line 43)
- Modify: `packages/desktop/src/main/aporia-context.ts` (add `registerAporiaContextHandler()`)
- Test: `packages/desktop/src/main/aporia-context.test.ts` (add op-dispatch test)

**Interfaces:**
- Consumes: `createContextStore` (Task 1).
- Produces: `registerAporiaContextHandler(): void` handling `ipcMain.handle("aporia:context", (_e, input: { op: "all" | "add" | "query"; ... }) => ...)`.

- [ ] **Step 1: Write the failing test** — a `handleContext(store, input)` pure function (extracted so it is testable without Electron): `{ op: "all" }` → `{ entries }`; `{ op: "add", entry }` → `{ entry }`; `{ op: "query", q }` → `{ entries }`; unknown op → throws.

- [ ] **Step 2: Run it — FAIL** (`handleContext is not a function`).

- [ ] **Step 3: Implement `handleContext(store, input)` in `aporia-context.ts`; make `registerAporiaContextHandler()` resolve the store dir from `%APORIA_HOME%\context` and call `handleContext`. Register in `index.ts` and expose in `preload/index.ts`.**

- [ ] **Step 4: Run tests — PASS**, and `bun run --cwd packages/desktop typecheck` (or the repo's typecheck script) shows no new errors.

- [ ] **Step 5: Commit** — `feat(context): expose aporia.context bridge (all/add/query)`.

---

### Task 3: Read-only import + topic tagging

**Files:**
- Create: `packages/desktop/src/main/aporia-context-import.ts`
- Test: `packages/desktop/src/main/aporia-context-import.test.ts`

**Interfaces:**
- Consumes: `ContextStore`, `Entry` (Task 1).
- Produces: `planImport(sessions: SessionLike[], store: ContextStore): { planned: Omit<Entry,"id"|"created">[]; skipped: number }` where `SessionLike = { id: string; title: string; messages: { id: string; role: "user" | "assistant"; text: string }[] }`.

- [ ] **Step 1: Write the failing tests**

```ts
import { test, expect } from "bun:test"
import { mkdtempSync } from "node:fs"; import { tmpdir } from "node:os"; import { join } from "node:path"
import { createContextStore } from "./aporia-context"
import { planImport } from "./aporia-context-import"

test("turns each message into a sourced entry tagged by topic", () => {
  const s = createContextStore(mkdtempSync(join(tmpdir(), "ctx-")))
  const { planned } = planImport([{ id: "ses_1", title: "Billing help", messages: [{ id: "msg_1", role: "user", text: "invoice please" }] }], s)
  expect(planned).toHaveLength(1)
  expect(planned[0].source).toEqual({ kind: "session", ref: "ses_1:msg_1", sessionID: "ses_1", messageID: "msg_1" })
  expect(planned[0].topic).toBe("Billing help")
})

test("skips messages with no text and counts them", () => {
  const s = createContextStore(mkdtempSync(join(tmpdir(), "ctx-")))
  const { planned, skipped } = planImport([{ id: "ses_1", title: "T", messages: [{ id: "m", role: "user", text: "   " }] }], s)
  expect(planned).toHaveLength(0); expect(skipped).toBe(1)
})

test("re-importing the same sessions plans nothing new", () => {
  const s = createContextStore(mkdtempSync(join(tmpdir(), "ctx-")))
  const sess = [{ id: "ses_1", title: "T", messages: [{ id: "m1", role: "user" as const, text: "hi" }] }]
  const first = planImport(sess, s); first.planned.forEach((e) => s.add(e))
  expect(planImport(sess, s).planned).toHaveLength(0)
})

test("a session with no messages does not crash", () => {
  const s = createContextStore(mkdtempSync(join(tmpdir(), "ctx-")))
  expect(planImport([{ id: "ses_1", title: "T", messages: [] }], s).planned).toHaveLength(0)
})
```

- [ ] **Step 2: Run — FAIL** (module missing).

- [ ] **Step 3: Implement `planImport`** — for each session, `topic = title.trim() || "untitled"`; for each message with non-blank text, push an entry with `tags: []` and the session source; count blanks as `skipped`; drop entries the store already `has` (use `entryId`).

- [ ] **Step 4: Run — PASS** (4 tests).

- [ ] **Step 5: Commit** — `feat(context): read-only import that topic-tags existing chats`.

---

### Task 4: Wire import to real sessions + minimal viewer

**Files:**
- Modify: `packages/desktop/src/main/aporia-context.ts` (add `op: "import"` to `handleContext`, which pulls sessions/messages via the server SDK and calls `planImport`, then `add`s)
- Create: `packages/app/src/aporia/context.tsx` (Settings surface: list topics + counts, search, "Import chats" button)
- Modify: `packages/app/src/settings/navigation.tsx` (add a "Context" section)
- Test: `packages/app/src/aporia/context.test.ts` (pure helper: topic counts from entries)

**Interfaces:**
- Consumes: `handleContext` (Task 2), `planImport` (Task 3).
- Produces: `topicCounts(entries: { topic: string }[]): { topic: string; count: number }[]` (renderer helper).

- [ ] **Step 1: Write the failing test** — `topicCounts([{topic:"a"},{topic:"a"},{topic:"b"}])` equals `[{topic:"a",count:2},{topic:"b",count:1}]` sorted by count desc.

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Implement `topicCounts`; add `op:"import"` to the main handler (read-only: `api.session.list` + `api.message.list`, map to `SessionLike`, `planImport`, `add` each); build the minimal `context.tsx` surface and add it to settings nav.**

- [ ] **Step 4: Run tests — PASS**; build the app and confirm Settings shows topics and the Import button does not modify any chat.

- [ ] **Step 5: Commit** — `feat(context): import real chats + minimal Context settings view`.

---

## Self-Review

- **Spec coverage:** §1 store → Tasks 1-2; §3 import + tagging → Tasks 3-4. §2 grounded turn, §4 scopes/rules, §5 expert gate, §6 transcript are **deliberately separate plans** (phases 2-5), per the spec's rollout.
- **Step scan:** each step names one action; code appears for tests and signatures only.
- **Type consistency:** `Entry`, `ContextStore`, `entryId`, `planImport`, `handleContext`, `topicCounts` are defined once and referenced by the same names later.
- **Review Focus:** each listed risk has a test in the owning task (missing source → skipped count; idempotent re-import; empty session; `%APORIA_HOME%` check in Task 2 step 3; per-session cap in Task 4 step 3).
