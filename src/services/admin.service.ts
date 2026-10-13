// Admin panel API. Every call goes to the `admin` Edge Function, never to the
// tables: RLS gives admins SELECT on orders but no writes, and status changes
// must run through transition_order_status() so the transition matrix and
// order_status_history are always respected.
//
// supabase-js attaches the signed-in user's JWT to `functions.invoke`, which is
// how the function identifies the caller; there is no token in this file.

import { supabase } from '../lib/supabase.js'
import { invokeFunction } from '../lib/functions.js'

export interface AdminOrderRow {
  id: string
  order_number: string
  created_at: string
  total: number
  status: string
  customer_phone: string | null
  customer_name: string | null
  payment_status: string | null
  mpesa_receipt_number: string | null
}

export interface AdminOrderItem {
  sku: string | null
  size: string | null
  product_name: string | null
  scent_name: string | null
  quantity: number
  unit_price: number
  pricing_tier: string | null
  line_total: number
}

export interface AdminOrderDetail extends Omit<AdminOrderRow, 'status'> {
  subtotal: number
  discount: number
  delivery_fee: number
  channel: string
  delivery_type: string
  delivery_address: unknown
  customer_notes: string | null
  paid_at: string | null
  status: string
  customer: { phone: string; name: string | null; email: string | null } | null
  items: AdminOrderItem[]
  payment: {
    status: string
    amount: number
    mpesa_receipt_number: string | null
    result_description: string | null
    phone_number: string | null
  } | null
  history: { created_at: string; from: string | null; to: string | null; reason: string | null }[]
  /** Next statuses the server allows for this order (from the transition matrix). */
  allowed_transitions: string[]
}

export interface AdminStats {
  orders_total: number
  orders_by_status: Record<string, number>
  paid_total: number
  low_stock_variants: number
}

export interface AdminTransitionResult {
  order_id: string
  order_number: string
  from: string | null
  to: string
  changed: boolean
}

export interface AdminProfile {
  name: string
  email: string
  role: string
  can_transition: boolean
}

/** Email + password sign-in for staff. Throws with Auth's own message. */
export async function signInAdmin(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
  if (error) throw new Error(error.message)
}

export async function signOutAdmin(): Promise<void> {
  const { error } = await supabase.auth.signOut()
  if (error) throw new Error(error.message)
}

export async function adminListOrders(options?: {
  status?: string
  limit?: number
}): Promise<AdminOrderRow[]> {
  const body: Record<string, unknown> = { action: 'list_orders' }
  if (options?.status) body.status = options.status
  if (options?.limit !== undefined) body.limit = options.limit

  const data = await invokeFunction<{ orders?: unknown }>('admin', body)
  if (!Array.isArray(data.orders)) {
    throw new Error('Admin list returned an unexpected response')
  }
  return data.orders as AdminOrderRow[]
}

export async function adminGetOrder(orderId: string): Promise<AdminOrderDetail> {
  const data = await invokeFunction<{ order?: AdminOrderDetail }>('admin', {
    action: 'get_order',
    order_id: orderId,
  })
  if (!data.order || typeof data.order.order_number !== 'string') {
    throw new Error('Admin order lookup returned an unexpected response')
  }
  return data.order
}

/**
 * Asks the server to move the order to `toStatus`. The transition matrix is
 * enforced server-side; an illegal move comes back as a 400 whose message we
 * surface verbatim.
 */
export async function adminTransition(
  orderId: string,
  toStatus: string,
  reason?: string
): Promise<AdminTransitionResult> {
  const body: Record<string, unknown> = {
    action: 'transition',
    order_id: orderId,
    to_status: toStatus,
  }
  if (reason) body.reason = reason

  const data = await invokeFunction<AdminTransitionResult>('admin', body)
  if (typeof data.to !== 'string') {
    throw new Error('Admin transition returned an unexpected response')
  }
  return data
}

/** Confirms the session maps to an active admin and reports its role. */
export async function adminMe(): Promise<AdminProfile> {
  const data = await invokeFunction<{ profile?: AdminProfile }>('admin', { action: 'me' })
  if (!data.profile || typeof data.profile.role !== 'string') {
    throw new Error('Admin profile returned an unexpected response')
  }
  return data.profile
}

export async function adminStats(): Promise<AdminStats> {
  const data = await invokeFunction<Partial<AdminStats>>('admin', { action: 'stats' })
  if (typeof data.orders_total !== 'number' || !data.orders_by_status) {
    throw new Error('Admin stats returned an unexpected response')
  }
  return {
    orders_total: data.orders_total,
    orders_by_status: data.orders_by_status,
    paid_total: data.paid_total ?? 0,
    low_stock_variants: data.low_stock_variants ?? 0,
  }
}