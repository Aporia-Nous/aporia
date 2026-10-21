#!/usr/bin/env bun
/**
 * oxlint on this Windows/worktree host finds 0 files when given a directory
 * or no path (exit 1 → blocks husky pre-push). Pass explicit git-tracked
 * source files in batches instead.
 */
const BATCH = 80
const listed = (
  await Bun.$`git ls-files -- "*.ts" "*.tsx" "*.js" "*.jsx" "*.mjs" "*.cjs"`.text()
)
  .split("\n")
  .map((line) => line.trim())
  .filter((file) => file.length > 0 && Bun.file(file).size > 0)

if (listed.length === 0) {
  console.error("oxlint-git: no tracked source files")
  process.exit(1)
}

let worst = 0
for (let i = 0; i < listed.length; i += BATCH) {
  const batch = listed.slice(i, i + BATCH)
  const proc = Bun.spawn(["bunx", "oxlint", ...batch], {
    stdout: "inherit",
    stderr: "inherit",
  })
  const code = await proc.exited
  if (code !== 0) worst = code
}

console.log(`oxlint-git: finished ${listed.length} file(s); exit ${worst}`)
process.exit(worst)
