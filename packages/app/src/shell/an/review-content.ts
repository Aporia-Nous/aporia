// AP-STAGE4-18: classify + format Review Code/Documents content (viewable surfaces, not empty shells).

export const REVIEW_CODE_EXTS = [
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "json",
  "css",
  "scss",
  "less",
  "html",
  "htm",
  "vue",
  "svelte",
  "py",
  "rs",
  "go",
  "java",
  "kt",
  "swift",
  "c",
  "cc",
  "cpp",
  "h",
  "hpp",
  "cs",
  "rb",
  "php",
  "sh",
  "bash",
  "zsh",
  "ps1",
  "sql",
  "yaml",
  "yml",
  "toml",
  "ini",
  "env",
  "graphql",
  "gql",
  "wasm",
  "zig",
] as const

export const REVIEW_DOCUMENT_EXTS = [
  "md",
  "mdx",
  "markdown",
  "txt",
  "rst",
  "adoc",
  "org",
  "rtf",
  "csv",
  "tsv",
  "log",
] as const

export type ReviewSurfaceKind = "code" | "documents" | "binary"

export type AnReviewLoadedContent = {
  path: string
  surface: ReviewSurfaceKind
  status: "idle" | "loading" | "ready" | "error" | "binary"
  text?: string
  error?: string
  truncated?: boolean
  lineCount?: number
  mimeType?: string
}

/** Soft cap so Review stays responsive; honest truncate marker when exceeded. */
export const REVIEW_MAX_CHARS = 240_000
export const REVIEW_MAX_LINES = 4_000

export function extensionOf(path: string): string {
  const base = path.split(/[\\/]/).pop() ?? path
  const dot = base.lastIndexOf(".")
  if (dot <= 0 || dot === base.length - 1) return ""
  return base.slice(dot + 1).toLowerCase()
}

export function classifyReviewPath(path: string): ReviewSurfaceKind {
  const ext = extensionOf(path)
  if ((REVIEW_DOCUMENT_EXTS as readonly string[]).includes(ext)) return "documents"
  if ((REVIEW_CODE_EXTS as readonly string[]).includes(ext)) return "code"
  // Unknown text-like paths default to code editor surface (honest read-only view).
  if (!ext) return "code"
  return "code"
}

export function reviewTabForPath(path: string): "code" | "documents" {
  return classifyReviewPath(path) === "documents" ? "documents" : "code"
}

export function truncateReviewText(text: string): { text: string; truncated: boolean; lineCount: number } {
  const lines = text.split(/\r?\n/)
  let next = text
  let truncated = false
  if (lines.length > REVIEW_MAX_LINES) {
    next = lines.slice(0, REVIEW_MAX_LINES).join("\n")
    truncated = true
  }
  if (next.length > REVIEW_MAX_CHARS) {
    next = next.slice(0, REVIEW_MAX_CHARS)
    truncated = true
  }
  return { text: next, truncated, lineCount: next.split(/\r?\n/).length }
}

export function formatCodeLines(text: string): { number: string; text: string }[] {
  const lines = text.length ? text.split(/\r?\n/) : [""]
  const width = String(lines.length).length
  return lines.map((line, index) => ({
    number: String(index + 1).padStart(width, " "),
    text: line.length ? line : " ",
  }))
}

/**
 * Lightweight document preview: escape HTML, apply a few markdown-ish cues.
 * Not a full MD engine — honest readable preview inside Review.
 */
export function documentPreviewHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
  const blocks = escaped.split(/\n{2,}/)
  return blocks
    .map((block) => {
      const trimmed = block.trim()
      if (!trimmed) return ""
      if (/^#{1,6}\s/.test(trimmed)) {
        const level = Math.min(trimmed.match(/^#+/)![0].length, 4)
        const title = trimmed.replace(/^#{1,6}\s+/, "")
        return `<h${level} class="an-review-doc-h">${title}</h${level}>`
      }
      if (/^[-*]\s/m.test(trimmed) && trimmed.split("\n").every((l) => /^[-*]\s|^$/.test(l.trim()) || /^[-*]\s/.test(l))) {
        const items = trimmed
          .split("\n")
          .filter((l) => l.trim())
          .map((l) => `<li>${inlineDocMarks(l.replace(/^[-*]\s+/, ""))}</li>`)
          .join("")
        return `<ul class="an-review-doc-ul">${items}</ul>`
      }
      return `<p class="an-review-doc-p">${inlineDocMarks(trimmed).replace(/\n/g, "<br/>")}</p>`
    })
    .filter(Boolean)
    .join("")
}

function inlineDocMarks(input: string): string {
  return input
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
}

export function readyReviewContent(
  path: string,
  text: string,
  opts?: { mimeType?: string },
): AnReviewLoadedContent {
  const surface = classifyReviewPath(path)
  const { text: body, truncated, lineCount } = truncateReviewText(text)
  return {
    path,
    surface,
    status: "ready",
    text: body,
    truncated,
    lineCount,
    mimeType: opts?.mimeType,
  }
}

export function binaryReviewContent(path: string, opts?: { mimeType?: string; error?: string }): AnReviewLoadedContent {
  return {
    path,
    surface: "binary",
    status: "binary",
    mimeType: opts?.mimeType,
    error: opts?.error ?? "Binary file — open in an external viewer; Review shows text surfaces only.",
  }
}

export function errorReviewContent(path: string, error: string): AnReviewLoadedContent {
  return {
    path,
    surface: classifyReviewPath(path),
    status: "error",
    error,
  }
}

export function loadingReviewContent(path: string): AnReviewLoadedContent {
  return {
    path,
    surface: classifyReviewPath(path),
    status: "loading",
  }
}
