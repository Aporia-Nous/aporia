# First model request: what it costs, and what we cut

Branch: `an/slim-first-request`. Date: 2026-10-17.

## What is being measured

The **first model request** is the first input payload of a fresh session: system prompt, tool
definitions, injected instruction blocks, date, environment, and the user message. It is the fixed
overhead paid before the model has read a single file, and it repeats on every fresh session.

## Method

Per-component counts come from `Token.estimate` (characters / 4) over the **actual strings** the request
assembler produces, using native tool definitions and the stored instruction values of a real session
(117 skills, 18 Code Mode namespaces / 1,092 tools, 9 MCP servers, 2 instruction files).

Accuracy check: the same session's first request was reported by the provider as **28,018 input
tokens**; the component sum was **28,112** (+0.3%). That is close enough to attribute savings per
component, and it is why the baseline below is the provider number rather than a guess.

A temporary measurement harness rendered the components before and after the change. It was deleted
before the commit; the numbers and inputs are recorded here.

### Baseline reconciliation

The task brief quoted ~35,400 tokens. That figure is not reproducible from the request this repository
assembles: the same session's provider-reported first-request input was **28,018**. The difference is
harness preamble sent outside this repository's assembly path, which no code change here can remove.
All before/after numbers below are repo-owned components.

## Before / after

| Component                    |     Before |      After |               Delta |
| ---------------------------- | ---------: | ---------: | ------------------: |
| Skill index                  |     13,619 |      4,673 |              −8,946 |
| MCP instructions             |      3,813 |      3,685 |                −128 |
| Code Mode catalog + prompt   |      2,190 |      1,392 |                −798 |
| Tool definitions (13 native) |      3,415 |      3,415 |                   0 |
| User instruction files       |      4,463 |      4,463 |                   0 |
| System prompt                |        368 |        368 |                   0 |
| Reference guidance           |        136 |        136 |                   0 |
| Environment                  |        101 |        101 |                   0 |
| Date                         |          7 |          7 |                   0 |
| **Total**                    | **28,112** | **18,240** | **−9,872 (−35.1%)** |

Provider-observed after value: **≈18,500**, not 18,240. Under production inventory the Code Mode
render fills its 1,500-token body budget with more listings than the 18 stored listings used for the
harness measurement, which adds roughly 260 tokens. Treat 18,240 as the measured floor of the new
render and 18,500 as the expected provider number. Labelled estimate; not separately measured.

## What was cut

### 1. Skill index: structured XML → one line per skill (13,619 → 4,673)

Before, every skill cost a five-line `<skill>` block with `<id>`, `<name>`, and the full description
(117 skills, 54,474 characters). After, each skill is one line:

```
- some-skill-id (Display Name): Opening sentence. First trigger sentence.
```

The summary keeps the opening sentence and, when it fits, the first sentence containing a trigger
phrase (`use when`, `load when`, `triggers`, `must use`, …), capped at 220 characters on a word
boundary. Whole sentences only — never a mid-sentence fragment. 117 skills produced 117 lines, 14
clipped with `...`, no empty summaries, 137 average characters.

Capability is preserved because the index only has to make a skill _discoverable_: the full
description and body still arrive when the model calls the `skill` tool. The 220-character summary
carries the same search keys (opening sentence plus when-to-use sentence) as the old description for
the common case; only the tail of long descriptions is withheld until load.

### 2. MCP: one hoisted dispatch hint instead of one per server (3,813 → 3,685)

Before, each of the 9 servers repeated a near-identical sentence explaining how to reach its tools
through `execute`. After, `<mcp_instructions>` opens with the rule once:

> Call each server's tools through `execute` under `tools["<server>"]`, where `<server>` is the block
> name with characters other than letters, digits, `_`, and `-` replaced by `_`.

Servers with `codemode: false` get one explicit line saying their tools are callable directly. All
per-server instruction text is kept verbatim — those paragraphs carry security and operational rules,
which is exactly the part worth its tokens.

### 3. Code Mode catalog: strip copied doc comments, tighter inline budget (2,190 → 1,392)

Tool signatures in the catalog carried the same `/** ... */` doc comment twice: once as the tool
description and again inside the signature. `compact()` now removes block comments, trailing
whitespace, and blank lines from the signature before rendering. The callable shape — names, parameter
types, optionality — is unchanged, so `search` results and call sites still match.

`INLINE_BUDGET` dropped from 2,000 to 1,500 tokens. Listings cost less each now, so the same budget
would show more than before; lowering it shows at least as many tools as the old render while costing
less. Nothing becomes unreachable: `search` still indexes the full 1,092-tool inventory.

## What was deliberately not cut

- **Native tool descriptions** (`patch`, `execute`, `question`, `subagent`, `read`, …). These are already
  tight, and their text is failure-prevention: it prevents wrong-shape calls that cost far more than
  the description.
- **User instruction files** (4,463 tokens). These are Ali's `AGENTS.md` files. They are user content,
  not repo content, and they are the main reason the total cannot go lower.
- **MCP server instruction bodies** (3,483 of the 3,685). Operational and security rules.
- **Reference and environment blocks.** Small, and each line changes behavior.

## Why under 8,000 is not reachable

With all capability kept, the floor is the sum of what cannot be removed without losing either a tool
or a standing instruction:

| Unavoidable component      |    Tokens |
| -------------------------- | --------: |
| System prompt              |       368 |
| 13 native tool definitions |     3,415 |
| User instruction files     |     4,463 |
| Reference guidance         |       136 |
| Environment                |       101 |
| Date                       |         7 |
| **Floor**                  | **8,490** |

That floor already excludes every skill (117), every MCP server (9), and the entire Code Mode catalog
(1,092 tools). Cutting to 8,000 would require deleting either the user's instruction files or working
tools. Not done.

What is actually achievable, and now measured: **18,240** on the stored inventory (~18,500 in
production), down from **28,112**, with no capability removed.

## Remaining cost, in order

1. Skill index — 4,673. 117 one-line entries. Next lever: drop the summary for skills whose id is
   already self-describing, or split the index so only task-relevant families load.
2. User instruction files — 4,463. User content; reducing this is Ali's call, not the repo's.
3. MCP server bodies — 3,685. Nine servers' own rules.
4. Native tool schemas — 3,415. Structural; would need fewer tools, not shorter text.
5. Code Mode catalog — 1,392, mostly the 1,500-token body budget.

## Verification

- Unit tests for the touched renderers, from `packages/core`:
  `bun test test/skill/instructions.test.ts test/mcp-instructions.test.ts test/codemode/catalog.test.ts test/codemode/instructions.test.ts`
  → **35 pass, 0 fail**.
- `bun typecheck` from `packages/core` passes, `oxlint` on the changed files is clean.
- Skill-summary coverage added: trigger-sentence preference, no mid-sentence tail, and clipping on a
  word boundary when no whole sentence fits.
- End-to-end smoke test of an actual edit, on an isolated data directory and database
  (`smoke.db`, separate `XDG_*` dirs), `--standalone`, model `deepseek/deepseek-flash` only. Prompt:
  "Edit hello.txt: add a new line containing exactly: smoke". Result: model called `read`, then
  `edit`, then re-read to verify, and `hello.txt` ended as `hello\nsmoke`. Four model steps, no
  retries, no failures. That config registers no skills, no MCP servers, and no user instruction
  files, so its first request (6,587 input tokens) is not comparable to the 18,240 figure — it only
  proves the changed renderers produce a working request end to end.

## Reproduce

```bash
# from packages/core
bun test test/skill/instructions.test.ts test/mcp-instructions.test.ts test/codemode/catalog.test.ts
```
