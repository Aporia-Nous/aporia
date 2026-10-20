export * as ConfigCompaction from "./compaction.js"

import { Schema } from "effect"
import { NonNegativeInt, optional } from "../schema.js"

export class Keep extends Schema.Class<Keep>("Config.Compaction.Keep")({
  tokens: NonNegativeInt.pipe(optional),
}) {}

export class Info extends Schema.Class<Info>("Config.Compaction")({
  auto: Schema.Boolean.pipe(optional),
  keep: Keep.pipe(optional),
  buffer: NonNegativeInt.pipe(optional),
  /**
   * The largest context automatic compaction allows, whatever window the model advertises. Every step re-sends the
   * whole context, so a million-token window is a bill as much as a limit. Defaults to 100000.
   */
  max_context: NonNegativeInt.pipe(optional),
}) {}
