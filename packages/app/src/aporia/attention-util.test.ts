import { describe, expect, test } from "bun:test"
import { ago, badge, coordinatorLine } from "./attention-util"

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
})
