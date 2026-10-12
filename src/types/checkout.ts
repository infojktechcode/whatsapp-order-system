// The browser's checkout contract with the `checkout` Edge Function.
//
// Deliberately contains NO price, fee, discount or total fields (and no
// customer_id): every amount and the customer row are resolved server-side by
// create_order() in Postgres. The Edge Function rejects any of these fields
// with a 400 — see supabase/functions/checkout/parse.ts.

export interface CheckoutCustomer {
  /** M-Pesa / contact number, e.g. 254712345678. */
  phone: string
  name?: string | null
  email?: string | null
}

export interface CheckoutDelivery {
  type: 'pickup' | 'courier' | 'bus'
  county_id?: string | null
  method_id?: string | null
  pickup_point_id?: string | null
  address?: string | Record<string, unknown> | null
}

export interface CheckoutInput {
  items: { variant_id: string; quantity: number }[]
  customer: CheckoutCustomer
  customer_type?: 'retail' | 'wholesale'
  delivery: CheckoutDelivery
  channel?: 'web' | 'whatsapp' | 'phone' | 'agent'
  customer_notes?: string | null
}

/** All numbers below are computed by the server — display only. */
export interface CheckoutResult {
  order_id: string
  order_number: string
  subtotal: number
  discount: number
  delivery_fee: number
  total: number
  pricing: Array<{
    variant_id: string
    quantity: number
    unit_price: number
    pricing_tier: string
    line_total: number
  }>
}
