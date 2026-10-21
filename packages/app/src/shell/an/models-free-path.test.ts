import { describe, expect, test } from "bun:test"
import {
  AN_FREE_BYOK_CONVERSATION_EMPTY,
  AN_FREE_BYOK_PRODUCT_BRIEF,
  AN_FREE_PATH_DEFAULT_MODEL,
  isFreePathDefaultModel,
} from "./models-free-path"
import { AN_TEAMMATE_DEFAULT_MODEL } from "./teammate/lifecycle"

describe("AP-MODELS-01b free-path defaults", () => {
  test("default model is OpenCode Free path, not deepseek BYOK string", () => {
    expect(AN_FREE_PATH_DEFAULT_MODEL).toBe("opencode/big-pickle")
    expect(AN_FREE_PATH_DEFAULT_MODEL.startsWith("opencode/")).toBe(true)
    expect(AN_FREE_PATH_DEFAULT_MODEL).not.toContain("deepseek")
    expect(AN_TEAMMATE_DEFAULT_MODEL).toBe(AN_FREE_PATH_DEFAULT_MODEL)
    expect(isFreePathDefaultModel(AN_TEAMMATE_DEFAULT_MODEL)).toBe(true)
    expect(isFreePathDefaultModel("deepseek/deepseek-flash")).toBe(false)
  })

  test("conversation empty tip is honest free + your-key product brief", () => {
    expect(AN_FREE_BYOK_CONVERSATION_EMPTY).toContain("OpenCode Free")
    expect(AN_FREE_BYOK_CONVERSATION_EMPTY).toContain("API key")
    expect(AN_FREE_BYOK_CONVERSATION_EMPTY).toContain("does not pay for model usage")
    expect(AN_FREE_BYOK_CONVERSATION_EMPTY.toLowerCase()).not.toContain("byok")
    expect(AN_FREE_BYOK_CONVERSATION_EMPTY.toLowerCase()).not.toContain("omniroute")
  })

  test("settings product brief matches economics", () => {
    expect(AN_FREE_BYOK_PRODUCT_BRIEF).toContain("OpenCode Free")
    expect(AN_FREE_BYOK_PRODUCT_BRIEF).toContain("Ollama")
    expect(AN_FREE_BYOK_PRODUCT_BRIEF).toContain("API key")
    expect(AN_FREE_BYOK_PRODUCT_BRIEF).toContain("does not pay for model usage")
    expect(AN_FREE_BYOK_PRODUCT_BRIEF.toLowerCase()).not.toContain("byok")
  })
})
