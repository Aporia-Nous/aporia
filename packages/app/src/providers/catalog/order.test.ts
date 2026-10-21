import { expect, test } from "bun:test"
import { popularProviders, unpaidFeaturedProviders } from "./order"

test("unpaid featured list surfaces OpenCode free path and local providers", () => {
  expect(unpaidFeaturedProviders).toContain("opencode")
  expect(unpaidFeaturedProviders).toContain("ollama")
  expect(unpaidFeaturedProviders).toContain("lmstudio")
  expect(unpaidFeaturedProviders.indexOf("ollama")).toBeLessThan(unpaidFeaturedProviders.indexOf("openai"))
})

test("settings popular list surfaces Ollama and LM Studio for discoverability", () => {
  expect(popularProviders).toContain("ollama")
  expect(popularProviders).toContain("lmstudio")
  expect(popularProviders.indexOf("ollama")).toBeLessThan(popularProviders.indexOf("anthropic"))
})
