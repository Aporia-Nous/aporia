# Build provenance (the build invariant)

Ali's invariant, 2026-10-16:

```
app source commit == CLI source commit == packaged CLI identity == installed app identity
```

Packaging must FAIL on a mismatch, never continue. A binary built from commit `abc123` while the
worktree held uncommitted source changes is NOT equivalent to clean `abc123`, so the identity is:

```
commit + dirty state + artifact hash + build ID
```

## Why this exists

A three-day-stale CLI (`%TEMP%\opencode-cli-dist`, 10/13) was shipped inside an asar that carried every
expected marker. The asar looked perfect and the cost cap was missing, because the cost cap lives in
`resources\opencode-cli.exe`, not `app.asar`. Marker-scanning the app proves nothing about the CLI it
ships. This is the only mechanism that closes that gap.

## The stamp

Baked in at CLI compile time by the CLI's own build, from the source tree it is compiling.

Fields:

| Field                       | Type            | Meaning                                                     |
|-----------------------------|-----------------|-------------------------------------------------------------|
| `commit`                    | 40-hex string   | `git rev-parse HEAD` of the tree the CLI was compiled from   |
| `dirty`                     | boolean         | true if the tree differed from that commit when compiled     |
| `buildId`                   | string          | unique per build, e.g. `20261016T110908Z-cfc25716`           |
| `builtAt`                   | ISO-8601 UTC    | when the CLI was compiled                                    |
| `version`                   | string          | the product version (unchanged, for humans)                  |
| `dirtySample`               | string          | up to 5 paths that made it dirty (only when `dirty` is true) |
| `note`                      | string          | why it is unstamped (only when `stamped` is false)           |

`dirty=true` must be treated as a hard failure for a *staged* artifact: it cannot be certified as
`commit`. It is acceptable for a local/dev binary, which is exactly why it must be recorded rather
than inferred. `dirtySample` exists so the refusal says what to fix instead of only that something
is wrong.

### What "dirty" means precisely

Compared by CONTENT, not by git's stat cache:

```
git diff HEAD --name-only -- :/                                  # staged + unstaged, normalised
git ls-files --others --exclude-standard --full-name -- :/       # untracked, non-ignored
```

Two deliberate choices, both learned the hard way:

- `git status --porcelain` is NOT used. It reports a file as modified when only its line endings
  differ from the index (a lockfile that `bun install` rewrote is enough). A check that refuses a
  build over a line ending is a check people switch off, and it would be wrong in the dangerous
  direction the other time.
- `-- :/` and `--full-name` are NOT optional. This code runs with the cwd inside a package directory
  (`packages/cli`, then `packages/desktop`), where `git ls-files` only lists files *under that
  directory*. Without them, a tree holding an uncommitted file anywhere else reports `dirty=false` —
  a false clean, the one answer this check must never give. Verified from both package directories:
  6 dirty paths from either cwd.

## The command

```
<cli> --build-info
```

Prints exactly one line of JSON on stdout and exits 0:

```json
{"stamped":true,"commit":"cfc25716a7...","dirty":false,"buildId":"20261016T110908Z-cfc25716","builtAt":"2026-10-16T11:09:08Z","version":"0.0.0"}
```

An unstamped binary (built before this existed, or built by a path that skipped the stamp) prints:

```json
{"stamped":false,"commit":null,"dirty":null,"buildId":null,"builtAt":null,"version":"...","note":"built without a provenance stamp"}
```

and **still exits 0** — absence of a stamp is data, not an error; the consumer decides. The updater
treats `stamped:false` as a hard failure when staging. A binary that predates this flag prints its
help text and exits non-zero, which the updater reports as "ran but printed no build stamp". Either
way it is refused, and neither way hangs.

The stamp must be read by EXECUTING the binary. Reading a JSON file next to the binary is not
acceptable: the whole point is that the artifact and its claimed identity cannot be separated.

`--build-info` is answered at the top of `packages/cli/src/index.ts`, before `ensurePluginRuntime()`
and before the Effect command tree is assembled. It must stay that early: it decides whether an
artifact may be installed at all, so it cannot depend on config being valid, on a plugin runtime
loading, or on a server being reachable.

## Where it is enforced

1. **Build/stage** (`scripts/aporia-update.ps1` `Do-Build`): the freshly packaged
   `packages\desktop\dist\win-unpacked\resources\opencode-cli.exe` is executed with `--build-info` and
   must be `stamped`, report `commit == source HEAD`, and report `dirty == false`. The `sha256` of that
   exe is recorded, and after the mirror the **staged copy's sha256 must equal it** — a copy step is
   where "verified the source, shipped the sibling" bugs live.

   This check runs **before** `Mirror` into `staged\`, so a refused build leaves `staged\` holding the
   previous good artifact instead of replacing it with one nobody can certify.

   Exit codes: `2` = no packaged exe / incomplete stage, `3` = build invariant failed.

2. **Apply** (`Do-Apply`), in two places:
   - *Before* anything is installed: refuses if commits landed after staging (the staged build is no
     longer equivalent to HEAD) or if there is no provenance record at all. Exit `7`. "No record" is a
     refusal, never a fallback to trusting the folder.
   - *After* the swap and health check: executes the INSTALLED `resources\opencode-cli.exe` and requires
     `stamped`, `commit == staged commit == HEAD`, `dirty == false`, and `sha256 == staged sha256`.
     Any failure rolls back to the previous build (the existing health-check rollback path).

3. **State**: `staged.cliBuild = { commit, dirty, buildId, builtAt, sha256 }` and
   `installed.cliBuild = { ... }` so a later reader can see the identity of what was staged and what is
   running without re-deriving it.

4. **On demand**: `verify [-Dir PATH] [-Expect COMMIT]` runs the same check against any folder and exits
   `0`/`3`. Defaults to the installed app and its recorded commit. This answers "is the app on disk
   actually the build we think it is?" — and it is how the mismatch case is exercised without waiting
   for a five-minute build.

### What each test can and cannot reach

`build-win6.ps1` always runs the CLI build, and `packages/cli/script/build.ts:24` wipes the CLI output
directory before compiling. So a full `build` cannot hand the gate an artifact stamped from a different
commit: the CLI is rebuilt from the same tree whose HEAD is compared. The commit-mismatch branch is a
guard for artifacts that arrive *without* being rebuilt — a hand-staged folder, a restored `%TEMP%`, an
externally supplied dist, or a future stage-only path. That is why it is exercised through `verify`
against a real artifact rather than by pretending the build path can produce it.

The build path *can* be made to refuse, and is: a tree with uncommitted changes produces a CLI stamped
`dirty=true`, and the gate must reject it (exit 3) without touching `staged\`.

## Tests

`C:\Users\Dilla\Aporia\jobs\test-build-invariant.ps1` (outside the repo, so it never dirties the tree
it is testing). It refuses to run against a dirty source tree, and each phase is asserted on the
command's exit code *and* on what changed on disk:

1. **Dirty tree refuses** (real build path): with a tracked doc file modified, `build -Force` must exit
   `3`, record `lastBuild.ok=false` with `reason` naming the dirty tree and the offending paths, and
   leave `staged\` byte-for-byte untouched (sha256 of the staged CLI before == after).
2. **Clean tree stages** (real build path): clean tree at commit A → `build -Force` exits `0`,
   `lastBuild.ok=true`, `staged.cliBuild.commit == A`, `dirty == false`, sha256 recorded, and the
   *staged CLI's own* `--build-info` reports A.
3. **A presented as B refuses** (real artifact, real check): `verify -Dir <staged> -Expect <other>`
   exits `3` and names both commits; `verify -Dir <staged> -Expect <A>` exits `0`.
4. **Staged-then-HEAD-moved refuses** (real apply path, end to end): after staging A, a commit lands (HEAD
   = B) → `apply` must exit `7` and install nothing.
5. **Install verifies itself**: after a real apply, `verify` against the installed app exits `0`, and the
   installed CLI's `--build-info` reports the staged commit and sha256.

A no-op is never a pass: every phase asserts the operation id and the version of the artifact, not just
"the command exited cleanly".

## What this does NOT yet do

It does not stamp the desktop app itself, and it does not cover `app.asar`. The app's identity is
still `state.json`'s `installed.commit`, which is written by the updater from its own source HEAD.
Extending the stamp to the app bundle is a later step; the CLI is the one that has actually shipped
stale.
