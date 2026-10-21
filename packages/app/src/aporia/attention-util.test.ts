import { describe, expect, test } from "bun:test"
import { ago, badge, coordinatorLine, makeRefresher } from "./attention-util"

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe("attention helpers", () => {
  test("ago reads like a person would say it", () => {
    const now = 1_000_000_000
    expect(ago(now, now)).toBe("just now")
    expect(ago(now + 10_000, now)).toBe("just now")
    expect(ago(now - 42_000, now)).toBe("42s ago")
    expect(ago(now - 5 * 60_000, now)).toBe("5m ago")
    expect(ago(now - 3 * 3_600_000, now)).toBe("3h ago")
    expect(ago(now - 2 * 86_400_000, now)).toBe("2d ago")
  })

  test("the coordinator line never claims more than the status says", () => {
    const now = 1_000_000_000
    expect(coordinatorLine(undefined, now)).toBe("Coordinator status unknown")
    const base = { running: true, cursor: 7, latest: 7, drains: 1, handled: 2 }
    expect(coordinatorLine({ ...base, running: false }, now)).toBe("Coordinator is not running")
    expect(coordinatorLine(base, now)).toBe("Coordinator running · caught up · no drain yet this run")
    // A null from the wire is "not yet", never "56 years ago".
    expect(coordinatorLine({ ...base, lastDrainAt: null }, now)).toBe(
      "Coordinator running · caught up · no drain yet this run",
    )
    expect(coordinatorLine({ ...base, latest: 8, lastDrainAt: now - 3_000 }, now)).toBe(
      "Coordinator running · 1 event behind · last drain just now",
    )
    expect(coordinatorLine({ ...base, lastError: "boom" }, now)).toBe("Coordinator: last drain failed, retrying")
  })

  test("the badge is empty at zero and capped", () => {
    expect(badge(0)).toBe("")
    expect(badge(3)).toBe("3")
    expect(badge(120)).toBe("99+")
  })

  test("a poll that left before a resolve cannot put the resolved card back", async () => {
    const answers: Array<(value: string[]) => void> = []
    const applied: string[][] = []
    const refresher = makeRefresher<string[]>({
      load: () => new Promise((resolve) => answers.push(resolve)),
      apply: (value) => applied.push(value),
      fail: () => {},
    })
    // A poll leaves while the card is still open.
    const poll = refresher.run()
    // The person resolves it meanwhile; the refresh the resolve asks for has to wait its turn.
    refresher.invalidate()
    void refresher.run()
    expect(answers).toHaveLength(1)
    // The stale answer lands: it must be dropped, and a fresh request must follow.
    answers[0]!(["card-1"])
    await flush()
    expect(applied).toEqual([])
    expect(answers).toHaveLength(2)
    answers[1]!([])
    await poll
    expect(applied).toEqual([[]])
  })

  test("one request at a time: overlapping polls collapse into one follow-up", async () => {
    const answers: Array<(value: number) => void> = []
    const applied: number[] = []
    const refresher = makeRefresher<number>({
      load: () => new Promise((resolve) => answers.push(resolve)),
      apply: (value) => applied.push(value),
      fail: () => {},
    })
    const first = refresher.run()
    void refresher.run()
    void refresher.run()
    expect(answers).toHaveLength(1)
    answers[0]!(1)
    await flush()
    expect(answers).toHaveLength(2)
    answers[1]!(2)
    await first
    expect(applied).toEqual([1, 2])
  })
})
