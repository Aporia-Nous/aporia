import { describe, expect, test } from "bun:test"
import {
  classifyReviewPath,
  documentPreviewHtml,
  formatCodeLines,
  readyReviewContent,
  reviewTabForPath,
  truncateReviewText,
  REVIEW_MAX_LINES,
} from "./review-content"

describe("review-content (AP-STAGE4-18)", () => {
  test("classifies code vs documents by extension", () => {
    expect(classifyReviewPath("src/shell/an/tokens.ts")).toBe("code")
    expect(classifyReviewPath("README.md")).toBe("documents")
    expect(classifyReviewPath("notes.markdown")).toBe("documents")
    expect(reviewTabForPath("app.tsx")).toBe("code")
    expect(reviewTabForPath("docs/plan.md")).toBe("documents")
  })

  test("formats line-numbered code preview", () => {
    const lines = formatCodeLines("a\nb\nc")
    expect(lines).toHaveLength(3)
    expect(lines[0]).toEqual({ number: "1", text: "a" })
    expect(lines[2].number).toBe("3")
  })

  test("truncates huge text honestly", () => {
    const huge = Array.from({ length: REVIEW_MAX_LINES + 40 }, (_, i) => `line-${i}`).join("\n")
    const result = truncateReviewText(huge)
    expect(result.truncated).toBe(true)
    expect(result.lineCount).toBeLessThanOrEqual(REVIEW_MAX_LINES)
  })

  test("document preview escapes HTML and marks headings", () => {
    const html = documentPreviewHtml("# Title\n\nHello <script>x</script>\n\n- one\n- two")
    expect(html).toContain("<h1")
    expect(html).toContain("&lt;script&gt;")
    expect(html).not.toContain("<script>")
    expect(html).toContain("<ul")
    expect(html).toContain("<li>")
  })

  test("readyReviewContent binds path + text", () => {
    const content = readyReviewContent("foo.ts", "const x = 1")
    expect(content.status).toBe("ready")
    expect(content.surface).toBe("code")
    expect(content.text).toBe("const x = 1")
    expect(content.path).toBe("foo.ts")
  })
})
