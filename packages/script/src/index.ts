import { $ } from "bun"
import semver from "semver"
import path from "path"

const rootPkgPath = path.resolve(import.meta.dir, "../../../package.json")
const rootPkg = await Bun.file(rootPkgPath).json()
const expectedBunVersion = rootPkg.packageManager?.split("@")[1]

if (!expectedBunVersion) {
  throw new Error("packageManager field not found in root package.json")
}

// relax version requirement
const expectedBunVersionRange = `^${expectedBunVersion}`

if (!semver.satisfies(process.versions.bun, expectedBunVersionRange)) {
  throw new Error(`This script requires bun@${expectedBunVersionRange}, but you are using bun@${process.versions.bun}`)
}

const env = {
  OPENCODE_CHANNEL: process.env["OPENCODE_CHANNEL"],
  OPENCODE_BUMP: process.env["OPENCODE_BUMP"],
  OPENCODE_VERSION: process.env["OPENCODE_VERSION"],
  OPENCODE_RELEASE: process.env["OPENCODE_RELEASE"],
}
const CHANNEL = await (async () => {
  if (env.OPENCODE_CHANNEL) return env.OPENCODE_CHANNEL
  if (env.OPENCODE_BUMP) return "latest"
  if (env.OPENCODE_VERSION && !env.OPENCODE_VERSION.startsWith("0.0.0-")) return "latest"
  const branch = await $`git branch --show-current`.text().then((x) => x.trim())
  if (!branch) return "detached"
  const channel = branch.replace(/[^a-zA-Z0-9._-]/g, "-")
  if (/^[a-zA-Z0-9]/.test(channel)) return channel
  return `branch-${channel}`
})()
const IS_PREVIEW = CHANNEL !== "latest"

const VERSION = await (async () => {
  if (env.OPENCODE_VERSION) return env.OPENCODE_VERSION
  if (IS_PREVIEW) return `0.0.0-${CHANNEL}-${previewBuildNumber()}`
  const version = await fetch("https://registry.npmjs.org/@opencode%2fcli/latest")
    .then((res) => {
      if (!res.ok) throw new Error(res.statusText)
      return res.json()
    })
    .then((data: any) => data.version)
  if (semver.lt(version, "2.0.0")) return "2.0.0"
  const [major, minor, patch] = version.split(".").map((x: string) => Number(x) || 0)
  const t = env.OPENCODE_BUMP?.toLowerCase()
  if (t === "major") return `${major + 1}.0.0`
  if (t === "minor") return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
})()

function previewBuildNumber() {
  const runNumber = process.env["GITHUB_RUN_NUMBER"]
  if (!runNumber) return new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")
  const runAttempt = process.env["GITHUB_RUN_ATTEMPT"]
  if (runAttempt && runAttempt !== "1") return `${runNumber}.${runAttempt}`
  return runNumber
}

// Build provenance: read from the tree that is being built, at the moment it is built. This is the only place the
// commit is knowable, and it is recorded so the binary can be asked what it is rather than trusted to be what
// something beside it claims. A binary built while the tree held uncommitted source changes is NOT equivalent to that
// commit, which is why the dirty state is recorded as data instead of being inferred later.
const COMMIT = await (async () => {
  try {
    const out = (await $`git rev-parse HEAD`.text()).trim()
    return /^[0-9a-f]{40}$/.test(out) ? out : null
  } catch {
    return null
  }
})()
const DIRTY = await (async () => {
  if (!COMMIT) return null
  try {
    // Compare CONTENT with the commit, not git's stat cache. `git status --porcelain` reports a file as modified when
    // only its line endings differ from the index (a checked-out-and-touched lockfile, for example), and a build that
    // refused to run because of a line ending would be untrustworthy in the other direction: people would turn the
    // check off. `git diff HEAD` normalises, so it answers the question that actually matters - is this source tree
    // the commit? The `:/` pathspec matters: this file is imported from inside a package directory, and without it
    // `ls-files` only lists files under that directory, which would report a tree containing an uncommitted file
    // elsewhere as clean - a false clean, the one answer this must never give.
    const changed = (await $`git diff HEAD --name-only -- :/`.text()).trim()
    const untracked = (await $`git ls-files --others --exclude-standard --full-name -- :/`.text()).trim()
    return [changed, untracked].filter((x) => x.length > 0).join("\n")
  } catch {
    return null
  }
})()
const DIRTY_FILES = DIRTY ? DIRTY.split("\n").filter((x) => x.trim()).length : 0
const DIRTY_SAMPLE = DIRTY
  ? DIRTY.split("\n")
      .filter((x) => x.trim())
      .slice(0, 5)
      .join(" | ")
      .slice(0, 300)
  : ""
const BUILT_AT = new Date().toISOString()
const BUILD_ID = `${BUILT_AT.replace(/[-:]/g, "").slice(0, 15)}Z-${COMMIT ? COMMIT.slice(0, 8) : "nogit"}`

const bot = ["actions-user", "opencode", "opencode-agent[bot]"]
const teamPath = path.resolve(import.meta.dir, "../../../.github/TEAM_MEMBERS")
const team = [
  ...(await Bun.file(teamPath)
    .text()
    .then((x) => x.split(/\r?\n/).map((x) => x.trim()))
    .then((x) => x.filter((x) => x && !x.startsWith("#")))),
  ...bot,
]

export const Script = {
  get channel() {
    return CHANNEL
  },
  get version() {
    return VERSION
  },
  get preview() {
    return IS_PREVIEW
  },
  get release(): boolean {
    return !!env.OPENCODE_RELEASE
  },
  get commit(): string | null {
    return COMMIT
  },
  get dirty(): boolean | null {
    return DIRTY === null ? null : DIRTY.length > 0
  },
  get dirtyFiles(): number {
    return DIRTY_FILES
  },
  get dirtySample(): string {
    return DIRTY_SAMPLE
  },
  get builtAt(): string {
    return BUILT_AT
  },
  get buildId(): string {
    return BUILD_ID
  },
  get team() {
    return team
  },
}
console.log(`opencode script`, JSON.stringify(Script, null, 2))
