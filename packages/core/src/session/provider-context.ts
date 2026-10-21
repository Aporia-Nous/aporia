export * as SessionProviderContext from "./provider-context.js"

import { Message } from "@opencode/ai"
import { SessionProviderContext } from "@opencode/schema/session-provider-context"
import { Predicate, Schema } from "effect"
import { isDeepStrictEqual } from "node:util"
import { Hash } from "@opencode/util/hash"
import type { SessionMessage } from "./message.js"
import type { SessionRunnerModel } from "./runner/model.js"

export type Provenance = SessionProviderContext.Provenance
export const Info = SessionProviderContext.Info
export type Info = SessionProviderContext.Info

const messages = Schema.toCodecJson(Schema.Array(Message))

/** No guessed endpoints. Dynamic URL builders cannot establish a durable deployment identity here. */
export function provenance(resolved: Pick<SessionRunnerModel.Resolved, "model" | "ref">): Provenance | undefined {
  const model = resolved.model
  const endpoint = model.route.endpoint
  if (!endpoint.baseURL || typeof endpoint.path !== "string") return undefined
  return {
    providerID: resolved.ref.providerID,
    provider: model.provider,
    modelID: model.id,
    route: model.route.id,
    protocol: model.route.protocol,
    endpoint: Hash.sha256(
      JSON.stringify([
        endpoint.baseURL,
        endpoint.path,
        Object.entries(endpoint.query ?? {}).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)),
      ]),
    ),
  }
}

export const compatible = (source: Provenance, target: Provenance | undefined) =>
  target !== undefined && isDeepStrictEqual(source, target)

/** A completed compaction that installed a native replacement window instead of a local summary. */
export const isCheckpoint = (
  message: SessionMessage.Info,
): message is SessionMessage.CompactionCompleted & { readonly providerContext: Info } =>
  message.type === "compaction" && message.status === "completed" && message.providerContext !== undefined

/**
 * JSON-shaped value without a stringify/parse round-trip (AP-ENGINE-E11).
 * Matches JSON.stringify semantics used by the prior encode path: omit undefined object
 * keys, map undefined array slots to null, invoke `toJSON` (Media.Asset → base64).
 */
export const jsonSanitize = (value: unknown): Schema.Json => {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value === "bigint") throw new TypeError("Do not know how to serialize a BigInt")
  if (value instanceof Date) return value.toISOString()
  if (typeof value !== "object") return null

  const withJson = value as { toJSON?: () => unknown }
  const arrayToJSON = (Array.prototype as { toJSON?: () => unknown }).toJSON
  if (
    typeof withJson.toJSON === "function" &&
    !(Array.isArray(value) && arrayToJSON !== undefined && withJson.toJSON === arrayToJSON)
  ) {
    return jsonSanitize(withJson.toJSON())
  }
  if (Array.isArray(value)) {
    return value.map((item) => (item === undefined ? null : jsonSanitize(item)))
  }

  const out: { [key: string]: Schema.Json } = {}
  for (const key of Object.keys(value as object)) {
    const item = (value as Record<string, unknown>)[key]
    if (item === undefined || typeof item === "function" || typeof item === "symbol") continue
    out[key] = jsonSanitize(item)
  }
  return out
}

/** Stores the canonical replacement, not a local summary or transport continuation.
 * Provider and attachment metadata can contain optional undefined entries, which the Schema JSON
 * codec rejects, so use JSON's omission semantics; `Media.Asset.toJSON` keeps binary media as base64.
 * AP-ENGINE-E11: walk+sanitize instead of JSON.stringify → Schema.fromJsonString decode.
 */
export const encode = (provenance: Provenance, replacement: ReadonlyArray<Message>): Info => ({
  version: 1,
  provenance,
  messages: Schema.decodeUnknownSync(Schema.Json)(jsonSanitize(replacement)),
})

export const decode = (context: Info) => Schema.decodeUnknownSync(messages)(upgradeLegacyMedia(context.messages))
export const validate = (context: Info) => Schema.decodeUnknownEffect(messages)(upgradeLegacyMedia(context.messages))

/**
 * Before 2.0.15, version-1 checkpoints stored mediaType/data directly on media parts. Core only built
 * those parts from prompt attachments, whose data the Prompt schema guarantees is base64.
 */
function upgradeLegacyMedia(input: Info["messages"]) {
  if (!Array.isArray(input)) return input
  return input.map((message: unknown) => {
    if (!Predicate.isObject(message) || !Array.isArray(message.content)) return message
    return {
      ...message,
      content: message.content.map((part: unknown) => {
        if (
          !Predicate.isObject(part) ||
          part.type !== "media" ||
          part.media !== undefined ||
          typeof part.mediaType !== "string" ||
          typeof part.data !== "string"
        )
          return part
        const { mediaType, data, ...rest } = part
        return { ...rest, media: { source: { type: "base64", data, mediaType } } }
      }),
    }
  })
}
