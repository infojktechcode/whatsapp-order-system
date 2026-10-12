// Pure request parser for the checkout Edge Function.
//
// Security contract (AGENTS.md): the browser sends NO prices. It may not send
// delivery_fee, discount, subtotal, total or unit_price — every one of those is
// recomputed by create_order() in Postgres. Unknown fields are rejected outright
// so a future client cannot smuggle amounts in through a side door.

import {
  ValidationError,
  assertKnownFields,
  requireUuid,
  optionalUuid,
  normalizePhone,
  requireIntInRange,
  optionalText,
  enumValue,
} from "../_shared/validate.ts"

const MAX_ITEMS = 50
const MAX_QUANTITY = 500

const ALLOWED_TOP_LEVEL = new Set([
  "items",
  "customer",
  "customer_type",
  "delivery",
  "channel",
  "customer_notes",
])

const ALLOWED_ITEM_FIELDS = new Set(["variant_id", "quantity"])

const ALLOWED_CUSTOMER_FIELDS = new Set(["phone", "name", "email"])

const ALLOWED_DELIVERY_FIELDS = new Set([
  "type",
  "county_id",
  "method_id",
  "pickup_point_id",
  "address",
])

export interface ParsedCheckout {
  items: Array<{ variant_id: string; quantity: number }>
  customer: { phone: string; name: string | null; email: string | null }
  customer_type: "retail" | "wholesale"
  delivery: {
    type: "pickup" | "courier" | "bus"
    county_id: string | null
    method_id: string | null
    pickup_point_id: string | null
    address: Record<string, unknown> | null
  }
  channel: "web" | "whatsapp" | "phone" | "agent"
  customer_notes: string | null
}

function asObject(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ValidationError(field, `${field} must be a JSON object`)
  }
  return value as Record<string, unknown>
}

function parseAddress(value: unknown): Record<string, unknown> | null {
  if (value === undefined || value === null || value === "") return null
  if (typeof value === "string") {
    const text = value.trim()
    if (text === "") return null
    if (text.length > 500) {
      throw new ValidationError("delivery.address", "delivery.address is too long (max 500 characters)")
    }
    return { text }
  }
  const obj = asObject(value, "delivery.address")
  const serialized = JSON.stringify(obj)
  if (serialized.length > 2000) {
    throw new ValidationError("delivery.address", "delivery.address is too large (max 2000 characters)")
  }
  return obj
}

export function parseCheckout(body: unknown): ParsedCheckout {
  const root = asObject(body, "body")
  assertKnownFields(root, ALLOWED_TOP_LEVEL, "")

  // ---- items -------------------------------------------------------------
  if (!Array.isArray(root.items) || root.items.length === 0) {
    throw new ValidationError("items", "items must be a non-empty array")
  }
  if (root.items.length > MAX_ITEMS) {
    throw new ValidationError("items", `items must contain at most ${MAX_ITEMS} lines`)
  }
  const items = root.items.map((raw, i) => {
    const item = asObject(raw, `items[${i}]`)
    assertKnownFields(item, ALLOWED_ITEM_FIELDS, `items[${i}]`)
    return {
      variant_id: requireUuid(item.variant_id, `items[${i}].variant_id`),
      quantity: requireIntInRange(item.quantity, `items[${i}].quantity`, 1, MAX_QUANTITY),
    }
  })

  // ---- customer ----------------------------------------------------------
  const customer = asObject(root.customer, "customer")
  assertKnownFields(customer, ALLOWED_CUSTOMER_FIELDS, "customer")
  const phone = normalizePhone(customer.phone, "customer.phone")
  const name = optionalText(customer.name, "customer.name", 120)
  const email = optionalText(customer.email, "customer.email", 200)
  if (email !== null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ValidationError("customer.email", "customer.email is not a valid email address")
  }

  // ---- delivery ----------------------------------------------------------
  const delivery = root.delivery === undefined || root.delivery === null
    ? {}
    : asObject(root.delivery, "delivery")
  assertKnownFields(delivery, ALLOWED_DELIVERY_FIELDS, "delivery")

  return {
    items,
    customer: { phone, name, email },
    customer_type: enumValue(root.customer_type, "customer_type", ["retail", "wholesale"] as const, "retail"),
    delivery: {
      type: enumValue(delivery.type, "delivery.type", ["pickup", "courier", "bus"] as const, "pickup"),
      county_id: optionalUuid(delivery.county_id, "delivery.county_id"),
      method_id: optionalUuid(delivery.method_id, "delivery.method_id"),
      pickup_point_id: optionalUuid(delivery.pickup_point_id, "delivery.pickup_point_id"),
      address: parseAddress(delivery.address),
    },
    channel: enumValue(
      root.channel,
      "channel",
      ["web", "whatsapp", "phone", "agent"] as const,
      "web"
    ),
    customer_notes: optionalText(root.customer_notes, "customer_notes", 500),
  }
}
