// Read-only order/payment status for guest orders.
//
// The browser cannot read orders/payments directly: RLS only admits rows whose
// customer matches auth.uid(), and guest checkout has no session (0 rows). The
// checkout function returns a `status_token` (HMAC over the order id); the
// order-status Edge Function verifies it with the service role and echoes the
// authoritative state. Read-only by construction — no writes, no transitions.

import { invokeFunction } from '../lib/functions.js'

export interface OrderStatusPayment {
  status: string
  amount: number
  mpesa_receipt_number: string | null
  result_description: string | null
}

export interface OrderStatusResult {
  order_number: string
  /** order_statuses slug, e.g. awaiting_payment / payment_processing / paid. */
  status: string
  total: number
  paid_at: string | null
  payment: OrderStatusPayment | null
}

/**
 * Fetches the current status of an order. Throws when the token is rejected
 * (403) or the order is unknown (404) — the message comes from the server.
 */
export async function getOrderStatus(
  orderId: string,
  statusToken: string
): Promise<OrderStatusResult> {
  const data = await invokeFunction<OrderStatusResult>('order-status', {
    order_id: orderId,
    status_token: statusToken,
  })

  if (typeof data.order_number !== 'string' || typeof data.status !== 'string') {
    throw new Error('Order status returned an unexpected response')
  }
  return data
}
