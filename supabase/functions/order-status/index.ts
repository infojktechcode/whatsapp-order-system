// Order status Edge Function — read-only confirmation polling for guest orders.
//
//   POST /functions/v1/order-status   { order_id, status_token }
//
// Why this exists: guest checkout has no auth session, and RLS lets only
// `auth.uid()` owners read orders/payments (anon gets 0 rows). The checkout
// function mints `status_token` = HMAC(order_id); this function verifies it and
// then reads the authoritative status with the service role. It can never change
// anything (AGENTS.md: status transitions are backend-controlled).

import { preflight, json, methodNotAllowed } from "../_shared/cors.ts"
import { admin, safeDbMessage } from "../_shared/db.ts"
import { ValidationError, assertKnownFields, requireUuid } from "../_shared/validate.ts"
import { verifyStatusToken } from "../_shared/statusToken.ts"

const ALLOWED_STATUS_FIELDS = new Set(["order_id", "status_token"])

Deno.serve(async (req) => {
  const preflightResponse = preflight(req)
  if (preflightResponse) return preflightResponse
  if (req.method !== "POST") return methodNotAllowed(["POST"])

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return json({ error: "Body must be valid JSON" }, 400)
  }

  const body = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>

  let orderId: string
  try {
    assertKnownFields(body, ALLOWED_STATUS_FIELDS)
    orderId = requireUuid(body.order_id, "order_id")
    // Structural: absent/mistyped token is a bad request; a present-but-wrong
    // token is rejected with 403 below.
    if (typeof body.status_token !== "string") {
      throw new ValidationError("status_token", "status_token is required")
    }
  } catch (e) {
    if (e instanceof ValidationError) return json({ error: e.message, field: e.field }, 400)
    throw e
  }

  const secret = Deno.env.get("ORDER_STATUS_SECRET")
  if (!secret) return json({ error: "Order status service is not configured" }, 503)

  // Capability check before any database access.
  if (!(await verifyStatusToken(orderId, body.status_token, secret))) {
    return json({ error: "Invalid status token" }, 403)
  }

  try {
    const db = admin()

    const { data: order, error: orderError } = await db
      .from("orders")
      .select("id, order_number, status_id, total, paid_at")
      .eq("id", orderId)
      .maybeSingle()

    if (orderError) {
      console.error("order-status lookup failed:", orderError.message)
      return json({ error: "Could not load the order" }, 500)
    }
    if (!order) return json({ error: "Order not found" }, 404)

    const { data: statusRow } = await db
      .from("order_statuses")
      .select("slug")
      .eq("id", (order as { status_id: string }).status_id)
      .maybeSingle()

    const { data: payment } = await db
      .from("payments")
      .select("status, amount, mpesa_receipt_number, result_description")
      .eq("order_id", orderId)
      .maybeSingle()

    return json({
      order_number: (order as { order_number: string }).order_number,
      status: (statusRow as { slug: string } | null)?.slug ?? "unknown",
      total: (order as { total: number }).total,
      paid_at: (order as { paid_at: string | null }).paid_at,
      payment: payment ?? null,
    })
  } catch (e) {
    console.error("order-status unexpected error:", e instanceof Error ? e.message : e)
    const safe = safeDbMessage(e instanceof Error ? e.message : null)
    return json({ error: safe ?? "Could not load the order" }, 500)
  }
})
