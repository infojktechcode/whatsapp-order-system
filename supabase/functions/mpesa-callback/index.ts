// M-Pesa callback Edge Function (deployed with --no-verify-jwt: Safaricom calls it).
//
//   POST /functions/v1/mpesa-callback?token=<MPESA_CALLBACK_TOKEN>
//
// Validation layers, in order:
//   1. Shared secret in the callback URL — Daraja POSTs back to the exact URL we
//      generated, which the caller never sees. Rejects the entire open internet.
//   2. Structure — must carry stkCallback.CheckoutRequestID.
//   3. Optional independent confirmation against Daraja (MPESA_VERIFY_CALLBACK=1).
//   4. create_order() total match inside mpesa_handle_result() (amount check) +
//      attempt-level idempotency + the only path to PAID.
//
// Always answers 200 once the token matches, so Safaricom does not retry.

import { preflight, json, methodNotAllowed } from "../_shared/cors.ts"
import { admin } from "../_shared/db.ts"
import { timingSafeEqual } from "../_shared/validate.ts"
import { darajaConfig, stkQuery, MpesaNotConfiguredError } from "../_shared/mpesa.ts"

interface StkCallback {
  MerchantRequestID?: string
  CheckoutRequestID?: string
  ResultCode?: number | string
  ResultDesc?: string
  CallbackMetadata?: { Item?: Array<{ Name?: string; Value?: string | number }> }
}

function metadataValue(items: Array<{ Name?: string; Value?: string | number }> | undefined, name: string) {
  const item = (items ?? []).find((i) => i.Name === name)
  return item?.Value
}

Deno.serve(async (req) => {
  const preflightResponse = preflight(req)
  if (preflightResponse) return preflightResponse
  if (req.method !== "POST") return methodNotAllowed(["POST"])

  // ---- 1. shared secret --------------------------------------------------
  const expected = Deno.env.get("MPESA_CALLBACK_TOKEN") ?? ""
  if (!expected) {
    // Fail closed: without the secret no callback can be authenticated.
    console.error("mpesa-callback: MPESA_CALLBACK_TOKEN is not configured")
    return json({ error: "Payments are not configured" }, 503)
  }
  const provided = new URL(req.url).searchParams.get("token") ?? ""
  if (!provided || !timingSafeEqual(provided, expected)) {
    console.warn("mpesa-callback: rejected a request with an invalid token")
    return json({ error: "Invalid callback token" }, 401)
  }

  // ---- 2. structure ------------------------------------------------------
  let payload: Record<string, unknown>
  try {
    payload = await req.json()
  } catch {
    return json({ error: "Body must be valid JSON" }, 400)
  }

  const body = payload.Body as { stkCallback?: StkCallback } | undefined
  const cb = body?.stkCallback
  if (!cb || typeof cb.CheckoutRequestID !== "string" || cb.CheckoutRequestID === "") {
    return json({ error: "Missing stkCallback.CheckoutRequestID" }, 400)
  }

  const checkoutRequestId = cb.CheckoutRequestID
  const resultCode = Number(cb.ResultCode)
  const success = Number.isFinite(resultCode) && resultCode === 0
  const items = cb.CallbackMetadata?.Item
  const amountValue = metadataValue(items, "Amount")
  const phoneValue = metadataValue(items, "PhoneNumber")
  const receiptValue = metadataValue(items, "MpesaReceiptNumber")
  const amount = amountValue === undefined ? null : Number(amountValue)

  // ---- 3. optional independent confirmation -------------------------------
  let confirmedByDaraja = true
  if (success && Deno.env.get("MPESA_VERIFY_CALLBACK") === "1") {
    try {
      const query = await stkQuery(checkoutRequestId)
      confirmedByDaraja = query.ok && query.resultCode === 0
      if (!confirmedByDaraja) {
        console.warn("mpesa-callback: Daraja STK query did not confirm the success")
      }
    } catch (e) {
      confirmedByDaraja = false
      console.error(
        "mpesa-callback: STK query failed:",
        e instanceof MpesaNotConfiguredError ? "not configured" : "request error"
      )
    }
  }

  // ---- 4. atomic, idempotent settlement ----------------------------------
  try {
    const db = admin()
    const { data, error } = await db.rpc("mpesa_handle_result", {
      p_checkout_request_id: checkoutRequestId,
      p_success: success && confirmedByDaraja,
      p_result_code: Number.isFinite(resultCode) ? String(resultCode) : null,
      p_result_description: cb.ResultDesc ?? null,
      p_mpesa_receipt: receiptValue === undefined ? null : String(receiptValue),
      p_amount: amount !== null && Number.isFinite(amount) ? amount : null,
      p_phone: phoneValue === undefined ? null : String(phoneValue),
      p_raw_payload: payload,
    })

    if (error) {
      console.error("mpesa-callback: mpesa_handle_result failed:", error.message)
      return json({ received: false, error: "Processing failed" }, 500)
    }

    const outcome = (data ?? {}) as {
      found?: boolean
      status?: string
      idempotent?: boolean
      reason?: string
    }

    if (!outcome.found) {
      await db.from("audit_logs").insert({
        actor_type: "webhook",
        action: "mpesa_callback_unknown_checkout_id",
        resource: "payments",
        metadata: { checkout_request_id: checkoutRequestId, result_code: cb.ResultCode ?? null },
      })
      return json({ received: false, reason: "unknown checkout_request_id" }, 200)
    }

    return json({
      received: true,
      status: outcome.status ?? "unknown",
      idempotent: outcome.idempotent === true,
      ...(outcome.reason ? { reason: outcome.reason } : {}),
    })
  } catch (e) {
    console.error("mpesa-callback unexpected error:", e instanceof Error ? e.message : e)
    return json({ received: false, error: "Processing failed" }, 500)
  }
})
