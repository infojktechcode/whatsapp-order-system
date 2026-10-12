import { supabase } from "../lib/supabase.js"
import type { CustomerType } from "../types/index.js"

export interface CalculatedPrice {
  variant_id: string
  quantity: number
  unit_price: number
  pricing_tier: string
  line_total: number
}

export interface PriceCalculationResult {
  items: CalculatedPrice[]
  subtotal: number
  discount: number
  delivery_fee: number
  total: number
}

const RETAIL_CUSTOMER_TYPE = "retail"
const DEFAULT_WHOLESALE_THRESHOLD = 12
const MAX_CART_QUANTITY = 500

export async function getVariantPricing(
  variant_id: string,
  quantity: number,
  customerType: CustomerType = "retail"
): Promise<CalculatedPrice> {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new Error("Quantity must be a positive integer")
  }
  if (quantity > MAX_CART_QUANTITY) {
    throw new Error(`Quantity exceeds maximum of ${MAX_CART_QUANTITY}`)
  }

  const { data: variant, error: vErr } = await supabase
    .from("product_variants")
    .select("id, retail_price, wholesale_price, wholesale_threshold, stock_quantity, active")
    .eq("id", variant_id)
    .single()

  if (vErr || !variant) throw new Error("Variant not found")
  if (!variant.active) throw new Error("Variant is inactive")
  if (quantity > variant.stock_quantity) {
    throw new Error("Requested quantity exceeds available stock")
  }

  const wholesaleThreshold = variant.wholesale_threshold ?? DEFAULT_WHOLESALE_THRESHOLD

  // Fetch applicable pricing tiers from DB - never trust frontend price
  const { data: tier, error: tErr } = await supabase
    .from("pricing_tiers")
    .select("id, price, minimum_quantity, maximum_quantity")
    .eq("variant_id", variant_id)
    .eq("active", true)
    .order("minimum_quantity", { ascending: false })
    .limit(1)

  if (tErr) throw new Error("Pricing lookup failed")

  let unitPrice: number
  let tierName: string

  if (customerType === "wholesale" && quantity >= wholesaleThreshold && variant.wholesale_price > 0) {
    unitPrice = variant.wholesale_price
    tierName = "wholesale"
  } else if (tier && tier.length > 0 && quantity >= tier[0].minimum_quantity) {
    const matched = tier[0]
    if (matched.maximum_quantity === null || quantity <= matched.maximum_quantity) {
      unitPrice = matched.price
      tierName = `tier-${matched.id}`
    } else {
      unitPrice = variant.retail_price
      tierName = RETAIL_CUSTOMER_TYPE
    }
  } else {
    unitPrice = variant.retail_price
    tierName = RETAIL_CUSTOMER_TYPE
  }

  return {
    variant_id,
    quantity,
    unit_price: unitPrice,
    pricing_tier: tierName,
    line_total: unitPrice * quantity,
  }
}

export async function calculateOrderTotal(
  items: { variant_id: string; quantity: number }[],
  deliveryFee: number = 0,
  discount: number = 0,
  customerType: CustomerType = "retail"
): Promise<PriceCalculationResult> {
  const calculated = await Promise.all(
    items.map((it) => getVariantPricing(it.variant_id, it.quantity, customerType))
  )

  const subtotal = calculated.reduce((sum, it) => sum + it.line_total, 0)
  const safeDiscount = Math.min(discount, subtotal)
  const total = subtotal + deliveryFee - safeDiscount

  return {
    items: calculated,
    subtotal,
    discount: safeDiscount,
    delivery_fee: deliveryFee,
    total,
  }
}
