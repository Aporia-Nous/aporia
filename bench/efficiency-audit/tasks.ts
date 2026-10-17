export type Task = {
  id: string
  title: string
  prompt: string
  files: Record<string, string>
  check: (dir: string) => Promise<{ pass: boolean; detail: string }>
}

const pkg = (name: string) => JSON.stringify({ name, type: "module", private: true }, null, 2) + "\n"

async function bunTest(dir: string) {
  const proc = Bun.spawn(["bun", "test"], { cwd: dir, stdout: "pipe", stderr: "pipe" })
  const code = await proc.exited
  const out = (await new Response(proc.stdout).text()) + (await new Response(proc.stderr).text())
  return { code, tail: out.trim().split("\n").slice(-3).join(" | ") }
}

const read = (dir: string, rel: string) => Bun.file(`${dir}/${rel}`).text()

export const tasks: Task[] = [
  {
    id: "bugfix",
    title: "bench bugfix slugify",
    prompt:
      "The tests in this project fail. Fix the bug in src/slugify.ts so that `bun test` passes. Do not change the tests.",
    files: {
      "package.json": pkg("bench-bugfix"),
      "src/slugify.ts": `export function slugify(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "-")
}
`,
      "test/slugify.test.ts": `import { expect, test } from "bun:test"
import { slugify } from "../src/slugify"

test("trims surrounding separators", () => {
  expect(slugify("  Hello, World!  ")).toBe("hello-world")
})

test("collapses runs of separators", () => {
  expect(slugify("a---b___c")).toBe("a-b-c")
})

test("returns empty string when there are no letters or digits", () => {
  expect(slugify("!!!")).toBe("")
})
`,
    },
    check: async (dir) => {
      const r = await bunTest(dir)
      return { pass: r.code === 0, detail: `bun test exit ${r.code}: ${r.tail}` }
    },
  },
  {
    id: "multifile",
    title: "bench rename timeout constant",
    prompt:
      'Rename the exported constant DEFAULT_TIMEOUT_MS to REQUEST_TIMEOUT_MS everywhere in this project, including src/ and test/. Behaviour must not change. Finish by running `bun test` and make sure it passes.',
    files: {
      "package.json": pkg("bench-multifile"),
      "src/config.ts": `export const DEFAULT_TIMEOUT_MS = 5000

export function defaultConfig() {
  return { timeoutMs: DEFAULT_TIMEOUT_MS, retries: 2 }
}
`,
      "src/client.ts": `import { DEFAULT_TIMEOUT_MS } from "./config"

export function makeClient(baseUrl: string) {
  return { baseUrl, timeoutMs: DEFAULT_TIMEOUT_MS }
}
`,
      "src/index.ts": `export { DEFAULT_TIMEOUT_MS, defaultConfig } from "./config"
export { makeClient } from "./client"
`,
      "test/client.test.ts": `import { expect, test } from "bun:test"
import { DEFAULT_TIMEOUT_MS, defaultConfig, makeClient } from "../src/index"

test("client uses the default timeout", () => {
  expect(makeClient("https://example.test").timeoutMs).toBe(DEFAULT_TIMEOUT_MS)
})

test("default config matches the exported timeout", () => {
  expect(defaultConfig().timeoutMs).toBe(DEFAULT_TIMEOUT_MS)
})
`,
    },
    check: async (dir) => {
      const r = await bunTest(dir)
      if (r.code !== 0) return { pass: false, detail: `bun test exit ${r.code}: ${r.tail}` }
      const files = ["src/config.ts", "src/client.ts", "src/index.ts", "test/client.test.ts"]
      const texts = await Promise.all(files.map((f) => read(dir, f)))
      const stale = files.filter((_, i) => texts[i].includes("DEFAULT_TIMEOUT_MS"))
      const missing = files.filter((_, i) => !texts[i].includes("REQUEST_TIMEOUT_MS"))
      return {
        pass: stale.length === 0 && missing.length === 0,
        detail: `stale=${stale.join(",") || "none"} missing=${missing.join(",") || "none"}`,
      }
    },
  },
  {
    id: "refactor",
    title: "bench dedupe money formatter",
    prompt:
      "src/format-a.ts and src/format-b.ts each define the same formatMoney function. Extract one copy into src/money.ts and import it in both files instead. Keep every exported behaviour identical. Finish by running `bun test`.",
    files: {
      "package.json": pkg("bench-refactor"),
      "src/format-a.ts": `export function formatMoney(cents: number) {
  return (cents / 100).toFixed(2)
}

export function labelA(text: string) {
  return "A: " + text
}
`,
      "src/format-b.ts": `export function formatMoney(cents: number) {
  return (cents / 100).toFixed(2)
}

export function labelB(text: string) {
  return "B: " + text
}
`,
      "test/format.test.ts": `import { expect, test } from "bun:test"
import { formatMoney as formatA, labelA } from "../src/format-a"
import { formatMoney as formatB, labelB } from "../src/format-b"

test("both formatters agree", () => {
  expect(formatA(1234)).toBe("12.34")
  expect(formatB(1234)).toBe("12.34")
})

test("labels are independent of the shared formatter", () => {
  expect(labelA("x")).toBe("A: x")
  expect(labelB("x")).toBe("B: x")
})
`,
    },
    check: async (dir) => {
      const r = await bunTest(dir)
      if (r.code !== 0) return { pass: false, detail: `bun test exit ${r.code}: ${r.tail}` }
      const exists = await Bun.file(`${dir}/src/money.ts`).exists()
      if (!exists) return { pass: false, detail: "src/money.ts missing" }
      const [a, b, money] = await Promise.all([
        read(dir, "src/format-a.ts"),
        read(dir, "src/format-b.ts"),
        read(dir, "src/money.ts"),
      ])
      const imports = a.includes("./money") && b.includes("./money")
      const toFixed = (a + b + money).match(/toFixed/g)?.length ?? 0
      return { pass: imports && toFixed === 1, detail: `imports=${imports} toFixed=${toFixed}` }
    },
  },
  {
    id: "tests",
    title: "bench write stats tests",
    prompt:
      "Add tests for src/stats.ts in test/stats.test.ts. Cover mean and median for typical input, even and odd lengths, and the empty-input errors. Run `bun test` and make sure every test passes.",
    files: {
      "package.json": pkg("bench-tests"),
      "src/stats.ts": `export function mean(xs: number[]): number {
  if (xs.length === 0) throw new Error("mean of empty list")
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

export function median(xs: number[]): number {
  if (xs.length === 0) throw new Error("median of empty list")
  const sorted = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}
`,
    },
    check: async (dir) => {
      const exists = await Bun.file(`${dir}/test/stats.test.ts`).exists()
      if (!exists) return { pass: false, detail: "test/stats.test.ts missing" }
      const r = await bunTest(dir)
      if (r.code !== 0) return { pass: false, detail: `bun test exit ${r.code}: ${r.tail}` }
      const path = `${dir}/src/stats.ts`
      const original = await Bun.file(path).text()
      if (!original.includes("sorted.length % 2 === 0")) return { pass: false, detail: "mutant site missing" }
      await Bun.write(path, original.replace("sorted.length % 2 === 0", "false"))
      const mutant = await bunTest(dir)
      await Bun.write(path, original)
      return {
        pass: mutant.code !== 0,
        detail: `tests catch even-length median mutant=${mutant.code !== 0}`,
      }
    },
  },
  {
    id: "multistep",
    title: "bench fix build pipeline",
    prompt:
      "`bun run build` fails in this project. Fix the source and the build script until the command succeeds and writes dist/manifest.json containing name demo, version 1.2.0 and channel stable. Keep those expected values.",
    files: {
      "package.json": JSON.stringify(
        { name: "bench-multistep", type: "module", private: true, scripts: { build: "bun run script/build.ts" } },
        null,
        2,
      ) + "\n",
      "src/version.ts": `export const VERSION = "1.2.0"
export const CHANNEL = "stable

export const NAME = "demo"
`,
      "script/build.ts": `import { CHANNEL, NAME, VERSION } from "../src/version"

const manifest = { name: NAME, version: VERSION, channel: CHANNEL }
await Bun.write("dist/manifest.json", JSON.stringify(manifest, null, 2) + "\\n")
console.log(JSON.stringify(manifest))
`,
    },
    check: async (dir) => {
      const proc = Bun.spawn(["bun", "run", "build"], { cwd: dir, stdout: "pipe", stderr: "pipe" })
      const code = await proc.exited
      const out = (await new Response(proc.stdout).text()) + (await new Response(proc.stderr).text())
      if (code !== 0) return { pass: false, detail: `build exit ${code}: ${out.trim().split("\n").slice(-2).join(" | ")}` }
      const manifest = await Bun.file(`${dir}/dist/manifest.json`).json().catch(() => undefined)
      const ok =
        manifest?.name === "demo" && manifest?.version === "1.2.0" && manifest?.channel === "stable"
      return { pass: ok, detail: `manifest=${JSON.stringify(manifest)}` }
    },
  },
]

export const taskByID = (id: string) => tasks.find((t) => t.id === id)
