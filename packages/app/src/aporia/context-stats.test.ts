import { test, expect } from "bun:test"
import { topicCounts } from "./context-stats"

test("counts entries per topic, sorted by count then name", () => {
  expect(topicCounts([{ topic: "a" }, { topic: "a" }, { topic: "b" }])).toEqual([
    { topic: "a", count: 2 },
    { topic: "b", count: 1 },
  ])
})

test("empty input yields an empty list", () => {
  expect(topicCounts([])).toEqual([])
})
