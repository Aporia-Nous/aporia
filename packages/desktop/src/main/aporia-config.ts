// APORIA: the single owner of read-modify-write access to the user's GLOBAL OpenCode config.
//
// Three modules used to edit the same file independently (aporia-mcp, aporia-owner, aporia-accounts),
// each with its own unpruned timestamped backup and no lock. This module centralizes that:
//  - every write is serialized through one promise queue, so concurrent writers cannot lose edits;
//  - the existing file is parsed/validated before any edit — a malformed config is refused and left
//    byte-unchanged (the old owner writer would corrupt it);
//  - each write keeps exactly one `.bak` (the pre-write contents) and prunes the older
//    `.aporia-bak-*` / `.bak-*` files the previous writers left behind.
// Edits go through jsonc-parser's `modify`/`applyEdits` so comments and unrelated keys are preserved.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import { applyEdits, modify, parse, type ParseError } from "jsonc-parser"

export const BACKUP_SUFFIX = ".bak"
const DEFAULT_CONFIG = "{}\n"

/** Path of the user's global OpenCode config, honoring XDG_CONFIG_HOME. */
export function globalConfigFile() {
  const base = process.env.XDG_CONFIG_HOME || path.join(homedir(), ".config")
  const dir = path.join(base, "opencode")
  for (const name of ["opencode.jsonc", "opencode.json", "config.json"]) {
    const file = path.join(dir, name)
    if (existsSync(file)) return file
  }
  return path.join(dir, "opencode.json")
}

/** Produces the new file text from the current text. Must not mutate the file itself. */
export type ConfigMutation = (text: string) => string

export interface ConfigWriteOptions {
  /** Text used when the config is missing/empty (instead of `{}`). */
  readonly defaultText?: string
}

export interface ConfigWriteResult {
  readonly file: string
  readonly backup?: string
}

function validate(file: string, text: string) {
  if (!text.trim()) return
  const errors: ParseError[] = []
  parse(text, errors, { allowTrailingComma: true })
  if (errors.length) throw new Error(`Could not parse ${path.basename(file)}; left it unchanged`)
}

function pruneBackups(file: string) {
  const dir = path.dirname(file)
  const base = path.basename(file)
  const legacy = [`${base}.aporia-bak-`, `${base}.bak-`]
  for (const name of readdirSync(dir)) {
    if (legacy.some((prefix) => name.startsWith(prefix))) rmSync(path.join(dir, name), { force: true })
  }
}

/**
 * Synchronous write used on the synchronous startup path (its critical section is atomic on the
 * event loop because it never yields). All other writers should use `updateGlobalConfig`.
 */
export function updateGlobalConfigSync(file: string, mutate: ConfigMutation, options: ConfigWriteOptions = {}): ConfigWriteResult {
  mkdirSync(path.dirname(file), { recursive: true })
  const original = existsSync(file) ? readFileSync(file, "utf8") : ""
  validate(file, original)
  let backup: string | undefined
  if (original) {
    backup = `${file}${BACKUP_SUFFIX}`
    copyFileSync(file, backup)
  }
  const base = original.trim() ? original : (options.defaultText ?? DEFAULT_CONFIG)
  writeFileSync(file, mutate(base), "utf8")
  pruneBackups(file)
  return { file, backup }
}

let queue: Promise<unknown> = Promise.resolve()

/** Serialized async write: each queued task reads the file at its turn, so edits never interleave. */
export function updateGlobalConfig(file: string, mutate: ConfigMutation, options: ConfigWriteOptions = {}): Promise<ConfigWriteResult> {
  const task = () => updateGlobalConfigSync(file, mutate, options)
  const run = queue.then(task, task)
  queue = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

/** A comment-preserving edit of one `keyPath` to `value` (undefined removes the key). */
export function editConfig(keyPath: (string | number)[], value: unknown): ConfigMutation {
  return (text) => applyEdits(text, modify(text, keyPath, value, { formattingOptions: { insertSpaces: true, tabSize: 2 } }))
}
