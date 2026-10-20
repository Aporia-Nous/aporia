/**
 * FLOW-GENIUS-02/04 / Stage 6 — Mnemosyne memory audit map.
 *
 * FG-02: classify implemented / disconnected / mocked (was disconnected).
 * FG-04: product wire lands — Aporetic MnemosynePort → lean-pack CitedRetrieval.
 * Does not start or stop shared services. Does not read host production mnemosyne.db.
 * Not Stage 6 complete / I tests 1–7 / J acceptance.
 */
export * as MissionMemory from "./memory.js"

/** How Mnemosyne relates to Aporetic's SessionRunner lean pack. */
export type MnemosyneStatus = "implemented" | "disconnected" | "mocked"

export type MnemosyneMap = {
  readonly status: MnemosyneStatus
  /** External tree observed read-only (may be absent on other machines). */
  readonly sourcePath: string
  readonly notes: ReadonlyArray<string>
  /** Lean pack owns retrieval slots; filled via MnemosynePort on FG-04. */
  readonly leanPackRetrievalOwner: "aporetic-lean-pack"
  /** Product boundary module for recall/remember/forget. */
  readonly productPort: "packages/core/src/mission/mnemosyne-port.ts"
  readonly recordedDate: "2026-10-20"
}

/** Canonical external path from APORETIC-DEV-BUILD-LIST Stage 6. */
export const MNEMOSYNE_SOURCE_PATH = "C:\\Perseus\\mnemosyne"

/**
 * Classification for Stage 6 / FLOW-GENIUS-04.
 *
 * - Source tree exists as a sovereign opencode plugin (memory_* tools + idle capture).
 * - Aporetic owns MnemosynePort and wires recall into mission-fold lean packs → implemented.
 * - Default SessionRunner port is unavailable (no host DB auto-open); fixtures inject mocked port.
 * - Not a claim of I tests 1–7 PASS or Stage 6 complete.
 */
export const MNEMOSYNE_MAP: MnemosyneMap = {
  status: "implemented",
  sourcePath: MNEMOSYNE_SOURCE_PATH,
  notes: [
    "Source tree present at C:\\Perseus\\mnemosyne (opencode plugin + bun:sqlite + wave substrate).",
    "FLOW-GENIUS-04 wires Aporetic MnemosynePort → CitedRetrieval on mission-linked lean packs.",
    "Default port is unavailable (host ~/.config/opencode/mnemosyne/mnemosyne.db not auto-opened; no install).",
    "Fixture/mocked port proves retrieval + scope filter + forget + unavailable omit in unit tests.",
    "I tests 1–7 / J fixtures acceptance / Stage 6 complete remain OPEN residuals.",
  ],
  leanPackRetrievalOwner: "aporetic-lean-pack",
  productPort: "packages/core/src/mission/mnemosyne-port.ts",
  recordedDate: "2026-10-20",
}

/** Pure accessor for tests and board evidence. */
export function mnemosyneMap(): MnemosyneMap {
  return MNEMOSYNE_MAP
}
