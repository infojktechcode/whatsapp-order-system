import { supabase } from "../lib/supabase.js"
import type { Product, ProductWithVariants, ProductVariant, Customer } from "../types/index.js"

// Products with their variants, scents and product types in one round trip.
// Prices are read from the database only — never hard-coded in components.
const PRODUCT_WITH_VARIANTS =
  "*, variants:product_variants(*, scent:scents(*), product_type:product_types(*))"

export async function fetchActiveProducts(): Promise<ProductWithVariants[]> {
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_WITH_VARIANTS)
    .eq("active", true)
    .order("name", { ascending: true })

  if (error) throw new Error("Failed to load products")
  return (data ?? []) as ProductWithVariants[]
}

/**
 * Catalogue search across product name/description and variant SKU, size,
 * scent and product type. The demo catalogue is small, so filtering happens
 * on the already-fetched active rows instead of a fragile cross-join query.
 */
export async function searchProducts(query: string): Promise<ProductWithVariants[]> {
  const products = await fetchActiveProducts()
  const q = query.trim().toLowerCase()
  if (!q) return products

  return products.filter(
    (product) =>
      product.name.toLowerCase().includes(q) ||
      (product.description ?? "").toLowerCase().includes(q) ||
      product.variants.some(
        (variant) =>
          variant.sku.toLowerCase().includes(q) ||
          variant.size.toLowerCase().includes(q) ||
          (variant.scent?.name ?? "").toLowerCase().includes(q) ||
          (variant.product_type?.name ?? "").toLowerCase().includes(q)
      )
  )
}

export async function getActiveProducts() {
  const { data, error } = await supabase.from("products").select("*").eq("active", true)
  if (error) throw new Error("Failed to load products")
  return data as Product[]
}

export async function getProductBySlug(slug: string) {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("slug", slug)
    .single()
  if (error) throw new Error("Product not found")
  return data as Product
}

export async function getActiveVariants(productId?: string) {
  let query = supabase.from("product_variants").select("*").eq("active", true)
  if (productId) query = query.eq("product_id", productId)
  const { data, error } = await query
  if (error) throw new Error("Failed to fetch variants")
  return data as ProductVariant[]
}

export async function getVariantById(variantId: string) {
  const { data, error } = await supabase
    .from("product_variants")
    .select("*")
    .eq("id", variantId)
    .single()
  if (error) throw new Error("Variant not found")
  return data as ProductVariant
}

export async function getCustomerByPhone(phone: string) {
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .eq("phone", phone)
    .single()
  if (error) return null
  return data as Customer
}

export async function getCustomerAddresses(customerId: string) {
  const { data, error } = await supabase
    .from("customer_addresses")
    .select("*")
    .eq("customer_id", customerId)
  if (error) throw new Error("Failed to fetch addresses")
  return data
}

export async function getOrdersSummary(customerId: string) {
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
  if (error) throw new Error("Failed to fetch orders")
  return data
}
