import { OPENCODE_VERSION } from "./version"

// Injected by the CLI build (packages/cli/script/build.ts -> define). Declared here so the values are answered from
// the binary itself: a file next to the artifact can be replaced, mixed up, or left behind by a stale build, and then
// the artifact and the identity it is shipped under can disagree. Reading them out of the executable cannot drift.
declare const OPENCODE_BUILD_COMMIT: string
declare const OPENCODE_BUILD_DIRTY: boolean
declare const OPENCODE_BUILD_ID: string
declare const OPENCODE_BUILD_TIME: string
declare const OPENCODE_BUILD_DIRTY_SAMPLE: string

const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null)
const bool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null)

const commit = str(typeof OPENCODE_BUILD_COMMIT === "string" ? OPENCODE_BUILD_COMMIT : null)
const buildId = str(typeof OPENCODE_BUILD_ID === "string" ? OPENCODE_BUILD_ID : null)
const builtAt = str(typeof OPENCODE_BUILD_TIME === "string" ? OPENCODE_BUILD_TIME : null)
const dirty = bool(typeof OPENCODE_BUILD_DIRTY === "boolean" ? OPENCODE_BUILD_DIRTY : null)
const dirtySample = str(typeof OPENCODE_BUILD_DIRTY_SAMPLE === "string" ? OPENCODE_BUILD_DIRTY_SAMPLE : null)

/**
 * What this binary is, in its own voice.
 *
 * stamped is false for any binary built before provenance existed, or built by a path that skipped the stamp (for
 * example running from source). That is reported as data, not as an error: an unstamped binary is exactly what a
 * caller needs to refuse, and a crash would hide which binary refused.
 */
export function buildInfo() {
  return {
    stamped: commit !== null && buildId !== null,
    commit,
    dirty,
    buildId,
    builtAt,
    version: OPENCODE_VERSION,
    ...(dirty === true && dirtySample ? { dirtySample } : {}),
    ...(commit === null || buildId === null ? { note: "built without a provenance stamp" } : {}),
  }
}

export type BuildInfo = ReturnType<typeof buildInfo>
