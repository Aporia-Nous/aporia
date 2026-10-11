import { readFileSync } from "node:fs"
import { describe, expect, test } from "bun:test"
import { runAporiaStartup } from "./aporia-startup"

describe("runAporiaStartup", () => {
  test("registers before the window and never starts on the ready->window path", () => {
    const calls: string[] = []
    runAporiaStartup({
      register: [
        ["first", () => calls.push("register:first")],
        ["second", () => calls.push("register:second")],
      ],
      createWindow: () => calls.push("window"),
      start: () => calls.push("start"),
      onError: () => calls.push("error"),
    })
    // start is deferred to a later tick; the synchronous path only registers and opens the window.
    expect(calls).toEqual(["register:first", "register:second", "window"])
  })

  test("runs the expensive start only after the caller has finished (window on screen first)", () => {
    const calls: string[] = []
    let deferred: (() => void) | undefined
    runAporiaStartup({
      register: [["only", () => calls.push("register")]],
      createWindow: () => calls.push("window"),
      start: () => calls.push("start"),
      onError: () => calls.push("error"),
      defer: (run) => {
        deferred = run
      },
    })
    expect(calls).toEqual(["register", "window"])
    deferred!()
    expect(calls).toEqual(["register", "window", "start"])
  })

  test("a failing registrar is isolated: the rest still register and the window still opens", () => {
    const seen: unknown[] = []
    runAporiaStartup({
      register: [
        ["bots", () => {
          throw new Error("no ipc")
        }],
        ["routines", () => seen.push("register:routines")],
      ],
      createWindow: () => seen.push("window"),
      start: () => seen.push("start"),
      onError: (stage, error) => seen.push(`${stage}:${error.message}`),
      defer: (run) => run(),
    })
    expect(seen).toEqual(["register:bots:no ipc", "register:routines", "window", "start"])
  })

  test("surfaces a failing start instead of swallowing it", () => {
    const seen: unknown[] = []
    runAporiaStartup({
      register: [],
      createWindow: () => seen.push("window"),
      start: () => {
        throw new Error("seed blew up")
      },
      onError: (stage, error) => seen.push([stage, error.message]),
      defer: (run) => run(),
    })
    expect(seen).toEqual(["window", ["start", "seed blew up"]])
  })
})

describe("aporia startup wiring (index.ts)", () => {
  const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8")

  test("sets the short idle TTL before the app is ready (so the server child inherits it)", () => {
    const setters = [...source.matchAll(/process\.env\.APORIA_LOCATION_IDLE_TTL_MIN\s*\?\?=\s*"(\d+)"/g)]
    expect(setters.map((match) => match[1])).toEqual(["5"])
    expect(source.indexOf("APORIA_LOCATION_IDLE_TTL_MIN")).toBeLessThan(source.indexOf("app.whenReady"))
  })

  test("registers bots and routines as separate startup steps", () => {
    expect(source).toContain('["bots", registerAporiaBotsHandler]')
    expect(source).toContain('["routines", registerAporiaRoutinesHandler]')
  })
})
