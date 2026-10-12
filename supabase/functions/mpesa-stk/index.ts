// M-Pesa STK Push Edge Function.
//
//   POST /functions/v1/mpesa-stk   { order_id, phone }
//
// The amount is NEVER taken from the client: it is read from orders.total,
// which only create_order() wrote. A successful STK request moves the order to
// PAYMENT_PROCESSING and the payment to `processing` — it never marks anything
// PAID (AGENTS.md §3).

import { preflight, json, methodNotAllowed, clientIp } from "../_shared/cors.ts"
import { admin, safeDbMessage } from "../_shared/db.ts"
import {
  ValidationError,
  assertKnownFields,
  requireUuid,
  normalizePhone,
} from "../_shared/validate.ts"
import { darajaConfig, stkPush, MpesaNotConfiguredError } from "../_shared/mpesa.ts"

const PAYABLE_STATUSES = new Set(["awaiting_payment", "payment_failed"])

/** order_id + phone only — never an amount (orders.total is authoritative). */
const ALLOWED_STK_FIELDS = new Set(["order_id", "phone"])

interface OrderRow {
  id: string
  order_number: string
  total: number
  status_id: string
}

interface PaymentRow {
  id: string
  status: string
  checkout_request_id: string | null
  merchant_request_id: string | null
  amount: number
}

/** "DB-20261012-8F8F93" -> "DB10128F8F93" (Daraja account ref max 12 chars). */
function accountReference(orderNumber: string): string {
  const compact = orderNumber.replace(/[^A-Za-z0-9]/g, "")
  return ("DB" + compact.slice(-10)).slice(0, 12)
}

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
  let phone: string
  try {
    assertKnownFields(body, ALLOWED_STK_FIELDS)
    orderId = requireUuid(body.order_id, "order_id")
    phone = normalizePhone(body.phone, "phone")
  } catch (e) {
    if (e instanceof ValidationError) return json({ error: e.message, field: e.field }, 400)
    throw e
  }

  try {
    const db = admin()

    const { data: order, error: orderError } = await db
      .from("orders")
      .select("id, order_number, total, status_id")
      .eq("id", orderId)
      .maybeSingle()

    if (orderError) {
      console.error("mpesa-stk order lookup failed:", orderError.message)
      return json({ error: "Could not load the order" }, 500)
    }
    if (!order) return json({ error: "Order not found" }, 404)

    const { data: statusRow } = await db
      .from("order_statuses")
      .select("slug")
      .eq("id", (order as OrderRow).status_id)
      .maybeSingle()

    const slug = statusRow?.slug as string | undefined
    if (!slug || !PAYABLE_STATUSES.has(slug)) {
      return json({ error: `Order is not awaiting payment (status: ${slug ?? "unknown"})` }, 409)
    }
    if ((order as OrderRow).total < 1) {
      return json({ error: "Order total must be at least KES 1 to request payment" }, 400)
    }

    const { data: existing } = await db
      .from("payments")
      .select("id, status, checkout_request_id, merchant_request_id, amount")
      .eq("order_id", orderId)
      .maybeSingle()

    const payment = existing as PaymentRow | null
    if (payment) {
      if (payment.status === "completed") {
        return json({ error: "Order is already paid" }, 409)
      }
      // An attempt already in flight with Safaricom — do not duplicate it.
      if (
        (payment.status === "requested" || payment.status === "processing") &&
        payment.checkout_request_id
      ) {
        return json(
          {
            status: "already_requested",
            payment_id: payment.id,
            checkout_request_id: payment.checkout_request_id,
            merchant_request_id: payment.merchant_request_id,
            amount: payment.amount,
            order_number: (order as OrderRow).order_number,
          },
          200
        )
      }
    }

    // One payment row per order (UNIQUE order_id); reset the attempt fields.
    const paymentPayload = {
      order_id: orderId,
      status: "requested",
      amount: (order as OrderRow).total,
      currency: "KES",
      method: "mpesa",
      phone_number: phone,
      checkout_request_id: null,
      merchant_request_id: null,
      result_code: null,
      result_description: null,
      requested_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    let paymentId: string
    if (payment) {
      const { data: updated, error: updateError } = await db
        .from("payments")
        .update(paymentPayload)
        .eq("id", payment.id)
        .select("id")
        .single()
      if (updateError || !updated) {
        console.error("mpesa-stk payment update failed:", updateError?.message)
        return json({ error: "Could not record the payment attempt" }, 500)
      }
      paymentId = updated.id as string
    } else {
      const { data: created, error: insertError } = await db
        .from("payments")
        .insert(paymentPayload)
        .select("id")
        .single()
      if (insertError || !created) {
        console.error("mpesa-stk payment insert failed:", insertError?.message)
        return json({ error: "Could not record the payment attempt" }, 500)
      }
      paymentId = created.id as string
    }

    // ---- Daraja -----------------------------------------------------------
    try {
      darajaConfig() // fails fast (and loudly) when secrets are missing
    } catch (e) {
      if (e instanceof MpesaNotConfiguredError) return json({ error: e.message }, 503)
      throw e
    }

    const stk = await stkPush({
      phone,
      amount: (order as OrderRow).total,
      accountReference: accountReference((order as OrderRow).order_number),
      transactionDesc: "Order payment",
    })

    const now = new Date().toISOString()
    const ip = clientIp(req)

    if (!stk.ok || !stk.checkoutRequestId) {
      await db
        .from("payments")
        .update({
          status: "failed",
          result_code: "request_failed",
          result_description: stk.error ?? "Daraja request failed",
          updated_at: now,
        })
        .eq("id", paymentId)

      await db.from("payment_transactions").insert({
        payment_id: paymentId,
        order_id: orderId,
        transaction_type: "stk_push",
        amount: (order as OrderRow).total,
        phone_number: phone,
        result_code: "request_failed",
        result_description: stk.error ?? "Daraja request failed",
        raw_payload: { response: stk.raw },
        signature_valid: true,
        processed: false,
        ip_address: ip,
      })

      // The order keeps its current status so the customer can retry immediately.
      return json({ error: "M-Pesa request failed", detail: stk.error ?? "no response" }, 502)
    }

    await db
      .from("payments")
      .update({
        status: "processing",
        merchant_request_id: stk.merchantRequestId ?? null,
        checkout_request_id: stk.checkoutRequestId,
        updated_at: now,
      })
      .eq("id", paymentId)

    await db.from("payment_transactions").insert({
      payment_id: paymentId,
      order_id: orderId,
      transaction_type: "stk_push",
      checkout_request_id: stk.checkoutRequestId,
      merchant_request_id: stk.merchantRequestId ?? null,
      amount: (order as OrderRow).total,
      phone_number: phone,
      result_code: String(stk.raw.ResponseCode ?? "0"),
      result_description: stk.customerMessage ?? "STK push sent",
      raw_payload: { response: stk.raw },
      signature_valid: true,
      processed: false,
      ip_address: ip,
    })

    // Walk the order to PAYMENT_PROCESSING through the guarded transition fn.
    if (slug === "payment_failed") {
      await db.rpc("transition_order_status", {
        p_order_id: orderId,
        p_to_status_slug: "awaiting_payment",
        p_changed_by: null,
        p_reason: "Customer retried payment",
      })
    }
    const { error: transitionError } = await db.rpc("transition_order_status", {
      p_order_id: orderId,
      p_to_status_slug: "payment_processing",
      p_changed_by: null,
      p_reason: "STK push sent",
    })
    if (transitionError) {
      console.error("mpesa-stk transition failed:", transitionError.message)
      // The STK push itself succeeded; the callback will still settle the order.
    }

    return json({
      status: "requested",
      payment_id: paymentId,
      checkout_request_id: stk.checkoutRequestId,
      merchant_request_id: stk.merchantRequestId ?? null,
      amount: (order as OrderRow).total, // server-computed — display only
      order_number: (order as OrderRow).order_number,
      customer_message: stk.customerMessage ?? "STK push sent",
    })
  } catch (e) {
    console.error("mpesa-stk unexpected error:", e instanceof Error ? e.message : e)
    const safe = safeDbMessage(e instanceof Error ? e.message : null)
    return json({ error: safe ?? "Payment request failed" }, 500)
  }
})
