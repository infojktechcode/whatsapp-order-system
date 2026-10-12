import { supabase } from "../lib/supabase.js"
import type { Product, ProductVariant, Customer } from "../types/index.js"

export async function getActiveProducts() {
  const { data, error } = await supabase.from("products").select("*").eq("active", true)
  if (error) throw new Error("Failed to load products")
  return data as Product[]
}

export async function getProductBySlug(slug: string) {
  const { data, error } = await supabase.from("products").select("*").eq("slug", slug).single()
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
  const { data, error } = await supabase.from("product_variants").select("*").eq("id", variantId).single()
  if (error) throw new Error("Variant not found")
  return data as ProductVariant
}

export async function getCustomerByPhone(phone: string) {
  const { data, error } = await supabase.from("customers").select("*").eq("phone", phone).single()
  if (error) return null
  return data as Customer
}

export async function getCustomerAddresses(customerId: string) {
  const { data, error } = await supabase.from("customer_addresses").select("*").eq("customer_id", customerId)
  if (error) throw new Error("Failed to fetch addresses")
  return data
}

export async function getOrdersSummary(customerId: string) {
  const { data, error } = await supabase.from("orders").select("*").eq("customer_id", customerId).order("created_at", { ascending: false })
  if (error) throw new Error("Failed to fetch orders")
  return data
}
