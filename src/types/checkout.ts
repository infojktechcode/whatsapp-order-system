export interface CheckoutInput {
  items: { variant_id: string; quantity: number }[]
  customer_id: string
  customer_type: 'retail' | 'wholesale'
  delivery_type: 'pickup' | 'courier' | 'bus'
  delivery_county_id?: string
  delivery_method_id?: string
  pickup_point_id?: string
  delivery_address?: Record<string, unknown>
  delivery_fee: number
  discount: number
  customer_notes?: string
}

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
