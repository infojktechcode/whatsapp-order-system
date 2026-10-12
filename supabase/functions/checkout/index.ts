// Checkout Edge Function — the only way a web/WhatsApp/phone order is created.
//
//   POST /functions/v1/checkout
//   { items, customer, customer_type, delivery, channel, customer_notes }
//
// Prices, delivery fees, discounts and totals are computed inside
// create_order() (Postgres, one transaction). The browser's payload is
// validated by parseCheckout(), which rejects any price-like field.

import { preflight, json, methodNotAllowed } from "../_shared/cors.ts"
import { admin, safeDbMessage } from "../_shared/db.ts"
import { ValidationError } from "../_shared/validate.ts"
import { parseCheckout } from "./parse.ts"

const MAX_BODY_BYTES = 32_768

Deno.serve(async (req) => {
  const preflightResponse = preflight(req)
  if (preflightResponse) return preflightResponse
  if (req.method !== "POST") return methodNotAllowed(["POST"])

  const contentLength = Number(req.headers.get("content-length") ?? "0")
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return json({ error: "Request body too large" }, 413)
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return json({ error: "Body must be valid JSON" }, 400)
  }

  let input
  try {
    input = parseCheckout(raw)
  } catch (e) {
    if (e instanceof ValidationError) {
      return json({ error: e.message, field: e.field }, 400)
    }
    throw e
  }

  try {
    const { data, error } = await admin().rpc("create_order", {
      p_items: input.items,
      p_customer: {
        phone: input.customer.phone,
        name: input.customer.name,
        email: input.customer.email,
      },
      p_delivery: {
        type: input.delivery.type,
        county_id: input.delivery.county_id,
        method_id: input.delivery.method_id,
        pickup_point_id: input.delivery.pickup_point_id,
        address: input.delivery.address,
      },
      p_channel: input.channel,
      p_customer_type: input.customer_type,
      p_customer_notes: input.customer_notes,
    })

    if (error) {
      console.error("create_order failed:", error.message)
      const safe = safeDbMessage(error.message)
      return json({ error: safe ?? "Order could not be created" }, safe ? 400 : 500)
    }

    // data = { order_id, order_number, subtotal, discount, delivery_fee, total, items }
    return json(data, 201)
  } catch (e) {
    console.error("checkout unexpected error:", e instanceof Error ? e.message : e)
    return json({ error: "Order could not be created" }, 500)
  }
})
