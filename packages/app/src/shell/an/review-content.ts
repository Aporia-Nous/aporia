// AP-STAGE4-18/19: classify + format Review Code/Documents content (viewable surfaces, not empty shells).
// STAGE4-19: fuller MD (fences/tables/quotes/ol) + CSV table; docx via free OOXML path.

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

/** Office formats routed to Documents; docx may text-extract; others honest residual. */
export const REVIEW_OFFICE_EXTS = ["docx", "xlsx", "xlsm", "pptx", "pptm", "doc", "xls", "ppt"] as const

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
  /** Preview engine hint for Documents UI. */
  previewKind?: "markdown" | "csv" | "plain" | "docx-text" | "office-residual"
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
  if ((REVIEW_OFFICE_EXTS as readonly string[]).includes(ext)) return "documents"
  if ((REVIEW_CODE_EXTS as readonly string[]).includes(ext)) return "code"
  // Unknown text-like paths default to code editor surface (honest read-only view).
  if (!ext) return "code"
  return "code"
}

export function reviewTabForPath(path: string): "code" | "documents" {
  return classifyReviewPath(path) === "documents" ? "documents" : "code"
}

export function isOfficeReviewPath(path: string): boolean {
  return (REVIEW_OFFICE_EXTS as readonly string[]).includes(extensionOf(path))
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

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function inlineDocMarks(input: string): string {
  let s = escapeHtml(input)
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>")
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
  s = s.replace(/__([^_]+)__/g, "<strong>$1</strong>")
  s = s.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>")
  s = s.replace(/(?<!_)_([^_]+)_(?!_)/g, "<em>$1</em>")
  s = s.replace(/~~([^~]+)~~/g, "<del>$1</del>")
  s = s.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
    '<a class="an-review-doc-a" href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
  )
  return s
}

function isTableSeparator(line: string): boolean {
  const t = line.trim()
  // GFM separator row: | --- | :---: | --- |
  return /^\|?[\s:|-]+\|[\s:|-]+/.test(t) && /-{2,}/.test(t)
}

function parseTable(lines: string[], start: number): { html: string; next: number } | null {
  if (start + 1 >= lines.length) return null
  const header = lines[start]!.trim()
  const sep = lines[start + 1]!.trim()
  if (!header.includes("|") || !isTableSeparator(sep)) return null
  const splitRow = (row: string) =>
    row
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((c) => c.trim())
  const heads = splitRow(header)
  let i = start + 2
  const body: string[][] = []
  while (i < lines.length && lines[i]!.includes("|") && lines[i]!.trim()) {
    body.push(splitRow(lines[i]!))
    i++
  }
  const thead = `<thead><tr>${heads.map((h) => `<th>${inlineDocMarks(h)}</th>`).join("")}</tr></thead>`
  const tbody = `<tbody>${body
    .map((row) => `<tr>${row.map((c) => `<td>${inlineDocMarks(c)}</td>`).join("")}</tr>`)
    .join("")}</tbody>`
  return { html: `<table class="an-review-doc-table">${thead}${tbody}</table>`, next: i }
}

/**
 * Fuller document preview (STAGE4-19): MD fences/tables/quotes/ol/ul + CSV tables.
 * Escapes HTML; not a full CommonMark engine — honest readable in-panel path.
 */
export function documentPreviewHtml(text: string, opts?: { path?: string }): string {
  const ext = opts?.path ? extensionOf(opts.path) : ""
  if (ext === "csv" || ext === "tsv") return csvPreviewHtml(text, ext === "tsv" ? "\t" : ",")

  const lines = text.replace(/\r\n?/g, "\n").split("\n")
  const out: string[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]!
    const trimmed = line.trim()
    if (!trimmed) {
      i++
      continue
    }

    const fence = trimmed.match(/^(`{3,}|~{3,})(.*)$/)
    if (fence) {
      const marker = fence[1]!
      const lang = (fence[2] || "").trim()
      const body: string[] = []
      i++
      while (i < lines.length && !lines[i]!.trim().startsWith(marker[0]!.repeat(marker.length))) {
        body.push(lines[i]!)
        i++
      }
      if (i < lines.length) i++
      out.push(
        `<pre class="an-review-doc-pre"${lang ? ` data-lang="${escapeHtml(lang)}"` : ""}><code>${escapeHtml(body.join("\n"))}</code></pre>`,
      )
      continue
    }

    if (/^#{1,6}\s/.test(trimmed)) {
      const level = Math.min(trimmed.match(/^#+/)![0].length, 6)
      const title = trimmed.replace(/^#{1,6}\s+/, "")
      out.push(`<h${level} class="an-review-doc-h">${inlineDocMarks(title)}</h${level}>`)
      i++
      continue
    }

    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(trimmed)) {
      out.push('<hr class="an-review-doc-hr" />')
      i++
      continue
    }

    if (trimmed.startsWith(">")) {
      const quote: string[] = []
      while (i < lines.length && lines[i]!.trim().startsWith(">")) {
        quote.push(lines[i]!.trim().replace(/^>\s?/, ""))
        i++
      }
      out.push(`<blockquote class="an-review-doc-bq">${inlineDocMarks(quote.join("\n")).replace(/\n/g, "<br/>")}</blockquote>`)
      continue
    }

    const table = parseTable(lines, i)
    if (table) {
      out.push(table.html)
      i = table.next
      continue
    }

    if (/^([-*+]|\d+\.)\s/.test(trimmed)) {
      const ordered = /^\d+\.\s/.test(trimmed)
      const items: string[] = []
      while (i < lines.length && /^([-*+]|\d+\.)\s/.test(lines[i]!.trim())) {
        items.push(lines[i]!.trim().replace(/^([-*+]|\d+\.)\s+/, ""))
        i++
      }
      const tag = ordered ? "ol" : "ul"
      out.push(
        `<${tag} class="an-review-doc-${tag}">${items.map((item) => `<li>${inlineDocMarks(item)}</li>`).join("")}</${tag}>`,
      )
      continue
    }

    const para: string[] = [trimmed]
    i++
    while (i < lines.length) {
      const next = lines[i]!.trim()
      if (!next) break
      if (/^#{1,6}\s/.test(next) || /^([-*+]|\d+\.)\s/.test(next) || next.startsWith(">") || next.startsWith("```") || next.startsWith("~~~"))
        break
      if (next.includes("|") && i + 1 < lines.length && isTableSeparator(lines[i + 1]!.trim())) break
      para.push(next)
      i++
    }
    out.push(`<p class="an-review-doc-p">${inlineDocMarks(para.join("\n")).replace(/\n/g, "<br/>")}</p>`)
  }
  return out.join("")
}

export function csvPreviewHtml(text: string, delimiter = ","): string {
  const rows = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((l) => l.length)
    .slice(0, 200)
  if (!rows.length) return '<p class="an-review-doc-p">(empty)</p>'
  const split = (row: string) => {
    // Simple CSV split — quoted fields with delimiter inside stay together when paired quotes.
    const cells: string[] = []
    let cur = ""
    let inQ = false
    for (let i = 0; i < row.length; i++) {
      const ch = row[i]!
      if (ch === '"') {
        inQ = !inQ
        continue
      }
      if (!inQ && ch === delimiter) {
        cells.push(cur)
        cur = ""
        continue
      }
      cur += ch
    }
    cells.push(cur)
    return cells
  }
  const parsed = rows.map(split)
  const head = parsed[0]!
  const body = parsed.slice(1)
  const thead = `<thead><tr>${head.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>`
  const tbody = `<tbody>${body
    .map((row) => `<tr>${row.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`)
    .join("")}</tbody>`
  return `<table class="an-review-doc-table an-review-doc-csv">${thead}${tbody}</table>`
}

function previewKindForPath(path: string): AnReviewLoadedContent["previewKind"] {
  const ext = extensionOf(path)
  if (ext === "csv" || ext === "tsv") return "csv"
  if (ext === "md" || ext === "mdx" || ext === "markdown") return "markdown"
  if (ext === "docx") return "docx-text"
  if ((REVIEW_OFFICE_EXTS as readonly string[]).includes(ext)) return "office-residual"
  return "plain"
}

export function readyReviewContent(
  path: string,
  text: string,
  opts?: { mimeType?: string; previewKind?: AnReviewLoadedContent["previewKind"] },
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
    previewKind: opts?.previewKind ?? previewKindForPath(path),
  }
}

export function binaryReviewContent(path: string, opts?: { mimeType?: string; error?: string }): AnReviewLoadedContent {
  return {
    path,
    surface: "binary",
    status: "binary",
    mimeType: opts?.mimeType,
    error: opts?.error ?? "Binary file — open in an external viewer; Review shows text surfaces only.",
    previewKind: previewKindForPath(path),
  }
}

export function errorReviewContent(path: string, error: string): AnReviewLoadedContent {
  return {
    path,
    surface: classifyReviewPath(path),
    status: "error",
    error,
    previewKind: previewKindForPath(path),
  }
}

export function loadingReviewContent(path: string): AnReviewLoadedContent {
  return {
    path,
    surface: classifyReviewPath(path),
    status: "loading",
    previewKind: previewKindForPath(path),
  }
}
