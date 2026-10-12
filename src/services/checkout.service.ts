// Checkout goes through the `checkout` Edge Function. Nothing in this file
// (or anywhere in the browser) computes or sends prices — create_order() in
// Postgres resolves unit prices, wholesale tiers, discounts, delivery fees and
// the total inside one transaction (AGENTS.md §3).

import type { CheckoutInput, CheckoutResult } from '../types/checkout.js'
import { invokeFunction } from '../lib/functions.js'

interface ServerCheckoutResult {
  order_id: string
  order_number: string
  subtotal: number
  discount: number
  delivery_fee: number
  total: number
  items: CheckoutResult['pricing']
}

export async function checkout(input: CheckoutInput): Promise<CheckoutResult> {
  const data = await invokeFunction<ServerCheckoutResult>('checkout', input)

  if (typeof data.order_id !== 'string' || typeof data.total !== 'number') {
    throw new Error('Order creation returned an unexpected response')
  }

  return {
    order_id: data.order_id,
    order_number: data.order_number,
    subtotal: data.subtotal,
    discount: data.discount,
    delivery_fee: data.delivery_fee,
    total: data.total,
    pricing: data.items ?? [],
  }
}
