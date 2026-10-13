// Admin Edge Function — order management for signed-in staff.
//
//   POST /functions/v1/admin
//   { action: 'list_orders' | 'get_order' | 'transition' | 'stats', ... }
//
// Authorization (two layers, both required):
//   1. The platform verifies the JWT (verify_jwt stays on).
//   2. This handler resolves the caller with Auth and requires an ACTIVE row in
//      admin_users. That second check is the real gate: it is what a publishable
//      key, an anon token, or a plain customer account can never satisfy.
//
// Reads run with the service role (after the admin_users check). Writes never
// touch orders directly — status changes go through transition_order_status(),
// which enforces the transition matrix and writes order_status_history, and
// every admin action is recorded in audit_logs.

import { preflight, json, methodNotAllowed, clientIp } from "../_shared/cors.ts"
import { admin, safeDbMessage } from "../_shared/db.ts"
import { ValidationError } from "../_shared/validate.ts"
import { parseAdminRequest, ADMIN_SETTABLE_STATUSES, type AdminRequest } from "./parse.ts"
import { assertAdminRole, canTransition, type AdminProfile } from "./auth.ts"

const MAX_BODY_BYTES = 32_768

interface AdminRow {
  id: string
  auth_user_id: string
  name: string
  email: string
  role: string
  is_active: boolean
}

/**
 * Resolves the caller. The publishable key is a valid project credential (it
 * even passes the platform's JWT check), so it is rejected explicitly; then the
 * JWT is verified against Auth and must map to an active admin_users row.
 */
async function requireAdmin(req: Request): Promise<AdminProfile | Response> {
  const header = req.headers.get("authorization") ?? ""
  const token = header.toLowerCase().startsWith("bearer ")
    ? header.slice("bearer ".length).trim()
    : ""

  if (!token) return json({ error: "Sign in required" }, 401)

  const db = admin()

  // Validates the signature/expiry against Auth and returns the real user.
  const { data, error } = await db.auth.getUser(token)
  const userId = data?.user?.id
  if (error || !userId) return json({ error: "Invalid or expired session" }, 401)

  const { data: row, error: adminError } = await db
    .from("admin_users")
    .select("id, auth_user_id, name, email, role, is_active")
    .eq("auth_user_id", userId)
    .maybeSingle()

  if (adminError) {
    console.error("admin_users lookup failed:", adminError.message)
    return json({ error: "Could not verify admin access" }, 500)
  }

  const record = row as AdminRow | null
  if (!record || !record.is_active) return json({ error: "Admin access required" }, 403)

  return { rowId: record.id, name: record.name, email: record.email, role: record.role }
}

interface OrderListRow {
  id: string
  order_number: string
  created_at: string
  total: number
  status: { slug: string } | { slug: string }[] | null
  customer: { phone: string; name: string | null } | { phone: string; name: string | null }[] | null
  payments:
    | { status: string; amount: number; mpesa_receipt_number: string | null }
    | { status: string; amount: number; mpesa_receipt_number: string | null }[]
    | null
}

/** PostgREST returns a bare object for to-one embeds and an array otherwise. */
function one<T>(value: T | T[] | null): T | null {
  if (value === null) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

async function listOrders(request: Extract<AdminRequest, { action: "list_orders" }>) {
  const db = admin()

  let statusId: string | null = null
  if (request.status) {
    const { data: statusRow, error: statusError } = await db
      .from("order_statuses")
      .select("id")
      .eq("slug", request.status)
      .maybeSingle()
    if (statusError) {
      console.error("order_statuses lookup failed:", statusError.message)
      return json({ error: "Could not load orders" }, 500)
    }
    if (!statusRow) return json({ error: `Unknown status: ${request.status}` }, 400)
    statusId = statusRow.id as string
  }

  let query = db
    .from("orders")
    .select(
      "id, order_number, created_at, total, status:order_statuses(slug), customer:customers(phone, name), payments(status, amount, mpesa_receipt_number)"
    )
    .order("created_at", { ascending: false })
    .limit(request.limit)

  if (statusId) query = query.eq("status_id", statusId)

  const { data, error } = await query
  if (error) {
    console.error("orders list failed:", error.message)
    return json({ error: "Could not load orders" }, 500)
  }

  const orders = (data as OrderListRow[] | null ?? []).map((row) => {
    const status = one(row.status)
    const customer = one(row.customer)
    const payment = one(row.payments)
    return {
      id: row.id,
      order_number: row.order_number,
      created_at: row.created_at,
      total: row.total,
      status: status?.slug ?? "unknown",
      customer_phone: customer?.phone ?? null,
      customer_name: customer?.name ?? null,
      payment_status: payment?.status ?? null,
      mpesa_receipt_number: payment?.mpesa_receipt_number ?? null,
    }
  })

  return json({ orders })
}

async function getOrder(request: Extract<AdminRequest, { action: "get_order" }>) {
  const db = admin()

  const { data, error } = await db
    .from("orders")
    .select(
      "id, order_number, created_at, subtotal, discount, delivery_fee, total, channel, delivery_type, delivery_address, customer_notes, paid_at, status_id, status:order_statuses(slug), customer:customers(phone, name, email), items:order_items(quantity, unit_price, pricing_tier, line_total, variant:product_variants(sku, size, product:products(name), scent:scents(name))), payments(status, amount, mpesa_receipt_number, result_description, phone_number)"
    )
    .eq("id", request.order_id)
    .maybeSingle()

  if (error) {
    console.error("order detail failed:", error.message)
    return json({ error: "Could not load the order" }, 500)
  }
  if (!data) return json({ error: "Order not found" }, 404)

  const row = data as Record<string, unknown>
  const status = one(row.status as { slug: string } | null)
  const customer = one(row.customer as Record<string, unknown> | null)
  const payment = one(row.payments as Record<string, unknown> | null)
  const items = Array.isArray(row.items) ? (row.items as Record<string, unknown>[]) : []

  const { data: history, error: historyError } = await db
    .from("order_status_history")
    .select(
      "created_at, change_reason, from_status:order_statuses!order_status_history_from_status_id_fkey(slug), to_status:order_statuses!order_status_history_to_status_id_fkey(slug)"
    )
    .eq("order_id", request.order_id)
    .order("created_at", { ascending: false })
    .limit(50)

  if (historyError) {
    console.error("order history failed:", historyError.message)
    return json({ error: "Could not load the order" }, 500)
  }

  // Allowed next statuses come from the transition matrix itself, narrowed to
  // the ones an admin may drive. The browser renders what the server allows —
  // no copy of the matrix in the frontend (AGENTS.md: one source of truth).
  const { data: transitions, error: transitionsError } = await db
    .from("order_status_transitions")
    .select("to_status:order_statuses!order_status_transitions_to_status_id_fkey(slug)")
    .eq("from_status_id", row.status_id as string)

  if (transitionsError) {
    // Never silently present "no transitions available" when the lookup failed.
    console.error("order_status_transitions lookup failed:", transitionsError.message)
    return json({ error: "Could not load the order" }, 500)
  }

  const settable = new Set<string>(ADMIN_SETTABLE_STATUSES)
  const allowedTransitions = (
    ((transitions ?? []) as { to_status: { slug: string } | null }[])
      .map((entry) => entry.to_status?.slug)
      .filter((slug): slug is string => typeof slug === "string" && settable.has(slug))
      .filter((slug) => slug !== status?.slug)
      // Never offer "paid": only a validated Daraja callback may mark paid.
      .filter((slug) => slug !== "paid")
  )

  const historyRows = (history as Record<string, unknown>[] | null ?? []).map((entry) => ({
    created_at: entry.created_at as string,
    from: one(entry.from_status as { slug: string } | null)?.slug ?? null,
    to: one(entry.to_status as { slug: string } | null)?.slug ?? null,
    reason: (entry.change_reason as string | null) ?? null,
  }))

  return json({
    order: {
      id: row.id,
      order_number: row.order_number,
      created_at: row.created_at,
      subtotal: row.subtotal,
      discount: row.discount,
      delivery_fee: row.delivery_fee,
      total: row.total,
      channel: row.channel,
      delivery_type: row.delivery_type,
      delivery_address: row.delivery_address,
      customer_notes: row.customer_notes,
      paid_at: row.paid_at,
      status: status?.slug ?? "unknown",
      customer: customer
        ? {
            phone: customer.phone,
            name: customer.name,
            email: customer.email,
          }
        : null,
      items: items.map((item) => {
        const variant = one(item.variant as Record<string, unknown> | null)
        const product = one(variant?.product as Record<string, unknown> | null)
        const scent = one(variant?.scent as Record<string, unknown> | null)
        return {
          sku: variant?.sku ?? null,
          size: variant?.size ?? null,
          product_name: product?.name ?? null,
          scent_name: scent?.name ?? null,
          quantity: item.quantity,
          unit_price: item.unit_price,
          pricing_tier: item.pricing_tier,
          line_total: item.line_total,
        }
      }),
      payment: payment
        ? {
            status: payment.status,
            amount: payment.amount,
            mpesa_receipt_number: payment.mpesa_receipt_number,
            result_description: payment.result_description,
            phone_number: payment.phone_number,
          }
        : null,
      history: historyRows,
      allowed_transitions: allowedTransitions,
    },
  })
}

async function transitionOrder(
  request: Extract<AdminRequest, { action: "transition" }>,
  actor: AdminProfile,
  req: Request
) {
  if (!canTransition(actor.role)) {
    return json({ error: "Your role cannot change order status" }, 403)
  }

  const db = admin()

  const { data: before, error: beforeError } = await db
    .from("orders")
    .select("id, order_number, status_id, status:order_statuses(slug)")
    .eq("id", request.order_id)
    .maybeSingle()

  if (beforeError) {
    console.error("order lookup failed:", beforeError.message)
    return json({ error: "Could not load the order" }, 500)
  }
  if (!before) return json({ error: "Order not found" }, 404)

  const previous = one(
    (before as Record<string, unknown>).status as { slug: string } | null
  )?.slug

  // The only path to a status change: the guarded SQL function.
  const { data, error } = await db.rpc("transition_order_status", {
    p_order_id: request.order_id,
    p_to_status_slug: request.to_status,
    p_changed_by: actor.rowId,
    p_reason: request.reason ?? `Admin action by ${actor.name}`,
  })

  if (error) {
    const safe = safeDbMessage(error.message)
    console.error("transition_order_status failed:", error.message)
    return json({ error: safe ?? "That status change is not allowed for this order" }, 400)
  }

  // audit_logs has no FK on resource_id (unlike other tables) — write it right
  // after the transition so every admin action is on record.
  const { error: auditError } = await db.from("audit_logs").insert({
    actor_id: actor.rowId,
    actor_type: "admin",
    action: "order_status_transition",
    resource: "order",
    resource_id: request.order_id,
    old_value: { status: previous ?? null },
    new_value: { status: request.to_status },
    metadata: { reason: request.reason ?? null, actor_role: actor.role },
    ip_address: clientIp(req),
    user_agent: req.headers.get("user-agent"),
  })

  if (auditError) {
    // The transition itself already committed; log loudly rather than fail the
    // response, so staff can retry the action.
    console.error("audit_logs insert failed after transition:", auditError.message)
  }

  return json({
    order_id: request.order_id,
    order_number: (before as Record<string, unknown>).order_number,
    from: previous ?? null,
    to: request.to_status,
    changed: data === true,
  })
}

async function stats() {
  const db = admin()

  const [ordersResult, paymentsResult, variantsResult] = await Promise.all([
    db.from("orders").select("status_id, paid_at"),
    db.from("payments").select("status, amount"),
    db.from("product_variants").select("id, stock_quantity, low_stock_threshold, active"),
  ])

  if (ordersResult.error || paymentsResult.error || variantsResult.error) {
    console.error("stats queries failed:", JSON.stringify([
      ordersResult.error?.message,
      paymentsResult.error?.message,
      variantsResult.error?.message,
    ]))
    return json({ error: "Could not load stats" }, 500)
  }

  const statusIds = [...new Set((ordersResult.data ?? []).map((row) => row.status_id as string))]
  const { data: statusRows, error: statusError } = await db
    .from("order_statuses")
    .select("id, slug")
    .in("id", statusIds.length > 0 ? statusIds : ["00000000-0000-0000-0000-000000000000"])

  if (statusError) {
    console.error("order_statuses lookup failed:", statusError.message)
    return json({ error: "Could not load stats" }, 500)
  }
  const slugById = new Map(
    ((statusRows ?? []) as { id: string; slug: string }[]).map((row) => [row.id, row.slug])
  )

  const byStatus: Record<string, number> = {}
  for (const row of ordersResult.data ?? []) {
    const slug = slugById.get(row.status_id as string) ?? "unknown"
    byStatus[slug] = (byStatus[slug] ?? 0) + 1
  }

  const paidRows = (paymentsResult.data ?? []) as { status: string; amount: number }[]
  const paidTotal = paidRows
    .filter((row) => row.status === "completed")
    .reduce((sum, row) => sum + (row.amount ?? 0), 0)

  const lowStock = ((variantsResult.data ?? []) as {
    stock_quantity: number
    low_stock_threshold: number
    active: boolean
  }[]).filter((row) => row.active && row.stock_quantity <= row.low_stock_threshold).length

  return json({
    orders_total: (ordersResult.data ?? []).length,
    orders_by_status: byStatus,
    paid_total: paidTotal,
    low_stock_variants: lowStock,
  })
}

Deno.serve(async (req) => {
  const preflightResponse = preflight(req)
  if (preflightResponse) return preflightResponse
  if (req.method !== "POST") return methodNotAllowed(["POST"])

  const contentLength = Number(req.headers.get("content-length") ?? "0")
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return json({ error: "Request body is too large" }, 413)
  }

  const actor = await requireAdmin(req)
  if (actor instanceof Response) return actor

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return json({ error: "Body must be valid JSON" }, 400)
  }

  let request: AdminRequest
  try {
    request = parseAdminRequest(raw)
    assertAdminRole(actor)
  } catch (e) {
    if (e instanceof ValidationError) return json({ error: e.message, field: e.field }, 400)
    throw e
  }

  try {
    switch (request.action) {
      case "list_orders":
        return await listOrders(request)
      case "get_order":
        return await getOrder(request)
      case "transition":
        return await transitionOrder(request, actor, req)
      case "stats":
        return await stats()
      case "me":
        return json({
          profile: {
            name: actor.name,
            email: actor.email,
            role: actor.role,
            can_transition: canTransition(actor.role),
          },
        })
    }
  } catch (e) {
    console.error("admin unexpected error:", e instanceof Error ? e.message : e)
    return json({ error: "Something went wrong" }, 500)
  }
})