// APORIA: structured logging for main-process Aporetic code that runs outside the Effect runtime
// (pre-window startup, the routines tick). electron-log is the app's file logger — native/logging.ts
// writes the Effect logger into the same files — so a scoped logger keeps Aporetic lines together and
// survives before the Effect logging layer exists.
import log from "electron-log/main.js"

export const aporiaLog = log.scope("aporia")
