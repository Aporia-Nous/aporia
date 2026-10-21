/**
 * FLOW-GENIUS-02/04 / AP-STAGE6-HOST-DB / Stage 6 — Mnemosyne memory audit map.
 *
 * FG-02: classify implemented / disconnected / mocked (was disconnected).
 * FG-04: product wire lands — Aporetic MnemosynePort → lean-pack CitedRetrieval.
 * HOST-DB: product default is built-in DEV-local shared memory (available).
 * Does not start or stop shared services. Does not read host production mnemosyne.db.
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
 * Classification for Stage 6 / FLOW-GENIUS-04 / AP-STAGE6-HOST-DB.
 *
 * - Source tree exists as a sovereign opencode plugin (memory_* tools + idle capture).
 * - Aporetic owns MnemosynePort and wires recall into mission-fold lean packs → implemented.
 * - Default SessionRunner port is **available** via DEV-local built-in store (not host opencode DB).
 * - Host `~/.config/opencode/mnemosyne/mnemosyne.db` remains refused / not auto-opened.
 */
export const MNEMOSYNE_MAP: MnemosyneMap = {
  status: "implemented",
  sourcePath: MNEMOSYNE_SOURCE_PATH,
  notes: [
    "Source tree present at C:\\Perseus\\mnemosyne (opencode plugin + bun:sqlite + wave substrate).",
    "FLOW-GENIUS-04 wires Aporetic MnemosynePort → CitedRetrieval on mission-linked lean packs.",
    "AP-STAGE6-HOST-DB: product default is built-in DEV-local shared memory (available) under Aporetic paths / APORETIC_MNEMOSYNE_PATH.",
    "Host ~/.config/opencode/mnemosyne/mnemosyne.db is refused — not opened, not installed from.",
    "Fixture/mocked port + unavailable adapter remain for I gates; I-6 unavailable is explicit inject.",
    "UI inspect/search/edit chrome for memory remains a residual (not this map).",
  ],
  leanPackRetrievalOwner: "aporetic-lean-pack",
  productPort: "packages/core/src/mission/mnemosyne-port.ts",
  recordedDate: "2026-10-20",
}

/** Pure accessor for tests and board evidence. */
export function mnemosyneMap(): MnemosyneMap {
  return MNEMOSYNE_MAP
}
