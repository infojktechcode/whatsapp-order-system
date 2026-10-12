// M-Pesa STK push goes through the `mpesa-stk` Edge Function.
//
// The amount is NEVER sent: the function reads orders.total (written only by
// create_order()) and echoes it back for display. The browser performs no
// payment writes at all — payment rows and payment_transactions audit entries
// are created server-side, and only a validated Daraja callback may mark an
// order PAID (AGENTS.md §3).

import { supabase } from '../lib/supabase.js'
import { invokeFunction } from '../lib/functions.js'
import type { Payment } from '../types/index.js'

export interface StkResult {
  status: 'requested' | 'already_requested' | 'error'
  payment_id?: string | undefined
  checkout_request_id?: string | undefined
  merchant_request_id?: string | undefined
  /** Order total computed by the server — display only. */
  amount?: number | undefined
  order_number?: string | undefined
  message?: string | undefined
}

interface ServerStkResult {
  status?: string
  payment_id?: string
  checkout_request_id?: string
  merchant_request_id?: string
  amount?: number
  order_number?: string
}

/**
 * Requests an M-Pesa STK push for `orderId`. Throws on server-side refusal
 * (unknown order, order not payable, M-Pesa not configured) — the message is
 * the server's user-safe `{ error }` text.
 */
export async function initiateStkPush(orderId: string, phone: string): Promise<StkResult> {
  const data = await invokeFunction<ServerStkResult>('mpesa-stk', {
    order_id: orderId,
    phone,
  })

  if (data.status === 'requested' || data.status === 'already_requested') {
    return {
      status: data.status,
      payment_id: data.payment_id,
      checkout_request_id: data.checkout_request_id,
      merchant_request_id: data.merchant_request_id,
      amount: data.amount,
      order_number: data.order_number,
    }
  }

  return { status: 'error', message: 'Unexpected response from the payment service' }
}

/** Read-only status lookup for the caller's own order (no writes, no transitions). */
export async function verifyPayment(orderId: string): Promise<Payment | null> {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('order_id', orderId)
    .maybeSingle()
  if (error) return null
  return (data as Payment | null) ?? null
}
