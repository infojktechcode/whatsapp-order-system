import { supabase } from "../lib/supabase.js"

export async function getDeliveryRate(countyId: string, methodId: string, pickupPointId?: string) {
  let query = supabase.from("delivery_rates").select("*").eq("county_id", countyId).eq("delivery_method_id", methodId).eq("active", true)
  if (pickupPointId) query = query.eq("pickup_point_id", pickupPointId)
  const { data, error } = await query.single()
  if (error) return null
  return data
}

export async function getActiveCounties() {
  const { data, error } = await supabase.from("counties").select("*").eq("active", true)
  if (error) throw new Error("Failed to fetch counties")
  return data
}

export async function getActiveDeliveryMethods() {
  const { data, error } = await supabase.from("delivery_methods").select("*").eq("active", true)
  if (error) throw new Error("Failed to fetch delivery methods")
  return data
}

export async function getPickupPoints(countyId?: string) {
  let query = supabase.from("pickup_points").select("*").eq("active", true)
  if (countyId) query = query.eq("county_id", countyId)
  const { data, error } = await query
  if (error) throw new Error("Failed to fetch pickup points")
  return data
}
