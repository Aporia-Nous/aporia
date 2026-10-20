# Bot System — Design

Date: 2026-10-12
App: Aporetic (`packages/app/src/aporia`, `packages/desktop/src/main`)
Status: proposed (awaiting Ali's approval)

## Why (intent)

Ali wants to move the app off flat chat threads and onto a **bot system** where many bots work as a team, share one grounded picture of the world, and never answer from guesswork or duplicate each other. The pain today is the inverse: chats bleed into one another, there is no source of truth, and asking a bot to "be an expert" does not make it research anything.

## What already exists (extend, do not rebuild)

- `bots.tsx` — bot registry (slug, name, model, voice, sessions), persisted on disk; export/import `.aporia-bot.json`.
- `dispatch.tsx` + `dispatch-queue.ts` — the bot message bus: filesystem inbox, scheduler, bot→bot messages, **rooms with turn order**, per-bot sessions rooted at `bots/<slug>`.
- `automations.tsx` — routines (scheduled bot turns).
- `rooms.tsx` — room membership UI; `reactions.tsx`, `events.ts`, `alerts.tsx`.
- Main process `aporia-bots.ts` — seeding/migration for bots; `aporia-routines.ts`.
- An `aporia-memory` MCP server (a memory surface bots can read).

Missing entirely: the **grounded context store**, chat **import + topic tagging**, per-bot **scopes/routing rules**, and **expert research-before-answer**.

## Goals

1. **One shared context store**, every bot reads, where every fact carries its **source**.
2. **Grounding + verification**: a bot answer must cite stored source(s); with none, the bot must say so — no guesswork.
3. **Import every existing chat**, split by **topic**, **tag** each, link back to the original session.
4. Each bot **owns a slice** (scopes/topics) and clear **routing rules** — one source of truth, no duplicate builds.
5. **Experts research before they answer**: an expert bot runs a research step and stores findings before it may reply.
6. **Resumable live transcript**: open the transcript and see where you left off; full history intact.
7. **New sessions are not new chats**: bot/dispatch sessions stay out of the chat list and stream into the transcript.

## Non-goals

- Replacing the chat UI for normal human work (it stays).
- Cloud services; everything stays local/offline.
- Changing the Perseus core (separate repo, separate rules).

## Anti-goals (would make this a failure even if it "works")

- Bots inventing facts or citing nothing.
- A second context system duplicating `aporia-memory` or the vault.
- Importing chats in a way that loses or mutates the originals.

## Constraints

- Local, free, offline. No Python for the app runtime; the store is filesystem + existing bridge pattern.
- Never delete or mutate existing sessions or their content on import (read-only import).
- Follow the existing bridge style: renderer calls `window.electron.aporia.<area>({ op, ... })`; main process owns files.

## The parts (how)

### 1. Context store (new: `aporia-context.ts`, main; `context.tsx`, renderer)

A single local store under `%APORIA_HOME%\context\` (JSONL + index). Each **entry**:
`{ id, topic, tags[], text, source: { sessionID, messageID } | { url } | { file }, created, confidence }`.
- Read-only import: entries point at their origin; originals are never touched.
- Query ops: by topic, by tag, by text. Returns entries **with their sources**.
- Bridge mirror of `aporia.bots(...)`: `aporia.context({ op: "query" | "add" | "import" | "topics" | "tags", ... })`.

### 2. Grounded answers (extend `dispatch.tsx` `turn()`)

- Before a bot answers, the dispatcher queries the store for the bot's scopes and injects the matching entries **with ids** into the prompt: "Answer only from these; cite ids; if none fit, say you have no source."
- The turn's reply is stored back as context entries **with a source** (the bot's session/message), so knowledge compounds and is auditable.
- Verification: a reply with no citation to a required scope is flagged in the transcript, not silently accepted.

### 3. Import + topic tagging (new op `aporia.context({op:"import"})`)

- Walks all sessions, derives a **topic per session** (title + a summariser pass), attaches **tags**, and writes index entries linking topic → sessions/messages.
- **Anti-contamination**: bots and rooms only receive entries whose topic/tags match their scope, so unrelated threads stop crossing.

### 4. Per-bot slice + routing rules (extend `bots.tsx`)

- Bot record gains `scopes: string[]` (topics it owns) and `rules: { look: string[]; never: string[] }`.
- Existing `dispatch-queue` routing stays; it gains a **duplicate check**: before creating an artifact/knowledge entry, query the store — if it exists, reuse.

### 5. Expert bots research first (extend `bots.tsx` + `dispatch.tsx`)

- Bot gains `kind: "expert" | "worker"`.
- An expert's first turn is a **research turn** (store + web), which must produce at least one stored entry before it may answer; the gate lives in `turn()`.

### 6. Live transcript + "new session is not a new chat"

- Bot/dispatch sessions are flagged internal (`metadata.aporia.internal = true` — match the existing `aporia` namespace, not `aporianous`).
- **Gap found in review:** `data.session.create()` does NOT accept/forward `metadata` today (`packages/client/src/solid/data.ts` create input + its optimistic record both omit it). Two options for the builder: set the flag with `session.update({ sessionID, metadata })` right after create, or extend `create()`'s input + optimistic record to carry metadata. Prefer the former (smaller, no client change).
- **Gap found in review:** hiding internal sessions is NOT `filterSessionRows` (it is a pure text filter and returns everything when the query is empty). Add an `internal` flag to `SessionRow` and filter in `mergeSessions` / `toSessionRows` (`session-list.ts`), which is where archived/`parentID` filtering already happens.
- The transcript is the session; it streams live and remembers scroll/position per session so you resume where you left off.

## Boundary with `aporia-memory` (resolves the one real overlap)

- `aporia-memory` MCP stays the **per-bot working memory**: freeform notes in `USER.md` and `bots/<slug>/MEMORY.md`.
- The **context store** is the new **grounded, sourced topic/fact index** (every entry has a `source`, is queryable by topic/tag, and is built by the importer).
- They do not compete: memory = the bot's scratchpad; context store = the team's shared, cited source of truth. The store may *index* memory entries as one of its sources, never the reverse.

## What's left to the builder

- Exact schema of entries and index; whether JSONL or SQLite.
- Summariser choice for topic naming (reuse the session title model).
- UI for scopes/rules on a bot (extend the existing bot editor).

## Rollout (phases)

1. Context store + bridge + read-only import/tagging (no behaviour change yet).
2. Grounded `turn()` + citations.
3. Bot scopes/rules + duplicate check.
4. Expert research gate.
5. Transcript/no-new-chat + live streaming.
