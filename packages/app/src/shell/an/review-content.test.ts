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

describe("review-content (AP-STAGE4-18/19)", () => {
  test("classifies code vs documents by extension", () => {
    expect(classifyReviewPath("src/shell/an/tokens.ts")).toBe("code")
    expect(classifyReviewPath("README.md")).toBe("documents")
    expect(classifyReviewPath("notes.markdown")).toBe("documents")
    expect(classifyReviewPath("brief.docx")).toBe("documents")
    expect(classifyReviewPath("sheet.xlsx")).toBe("documents")
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

  test("fuller MD: fences, quotes, tables, ordered lists (AP-STAGE4-19)", () => {
    const md = [
      "## Plan",
      "",
      "> note",
      "",
      "```ts",
      "const x = 1",
      "```",
      "",
      "| A | B |",
      "| --- | --- |",
      "| 1 | 2 |",
      "",
      "1. first",
      "2. second",
      "",
      "[link](https://example.com)",
    ].join("\n")
    const html = documentPreviewHtml(md, { path: "plan.md" })
    expect(html).toContain("<h2")
    expect(html).toContain("an-review-doc-bq")
    expect(html).toContain("an-review-doc-pre")
    expect(html).toContain("const x = 1")
    expect(html).toContain("an-review-doc-table")
    expect(html).toContain("<th>")
    expect(html).toContain("<ol")
    expect(html).toContain('href="https://example.com"')
  })

  test("CSV preview renders table", () => {
    const html = documentPreviewHtml("name,role\nGrok,Lead\nOrion,Scout", { path: "team.csv" })
    expect(html).toContain("an-review-doc-csv")
    expect(html).toContain("<th>name</th>")
    expect(html).toContain("<td>Grok</td>")
  })

  test("readyReviewContent binds path + text", () => {
    const content = readyReviewContent("foo.ts", "const x = 1")
    expect(content.status).toBe("ready")
    expect(content.surface).toBe("code")
    expect(content.text).toBe("const x = 1")
    expect(content.path).toBe("foo.ts")
  })
})
