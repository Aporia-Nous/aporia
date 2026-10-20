/**
 * FLOW-GENIUS-02 / Stage 6 — Mnemosyne memory audit map (read-only classification).
 *
 * Build-list Stage 6 first step: map Mnemosyne as implemented / disconnected / mocked.
 * Does not start or stop shared services. Does not read secrets or production DBs.
 * Cited retrieval in SessionLeanPack stays Aporetic-owned until an owned wire lands.
 */
export * as MissionMemory from "./memory.js"

/** How Mnemosyne relates to Aporetic's SessionRunner lean pack. */
export type MnemosyneStatus = "implemented" | "disconnected" | "mocked"

export type MnemosyneMap = {
  readonly status: MnemosyneStatus
  /** External tree observed read-only (may be absent on other machines). */
  readonly sourcePath: string
  readonly notes: ReadonlyArray<string>
  /** Lean pack owns retrieval slots; Mnemosyne is not injected here yet. */
  readonly leanPackRetrievalOwner: "aporetic-lean-pack"
  readonly recordedDate: "2026-10-20"
}

/** Canonical external path from APORETIC-DEV-BUILD-LIST Stage 6. */
export const MNEMOSYNE_SOURCE_PATH = "C:\\Perseus\\mnemosyne"

/**
 * Static classification for Stage 6 / FLOW-GENIUS-02.
 *
 * - Source tree exists as a sovereign opencode plugin (memory_* tools + idle capture).
 * - Aporetic Stage4 packages do not import or call Mnemosyne → disconnected from lean pack.
 * - Not mocked inside Aporetic.
 */
export const MNEMOSYNE_MAP: MnemosyneMap = {
  status: "disconnected",
  sourcePath: MNEMOSYNE_SOURCE_PATH,
  notes: [
    "Source tree present at C:\\Perseus\\mnemosyne (opencode plugin + bun:sqlite + wave substrate).",
    "Host may also have ~/.config/opencode/plugins/mnemosyne.js — stock opencode plugin path, not Aporetic lean-pack wire.",
    "packages/core SessionRunner does not import mnemosyne; FLOW-GENIUS-02 retrieval is cited slots on the shared lean pack only.",
    "Do not auto-install, do not stop shared services, do not read mnemosyne.db contents in this slice.",
  ],
  leanPackRetrievalOwner: "aporetic-lean-pack",
  recordedDate: "2026-10-20",
}

/** Pure accessor for tests and board evidence. */
export function mnemosyneMap(): MnemosyneMap {
  return MNEMOSYNE_MAP
}
