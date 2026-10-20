// APORIA: process-wide "we are really quitting" flag. Closing a window hides it (keeping the app
// alive in the tray so background delivery continues); only a deliberate quit sets this, and the
// close handlers consult it. Kept in its own module so the early window and the main windows can
// both read it without an import cycle.
let quitting = false

export function setQuitting(value = true) {
  quitting = value
}

export function isQuitting() {
  return quitting
}
