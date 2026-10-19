// AP-STAGE4-17: collapsible in-app Review panel (browser / code / files / documents).
// ChatGPT/Cursor-style side review — stays in the main AnShell window (no extra Electron window).
import { For, Show, createEffect, createSignal, type JSX } from "solid-js"
import { aporiaPrefs } from "@/aporia/prefs"
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
  /** Optional code path hint for Code tab (honest stub until editor bind). */
  codePath?: string
  /** Optional document title for Documents tab. */
  documentTitle?: string
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

export function AnReviewPanel(props: AnReviewPanelProps): JSX.Element {
  const [tab, setTab] = createSignal<AnReviewTab>(props.initialTab ?? "browser")
  const [browserUsed, setBrowserUsed] = createSignal(false)
  const [draft, setDraft] = createSignal(aporiaPrefs.browserUrl() || props.computerFeedUrl || "")
  const [src, setSrc] = createSignal(aporiaPrefs.browserUrl() || "")
  const [error, setError] = createSignal<string | undefined>()

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

  return (
    <aside
      class="an-review"
      data-component="an-review"
      data-an-part={AN_REVIEW_SURFACE.part}
      data-review-tab={tab()}
      data-collapsed="false"
      aria-label={`${AN_REVIEW_SURFACE.label} — ${AN_REVIEW_SURFACE.subtitle}`}
    >
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

      <div class="an-review-body">
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
            <strong>Code</strong>
            <p class="an-review-hint">
              In-app code review surface. Editor bind is not claimed Live yet — paths appear here when sourced.
            </p>
            <Show when={props.codePath} fallback={<p class="an-review-empty-line">No code path selected.</p>}>
              <code class="an-review-path" data-an-part="review-code-path">
                {props.codePath}
              </code>
            </Show>
          </div>
        </Show>

        <Show when={tab() === "files"}>
          <div class="an-review-pane" data-an-part="review-files">
            <strong>Files</strong>
            <ul class="an-review-files" data-an-part="review-file-list">
              <For
                each={props.files ?? []}
                fallback={<li class="an-review-empty-line">No session files yet.</li>}
              >
                {(file) => (
                  <li title={file.path}>
                    <span class="an-review-path">{file.path}</span>
                    <Show when={file.via}>
                      <span class="an-review-via">{file.via}</span>
                    </Show>
                  </li>
                )}
              </For>
            </ul>
          </div>
        </Show>

        <Show when={tab() === "documents"}>
          <div class="an-review-pane" data-an-part="review-documents">
            <strong>Documents</strong>
            <p class="an-review-hint">
              Document review stays in this panel — not a separate window. Full doc viewer bind remains OPEN.
            </p>
            <Show
              when={props.documentTitle}
              fallback={<p class="an-review-empty-line">No document open.</p>}
            >
              <p class="an-review-path" data-an-part="review-document-title">
                {props.documentTitle}
              </p>
            </Show>
          </div>
        </Show>
      </div>
    </aside>
  )
}
