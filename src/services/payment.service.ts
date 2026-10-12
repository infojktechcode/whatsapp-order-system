import { supabase } from "../lib/supabase.js"
import type { Payment } from "../types/index.js"

export interface StkResult {
  status: "requested" | "already_requested" | "error"
  payment_id?: string
  checkout_request_id?: string
  merchant_request_id?: string
}

export async function initiateStkPush(
  orderId: string,
  phone: string,
  amount: number
): Promise<StkResult> {
  const { data: order, error: oErr } = await supabase
    .from("orders")
    .select("id, total, status_id")
    .eq("id", orderId)
    .single()

  if (oErr || !order) return { status: "error" }
  if (order.status_id !== "awaiting_payment") {
    throw new Error("Order not in AWAITING_PAYMENT state")
  }

  const { data: existing } = await supabase
    .from("payments")
    .select("id, checkout_request_id, status")
    .eq("order_id", orderId)
    .in("status", ["requested", "processing"])
    .single()

  if (existing) {
    return { status: "already_requested", payment_id: existing.id, checkout_request_id: existing.checkout_request_id }
  }

  const { data: payment, error: pErr } = await supabase
    .from("payments")
    .insert({
      order_id: orderId,
      status: "requested" as Payment["status"],
      amount,
      phone_number: phone,
      requested_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (pErr || !payment) throw new Error("Failed to create payment record")

  return { status: "requested", payment_id: payment.id, checkout_request_id: payment.checkout_request_id ?? undefined, merchant_request_id: payment.merchant_request_id ?? undefined }
}

export async function verifyPayment(orderId: string): Promise<Payment | null> {
  const { data, error } = await supabase.from("payments").select("*").eq("order_id", orderId).single()
  if (error) return null
  return data as Payment
}
