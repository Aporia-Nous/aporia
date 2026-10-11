import { describe, expect, test } from "bun:test"
import { runAporiaStartup } from "./aporia-startup"

describe("runAporiaStartup", () => {
  test("registers before the window and never starts on the ready->window path", () => {
    const calls: string[] = []
    runAporiaStartup({
      register: () => calls.push("register"),
      createWindow: () => calls.push("window"),
      start: () => calls.push("start"),
      onError: () => calls.push("error"),
    })
    // start is deferred to a later tick; the synchronous path only registers and opens the window.
    expect(calls).toEqual(["register", "window"])
  })

  test("runs the expensive start only after the caller has finished (window on screen first)", () => {
    const calls: string[] = []
    let deferred: (() => void) | undefined
    runAporiaStartup({
      register: () => calls.push("register"),
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

  test("surfaces a failing start instead of swallowing it", () => {
    const seen: unknown[] = []
    runAporiaStartup({
      register: () => {},
      createWindow: () => seen.push("window"),
      start: () => {
        throw new Error("seed blew up")
      },
      onError: (stage, error) => seen.push([stage, error.message]),
      defer: (run) => run(),
    })
    expect(seen).toEqual(["window", ["start", "seed blew up"]])
  })

  test("surfaces a failing register and still opens the window", () => {
    const seen: string[] = []
    runAporiaStartup({
      register: () => {
        throw new Error("no ipc")
      },
      createWindow: () => seen.push("window"),
      start: () => seen.push("start"),
      onError: (stage) => seen.push(`error:${stage}`),
      defer: (run) => run(),
    })
    expect(seen).toEqual(["error:register", "window", "start"])
  })
})
