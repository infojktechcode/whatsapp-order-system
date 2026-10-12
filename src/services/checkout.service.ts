import { calculateOrderTotal } from "./pricing.service.js"
import type { CheckoutInput, CheckoutResult } from "../types/checkout.js"
import { supabase } from "../lib/supabase.js"

export async function checkout(input: CheckoutInput): Promise<CheckoutResult> {
  const calc = await calculateOrderTotal(
    input.items,
    input.delivery_fee,
    input.discount,
    input.customer_type
  )

  const { data: order, error: oErr } = await supabase
    .from("orders")
    .insert({
      customer_id: input.customer_id,
      status_id: "awaiting_payment",
      channel: "web",
      delivery_type: input.delivery_type,
      delivery_county_id: input.delivery_county_id ?? null,
      delivery_method_id: input.delivery_method_id ?? null,
      pickup_point_id: input.pickup_point_id ?? null,
      delivery_address: input.delivery_address ?? null,
      delivery_fee: calc.delivery_fee,
      subtotal: calc.subtotal,
      discount: calc.discount,
      total: calc.total,
      customer_notes: input.customer_notes ?? null,
    })
    .select()
    .single()

  if (oErr || !order) throw new Error("Order creation failed")

  const items = calc.items.map((it) => ({
    order_id: order.id,
    variant_id: it.variant_id,
    quantity: it.quantity,
    unit_price: it.unit_price,
    pricing_tier: it.pricing_tier,
    line_total: it.line_total,
  }))

  const { error: iErr } = await supabase.from("order_items").insert(items)
  if (iErr) throw new Error("Order item insert failed")

  return {
    order_id: order.id,
    order_number: order.order_number,
    subtotal: calc.subtotal,
    discount: calc.discount,
    delivery_fee: calc.delivery_fee,
    total: calc.total,
    pricing: calc.items,
  }
}
