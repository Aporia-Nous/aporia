// AP-STAGE4-17/18: collapsible in-app Review panel (browser / code / files / documents).
// STAGE4-18: Code + Documents bind to real viewable content (editor/doc preview), not empty shells.
import { For, Show, createEffect, createMemo, createSignal, type JSX } from "solid-js"
import { aporiaPrefs } from "@/aporia/prefs"
import {
  documentPreviewHtml,
  formatCodeLines,
  reviewTabForPath,
  type AnReviewLoadedContent,
} from "./review-content"
import { AN_REVIEW_SURFACE, type AnReviewTab } from "./tokens"

export type AnReviewFile = {
  path: string
  via?: string
}

export type AnReviewPanelProps = {
  onClose?: () => void
  /** Initial tab when opened. */
  initialTab?: AnReviewTab
  /** Session-touched files for the Files tab (honest list; empty ok). */
  files?: AnReviewFile[]
  /** Optional initial code path (opens Code preview when content loads). */
  codePath?: string
  /** Optional initial document path. */
  documentPath?: string
  /** Loaded Code surface content (from workspace read). */
  codeContent?: AnReviewLoadedContent
  /** Loaded Documents surface content. */
  documentContent?: AnReviewLoadedContent
  /** Request load for a path into Code or Documents. */
  onRequestPath?: (path: string, tab: "code" | "documents") => void
  /** When true, prefer showing Computer View / page feed note in Browser tab. */
  computerLive?: boolean
  computerFeedUrl?: string
}

function normalizeReviewUrl(input: string): { ok: true; url: string } | { ok: false; error: string } {
  const raw = input.trim()
  if (!raw) return { ok: false, error: "Enter a URL to view in the Review panel." }
  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw) ? raw : `https://${raw}`
  if (withScheme === "about:blank") return { ok: true, url: "about:blank" }
  if (!URL.canParse(withScheme)) return { ok: false, error: "URL could not be parsed." }
  const url = new URL(withScheme)
  if (url.username || url.password) {
    return { ok: false, error: "URLs with credentials are not supported in Review." }
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "Only HTTP, HTTPS, and about:blank are supported here." }
  }
  return { ok: true, url: url.href }
}

function CodeEditorSurface(props: { content?: AnReviewLoadedContent; emptyHint: string }): JSX.Element {
  const lines = createMemo(() => (props.content?.text != null ? formatCodeLines(props.content.text) : []))
  return (
    <div class="an-review-editor" data-an-part="review-code-editor" data-status={props.content?.status ?? "idle"}>
      <Show when={props.content?.path}>
        <div class="an-review-editor-meta" data-an-part="review-code-path">
          <code class="an-review-path">{props.content!.path}</code>
          <Show when={props.content?.lineCount}>
            <span class="an-review-via">· {props.content!.lineCount} lines</span>
          </Show>
          <Show when={props.content?.truncated}>
            <span class="an-review-via" data-an-part="review-truncated">
              truncated for Review
            </span>
          </Show>
        </div>
      </Show>
      <Show when={props.content?.status === "loading"}>
        <p class="an-review-hint" data-an-part="review-code-loading">
          Loading code…
        </p>
      </Show>
      <Show when={props.content?.status === "error"}>
        <p class="an-review-error" data-an-part="review-code-error">
          {props.content?.error}
        </p>
      </Show>
      <Show when={props.content?.status === "binary"}>
        <p class="an-review-hint" data-an-part="review-code-binary">
          {props.content?.error}
        </p>
      </Show>
      <Show
        when={props.content?.status === "ready" && props.content?.text != null}
        fallback={
          <Show when={!props.content || props.content.status === "idle"}>
            <div class="an-review-empty" data-an-part="review-code-empty">
              <strong>No code open</strong>
              <span>{props.emptyHint}</span>
            </div>
          </Show>
        }
      >
        <pre class="an-review-code-pre" data-an-part="review-code-body" tabindex="0" aria-label="Code preview">
          <For each={lines()}>
            {(line) => (
              <div class="an-review-code-line">
                <span class="an-review-gutter" aria-hidden="true">
                  {line.number}
                </span>
                <code class="an-review-code-text">{line.text}</code>
              </div>
            )}
          </For>
        </pre>
      </Show>
    </div>
  )
}

function DocumentPreviewSurface(props: { content?: AnReviewLoadedContent; emptyHint: string }): JSX.Element {
  const html = createMemo(() =>
    props.content?.status === "ready" && props.content.text != null ? documentPreviewHtml(props.content.text) : "",
  )
  return (
    <div
      class="an-review-doc"
      data-an-part="review-document-preview"
      data-status={props.content?.status ?? "idle"}
    >
      <Show when={props.content?.path}>
        <div class="an-review-editor-meta" data-an-part="review-document-title">
          <code class="an-review-path">{props.content!.path}</code>
          <Show when={props.content?.truncated}>
            <span class="an-review-via" data-an-part="review-truncated">
              truncated for Review
            </span>
          </Show>
        </div>
      </Show>
      <Show when={props.content?.status === "loading"}>
        <p class="an-review-hint" data-an-part="review-document-loading">
          Loading document…
        </p>
      </Show>
      <Show when={props.content?.status === "error"}>
        <p class="an-review-error" data-an-part="review-document-error">
          {props.content?.error}
        </p>
      </Show>
      <Show when={props.content?.status === "binary"}>
        <p class="an-review-hint" data-an-part="review-document-binary">
          {props.content?.error}
        </p>
      </Show>
      <Show
        when={props.content?.status === "ready" && html()}
        fallback={
          <Show when={!props.content || props.content.status === "idle"}>
            <div class="an-review-empty" data-an-part="review-document-empty">
              <strong>No document open</strong>
              <span>{props.emptyHint}</span>
            </div>
          </Show>
        }
      >
        <div class="an-review-doc-body" data-an-part="review-document-body" innerHTML={html()} />
      </Show>
    </div>
  )
}

export function AnReviewPanel(props: AnReviewPanelProps): JSX.Element {
  const [tab, setTab] = createSignal<AnReviewTab>(props.initialTab ?? "browser")
  const [browserUsed, setBrowserUsed] = createSignal(false)
  const [draft, setDraft] = createSignal(aporiaPrefs.browserUrl() || props.computerFeedUrl || "")
  const [src, setSrc] = createSignal(aporiaPrefs.browserUrl() || "")
  const [error, setError] = createSignal<string | undefined>()
  const [pathDraft, setPathDraft] = createSignal(props.codePath || props.documentPath || "")

  createEffect(() => {
    if (tab() === "browser") setBrowserUsed(true)
  })

  createEffect(() => {
    const preferred = props.computerFeedUrl
    if (preferred && preferred !== "about:blank" && !src()) {
      setDraft(preferred)
      setSrc(preferred)
    }
  })

  createEffect(() => {
    const hint = props.codePath || props.documentPath
    if (hint && !pathDraft()) setPathDraft(hint)
  })

  const openUrl = (value: string) => {
    const normalized = normalizeReviewUrl(value)
    if (!normalized.ok) {
      setError(normalized.error)
      return
    }
    setError(undefined)
    aporiaPrefs.setBrowserUrl(normalized.url === "about:blank" ? "" : normalized.url)
    setSrc(normalized.url)
    setDraft(normalized.url)
  }

  const openPath = (raw: string, forceTab?: "code" | "documents") => {
    const path = raw.trim()
    if (!path) return
    const nextTab = forceTab ?? reviewTabForPath(path)
    setPathDraft(path)
    setTab(nextTab)
    props.onRequestPath?.(path, nextTab)
  }

  return (
    <aside
      class="an-review"
      data-component="an-review"
      data-an-part={AN_REVIEW_SURFACE.part}
      data-review-tab={tab()}
      data-collapsed="false"
      data-holo="stage4-18"
      aria-label={`${AN_REVIEW_SURFACE.label} — ${AN_REVIEW_SURFACE.subtitle}`}
    >
      <div class="an-review-holo-sweep" aria-hidden="true" />
      <header class="an-review-head">
        <div class="an-review-copy">
          <strong>{AN_REVIEW_SURFACE.label}</strong>
          <span class="an-review-sub">{AN_REVIEW_SURFACE.subtitle}</span>
        </div>
        <button
          type="button"
          class="an-review-close"
          data-action="review-collapse"
          aria-label="Collapse Review panel"
          title="Collapse"
          onClick={() => props.onClose?.()}
        >
          »
        </button>
      </header>

      <div class="an-review-tabs" role="tablist" aria-label="Review modes">
        <For each={[...AN_REVIEW_SURFACE.tabs]}>
          {(id) => (
            <button
              type="button"
              role="tab"
              class="an-review-tab"
              data-action={`review-tab-${id}`}
              data-active={tab() === id ? "true" : "false"}
              aria-selected={tab() === id}
              onClick={() => setTab(id)}
            >
              {AN_REVIEW_SURFACE.tabLabel[id]}
            </button>
          )}
        </For>
      </div>

      <div class="an-review-body" data-tab={tab()}>
        <Show when={tab() === "browser"}>
          <div class="an-review-browser" data-an-part="review-browser" style={{ display: browserUsed() ? undefined : "none" }}>
            <form
              class="an-review-browser-bar"
              onSubmit={(event) => {
                event.preventDefault()
                openUrl(draft())
              }}
            >
              <input
                class="an-review-browser-url"
                data-an-part="review-browser-url"
                type="text"
                spellcheck={false}
                autocomplete="off"
                aria-label="Review browser URL"
                placeholder="https://…"
                value={draft()}
                onInput={(event) => setDraft(event.currentTarget.value)}
              />
              <button type="submit" class="an-review-btn" data-action="review-browser-go">
                Go
              </button>
            </form>
            <Show when={error()}>
              <p class="an-review-error" data-an-part="review-error">
                {error()}
              </p>
            </Show>
            <Show when={props.computerLive}>
              <p class="an-review-hint" data-an-part="review-computer-hint">
                Computer View stays Live in AnShell. This Review Browser is the in-app side surface — not a separate OS
                window.
              </p>
            </Show>
            <Show
              when={src()}
              fallback={
                <div class="an-review-empty" data-an-part="review-browser-empty">
                  <strong>No page yet</strong>
                  <span>Open a URL here to review in-app — stays in Aporetic, no extra window.</span>
                </div>
              }
            >
              <iframe
                class="an-review-frame"
                data-an-part="review-browser-frame"
                title="Review browser"
                src={src()}
                sandbox="allow-scripts allow-same-origin allow-forms"
              />
            </Show>
          </div>
        </Show>

        <Show when={tab() === "code"}>
          <div class="an-review-pane" data-an-part="review-code">
            <form
              class="an-review-path-bar"
              data-an-part="review-code-path-bar"
              onSubmit={(event) => {
                event.preventDefault()
                openPath(pathDraft(), "code")
              }}
            >
              <input
                class="an-review-browser-url"
                data-an-part="review-code-path-input"
                type="text"
                spellcheck={false}
                autocomplete="off"
                aria-label="Code path"
                placeholder="path/to/file.ts"
                value={pathDraft()}
                onInput={(event) => setPathDraft(event.currentTarget.value)}
              />
              <button type="submit" class="an-review-btn" data-action="review-code-open">
                Open
              </button>
            </form>
            <CodeEditorSurface
              content={props.codeContent}
              emptyHint="Open a workspace path or pick a file from Files — live read-only preview."
            />
          </div>
        </Show>

        <Show when={tab() === "files"}>
          <div class="an-review-pane" data-an-part="review-files">
            <strong>Files</strong>
            <p class="an-review-hint">Select a file to open in Code or Documents with a real preview.</p>
            <ul class="an-review-files" data-an-part="review-file-list">
              <For
                each={props.files ?? []}
                fallback={<li class="an-review-empty-line">No session files yet.</li>}
              >
                {(file) => (
                  <li>
                    <button
                      type="button"
                      class="an-review-file-btn"
                      data-action="review-open-file"
                      data-path={file.path}
                      title={file.path}
                      onClick={() => openPath(file.path)}
                    >
                      <span class="an-review-path">{file.path}</span>
                      <Show when={file.via}>
                        <span class="an-review-via">{file.via}</span>
                      </Show>
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </div>
        </Show>

        <Show when={tab() === "documents"}>
          <div class="an-review-pane" data-an-part="review-documents">
            <form
              class="an-review-path-bar"
              data-an-part="review-document-path-bar"
              onSubmit={(event) => {
                event.preventDefault()
                openPath(pathDraft(), "documents")
              }}
            >
              <input
                class="an-review-browser-url"
                data-an-part="review-document-path-input"
                type="text"
                spellcheck={false}
                autocomplete="off"
                aria-label="Document path"
                placeholder="docs/readme.md"
                value={pathDraft()}
                onInput={(event) => setPathDraft(event.currentTarget.value)}
              />
              <button type="submit" class="an-review-btn" data-action="review-document-open">
                Open
              </button>
            </form>
            <DocumentPreviewSurface
              content={props.documentContent}
              emptyHint="Open a markdown/text path or pick a document from Files — in-panel preview."
            />
          </div>
        </Show>
      </div>
    </aside>
  )
}
