// Request parsing for the admin Edge Function — pure TypeScript, no Deno APIs,
// so the Vitest suite exercises the same validation the deployed function runs.
//
// Every action is an explicit allowlist: unknown fields are rejected rather
// than ignored, and no action may carry amounts (totals belong to
// create_order(), statuses to transition_order_status()).

import {
  ValidationError,
  assertKnownFields,
  enumValue,
  optionalText,
  requireIntInRange,
  requireUuid,
} from "../_shared/validate.ts"

export const ADMIN_ACTIONS = [
  "list_orders",
  "get_order",
  "transition",
  "stats",
  "me",
] as const

export type AdminAction = (typeof ADMIN_ACTIONS)[number]

export type AdminRequest =
  | { action: "list_orders"; status: string | null; limit: number }
  | { action: "get_order"; order_id: string }
  | { action: "transition"; order_id: string; to_status: string; reason: string | null }
  | { action: "stats" }
  | { action: "me" }

/**
 * Statuses an admin may drive an order to. Deliberately excludes `paid`:
 * only a validated Daraja callback may mark an order paid (AGENTS.md §3).
 * `payment_processing` is likewise set by the STK flow, not by hand.
 */
export const ADMIN_SETTABLE_STATUSES = [
  "awaiting_payment",
  "confirmed",
  "processing",
  "ready_for_dispatch",
  "dispatched",
  "delivered",
  "payment_failed",
  "cancelled",
  "refunded",
] as const

const ALLOWED: Record<AdminAction, ReadonlySet<string>> = {
  list_orders: new Set(["action", "status", "limit"]),
  get_order: new Set(["action", "order_id"]),
  transition: new Set(["action", "order_id", "to_status", "reason"]),
  stats: new Set(["action"]),
  me: new Set(["action"]),
}

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200
const MAX_REASON = 500

const KNOWN_STATUSES: ReadonlySet<string> = new Set([
  "draft",
  "pending_checkout",
  "awaiting_payment",
  "payment_processing",
  "paid",
  "confirmed",
  "processing",
  "ready_for_dispatch",
  "dispatched",
  "delivered",
  "payment_failed",
  "cancelled",
  "refunded",
])

export function parseAdminRequest(raw: unknown): AdminRequest {
  // Fail closed: a body that is not a JSON object (or one without an explicit
  // action) is a client bug, not a request to guess at.
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new ValidationError("body", "Request body must be a JSON object")
  }
  const body = raw as Record<string, unknown>
  if (typeof body.action !== "string" || body.action === "") {
    throw new ValidationError("action", `action must be one of: ${ADMIN_ACTIONS.join(", ")}`)
  }
  const action = enumValue<AdminAction>(body.action, "action", ADMIN_ACTIONS, "" as AdminAction)

  assertKnownFields(body, ALLOWED[action])

  switch (action) {
    case "list_orders": {
      const status = optionalText(body.status, "status", 40)
      if (status !== null && !KNOWN_STATUSES.has(status)) {
        throw new ValidationError("status", `status must be a known order status`)
      }
      const limit =
        body.limit === undefined || body.limit === null
          ? DEFAULT_LIMIT
          : requireIntInRange(body.limit, "limit", 1, MAX_LIMIT)
      return { action, status, limit }
    }

    case "get_order":
      return { action, order_id: requireUuid(body.order_id, "order_id") }

    case "transition": {
      const toStatus = enumValue<string>(body.to_status, "to_status", ADMIN_SETTABLE_STATUSES, "")
      if (!toStatus) {
        throw new ValidationError(
          "to_status",
          `to_status must be one of: ${ADMIN_SETTABLE_STATUSES.join(", ")}`
        )
      }
      return {
        action,
        order_id: requireUuid(body.order_id, "order_id"),
        to_status: toStatus,
        reason: optionalText(body.reason, "reason", MAX_REASON),
      }
    }

    case "stats":
      return { action }

    case "me":
      return { action }
  }
}