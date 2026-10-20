/**
 * AP-STAGE4-NEW-TEAMMATE — AnShell create/edit/import sheet (AN ice glass).
 * Save is the only durable write for create; Cancel closes with no half-bot.
 */
import { Show, createEffect, createMemo, createSignal, type JSX } from "solid-js"
import { Portal } from "solid-js/web"
import { bots, refreshBots, routines, type Bot } from "@/aporia/bots"
import { aporiaAlerts } from "@/aporia/alerts"
import {
  anTeammateSlugify,
  archiveTeammateCopy,
  draftFromBot,
  emptyTeammateDraft,
  parseTeammateTemplate,
  permissionsCostNote,
  resolveImportIdentity,
  templateToDraft,
  validateTeammateDraft,
  type AnTeammateDraft,
} from "./lifecycle"

export type AnTeammateSheetMode = "create" | "edit" | "import"

export type AnTeammateSheetProps = {
  mode: AnTeammateSheetMode
  /** Existing bot when editing. */
  bot?: Partial<Bot>
  /** CDP/fixture: apply parsed template once on open (import mode). */
  importSeed?: unknown
  existingSlugs: readonly string[]
  onClose: () => void
  /** After successful save/archive/import — refresh roster / open conversation. */
  onCommitted?: (result: { op: "save" | "archive" | "import"; bot: Bot }) => void
}

export function AnTeammateSheet(props: AnTeammateSheetProps): JSX.Element {
  const isEdit = () => props.mode === "edit" && !!props.bot?.slug
  const [draft, setDraft] = createSignal<AnTeammateDraft>(
    isEdit() ? draftFromBot(props.bot!) : emptyTeammateDraft(),
  )
  const [error, setError] = createSignal("")
  const [busy, setBusy] = createSignal(false)
  const [importNote, setImportNote] = createSignal<string>()
  const [advanced, setAdvanced] = createSignal(false)
  const [confirmArchive, setConfirmArchive] = createSignal(false)

  const applyImportObject = (raw: unknown) => {
    setError("")
    const parsed = parseTeammateTemplate(raw)
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    const identity = resolveImportIdentity(props.existingSlugs, parsed.desiredName)
    if (identity.duplicate) {
      setImportNote(
        `Duplicate identity detected (slug "${identity.conflictSlug}"). Import will use "${identity.suggestedName}" so existing bots are not corrupted.`,
      )
    } else {
      setImportNote("Template valid — review fields, then Save.")
    }
    setDraft(templateToDraft(parsed.template, identity.duplicate ? identity.suggestedName : parsed.desiredName))
  }

  createEffect(() => {
    if (props.mode === "edit" && props.bot?.slug) {
      setDraft(draftFromBot(props.bot))
      setImportNote(undefined)
      setConfirmArchive(false)
    } else if (props.mode === "create") {
      setDraft(emptyTeammateDraft())
      setImportNote(undefined)
    } else if (props.mode === "import") {
      setDraft(emptyTeammateDraft({ folder: "Imported" }))
      setImportNote(undefined)
      if (props.importSeed !== undefined) applyImportObject(props.importSeed)
    }
  })

  const previewSlug = createMemo(() =>
    isEdit() ? String(props.bot?.slug ?? "") : anTeammateSlugify(draft().name || "bot"),
  )
  const costNote = createMemo(() => permissionsCostNote(draft()))

  const set = <K extends keyof AnTeammateDraft>(key: K, value: AnTeammateDraft[K]) => {
    setDraft({ ...draft(), [key]: value })
    setError("")
  }

  const listCsv = (v: string) =>
    v
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)

  const close = () => {
    // Cancel: discard in-memory draft only — never saveBot.
    props.onClose()
  }

  const save = async () => {
    setError("")
    const validated = validateTeammateDraft(draft(), props.existingSlugs, {
      editingSlug: isEdit() ? props.bot?.slug : undefined,
    })
    if (!validated.ok) {
      setError(validated.error)
      return
    }
    setBusy(true)
    try {
      const saved = (await bots({
        op: "save",
        bot: {
          ...validated.draft,
          slug: validated.slug,
          routines: isEdit() ? (props.bot?.routines ?? []) : [],
        },
      })) as Bot
      refreshBots()
      aporiaAlerts.push({
        title: isEdit() ? `Updated ${saved.name}` : `Created ${saved.name}`,
        detail: isEdit()
          ? "Configuration preserved on disk."
          : "Teammate is on the roster with a persistent conversation path.",
        level: "success",
      })
      props.onCommitted?.({ op: props.mode === "import" ? "import" : "save", bot: saved })
      props.onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const onFileImport = async (file: File | undefined) => {
    if (!file) return
    try {
      const text = await file.text()
      applyImportObject(JSON.parse(text))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const onDialogImport = async () => {
    setBusy(true)
    setError("")
    try {
      const imported = (await routines({ op: "import" })) as Bot | null
      if (!imported) {
        setImportNote("Import canceled — no teammate written.")
        return
      }
      refreshBots()
      aporiaAlerts.push({
        title: `Imported ${imported.name}`,
        detail:
          "Desktop import may auto-rename on slug clash. Routines stay off until enabled. Review in Edit if needed.",
        level: "success",
      })
      props.onCommitted?.({ op: "import", bot: imported })
      props.onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const archive = async () => {
    if (!props.bot?.slug) return
    const copy = archiveTeammateCopy({
      name: String(props.bot.name ?? props.bot.slug),
      sessions: props.bot.sessions,
    })
    if (!confirmArchive()) {
      setConfirmArchive(true)
      setError(copy.detail)
      return
    }
    setBusy(true)
    try {
      await bots({ op: "delete", slug: props.bot.slug })
      refreshBots()
      aporiaAlerts.push({
        title: `Archived ${props.bot.name ?? props.bot.slug}`,
        detail: "Roster updated. Memory folder + bot.json backup kept.",
        level: "success",
      })
      props.onCommitted?.({
        op: "archive",
        bot: { ...(props.bot as Bot), slug: props.bot.slug },
      })
      props.onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const title = () => {
    if (props.mode === "import") return "Import teammate"
    if (isEdit()) return `Edit ${props.bot?.name ?? "teammate"}`
    return "New teammate"
  }

  return (
    <Portal>
      <div
        class="an-teammate-overlay"
        role="presentation"
        data-component="an-teammate-overlay"
        onClick={close}
      >
        <div
          class="an-teammate-sheet"
          role="dialog"
          aria-modal="true"
          aria-label={title()}
          data-component="an-teammate-sheet"
          data-mode={props.mode}
          data-testid="an-teammate-sheet"
          onClick={(e) => e.stopPropagation()}
        >
          <header class="an-teammate-sheet-head">
            <div>
              <strong>{title()}</strong>
              <span class="an-teammate-sheet-sub">
                Id preview: <code data-an-teammate-slug={previewSlug()}>{previewSlug()}</code>
              </span>
            </div>
            <button type="button" class="an-teammate-icon-btn" aria-label="Cancel" data-action="teammate-cancel" onClick={close}>
              ✕
            </button>
          </header>

          <div class="an-teammate-sheet-body">
            <Show when={props.mode === "import" || props.mode === "create"}>
              <div class="an-teammate-import-row">
                <label class="an-teammate-file">
                  Import .aporia-bot.json
                  <input
                    type="file"
                    accept=".json,application/json"
                    data-action="teammate-import-file"
                    onChange={(e) => void onFileImport(e.currentTarget.files?.[0])}
                  />
                </label>
                <button
                  type="button"
                  class="an-teammate-btn an-teammate-btn-ghost"
                  data-action="teammate-import-dialog"
                  disabled={busy()}
                  title="Uses the desktop open dialog when available"
                  onClick={() => void onDialogImport()}
                >
                  OS dialog…
                </button>
              </div>
            </Show>

            <Show when={importNote()}>
              <p class="an-teammate-note" data-an-part="import-note" role="status">
                {importNote()}
              </p>
            </Show>

            <label class="an-teammate-field">
              Name
              <input
                data-action="teammate-name"
                value={draft().name}
                onInput={(e) => set("name", e.currentTarget.value)}
                placeholder="e.g. Reviewer"
                autofocus
              />
            </label>
            <label class="an-teammate-field">
              Avatar (emoji or 2 letters)
              <input
                data-action="teammate-avatar"
                value={draft().avatar ?? ""}
                onInput={(e) => set("avatar", e.currentTarget.value)}
              />
            </label>
            <label class="an-teammate-field">
              Role / responsibility
              <textarea
                data-action="teammate-role"
                value={draft().role}
                onInput={(e) => set("role", e.currentTarget.value)}
                placeholder="One clear job this teammate owns"
                rows={2}
              />
            </label>
            <label class="an-teammate-field">
              Instructions
              <textarea
                data-action="teammate-instructions"
                value={draft().instructions}
                onInput={(e) => set("instructions", e.currentTarget.value)}
                placeholder="Goals, steps, what needs Ali's OK"
                rows={5}
              />
            </label>
            <label class="an-teammate-field">
              Model
              <input
                data-action="teammate-model"
                value={draft().model}
                onInput={(e) => set("model", e.currentTarget.value)}
              />
            </label>

            <p class="an-teammate-note" data-an-part="permissions-cost">
              {costNote()}
            </p>

            <button
              type="button"
              class="an-teammate-btn an-teammate-btn-ghost"
              data-action="teammate-advanced"
              aria-expanded={advanced()}
              onClick={() => setAdvanced(!advanced())}
            >
              {advanced() ? "Hide advanced" : "Advanced (tools / skills / memory folder)"}
            </button>

            <Show when={advanced()}>
              <label class="an-teammate-field">
                Folder
                <input value={draft().folder ?? ""} onInput={(e) => set("folder", e.currentTarget.value)} />
              </label>
              <label class="an-teammate-field">
                Skills (comma separated)
                <input
                  value={(draft().skills ?? []).join(", ")}
                  onInput={(e) => set("skills", listCsv(e.currentTarget.value))}
                />
              </label>
              <label class="an-teammate-field">
                Allowed tools (empty = all)
                <input
                  value={(draft().tools ?? []).join(", ")}
                  onInput={(e) => set("tools", listCsv(e.currentTarget.value))}
                />
              </label>
              <label class="an-teammate-field">
                Allowed MCPs (empty = all)
                <input
                  value={(draft().mcps ?? []).join(", ")}
                  onInput={(e) => set("mcps", listCsv(e.currentTarget.value))}
                />
              </label>
              <label class="an-teammate-field">
                Kind
                <select
                  value={draft().kind ?? "worker"}
                  onChange={(e) => set("kind", e.currentTarget.value as AnTeammateDraft["kind"])}
                >
                  <option value="worker">Worker — answers directly</option>
                  <option value="expert">Expert — researches before answering</option>
                </select>
              </label>
              <p class="an-teammate-note">
                Safe local preview fixture is not a paid model call in this sheet — Save persists config only.
                Missing provider/tool/memory shows when the desktop bridge rejects save.
              </p>
            </Show>

            <Show when={error()}>
              <div class="an-teammate-error" role="alert" data-an-part="teammate-error">
                {error()}
              </div>
            </Show>
          </div>

          <footer class="an-teammate-sheet-foot">
            <Show when={isEdit()}>
              <button
                type="button"
                class="an-teammate-btn an-teammate-btn-danger"
                data-action="teammate-archive"
                disabled={busy()}
                onClick={() => void archive()}
              >
                {confirmArchive() ? "Confirm archive" : "Archive"}
              </button>
            </Show>
            <div class="an-teammate-sheet-foot-end">
              <button
                type="button"
                class="an-teammate-btn an-teammate-btn-ghost"
                data-action="teammate-cancel"
                disabled={busy()}
                onClick={close}
              >
                Cancel
              </button>
              <button
                type="button"
                class="an-teammate-btn an-teammate-btn-primary"
                data-action="teammate-save"
                disabled={busy()}
                onClick={() => void save()}
              >
                {busy() ? "Saving…" : "Save"}
              </button>
            </div>
          </footer>
        </div>
      </div>
    </Portal>
  )
}

/** CDP / fixture probe — no durable write until save(). */
export type AnTeammateProbe = {
  openCreate: () => void
  openEdit: (slug: string) => void
  openImport: () => void
  applyImportJson: (raw: unknown) => void
  cancel: () => void
}

export function installAnTeammateWindowProbe(api: AnTeammateProbe) {
  ;(globalThis as { __anTeammate?: AnTeammateProbe }).__anTeammate = api
}

export function AnTeammateRosterMenu(props: {
  x: number
  y: number
  slug: string
  name: string
  onEdit: () => void
  onArchive: () => void
  onClose: () => void
}): JSX.Element {
  return (
    <Portal>
      <div
        class="an-teammate-ctx-overlay"
        data-component="an-teammate-ctx"
        onClick={props.onClose}
        onContextMenu={(e) => {
          e.preventDefault()
          props.onClose()
        }}
      >
        <div
          class="an-teammate-ctxmenu"
          style={{ left: `${props.x}px`, top: `${props.y}px` }}
          onClick={(e) => e.stopPropagation()}
        >
          <button type="button" data-action="teammate-menu-edit" onClick={props.onEdit}>
            Edit {props.name}
          </button>
          <button type="button" data-action="teammate-menu-archive" onClick={props.onArchive}>
            Archive…
          </button>
        </div>
      </div>
    </Portal>
  )
}

export function AnTeammateFooterActions(props: {
  onNew: () => void
  onImport: () => void
}): JSX.Element {
  return (
    <div class="an-teammate-footer-actions">
      <button
        type="button"
        class="an-new-teammate"
        data-action="an-new-teammate"
        title="Create a teammate"
        onClick={props.onNew}
      >
        + New teammate
      </button>
      <button
        type="button"
        class="an-import-teammate"
        data-action="an-import-teammate"
        title="Import .aporia-bot.json"
        onClick={props.onImport}
      >
        Import
      </button>
    </div>
  )
}
