// WhatsApp Cloud API webhook Edge Function (deployed with --no-verify-jwt).
//
//   GET  /functions/v1/whatsapp?hub.verify_token=...&hub.challenge=...
//   POST /functions/v1/whatsapp            (X-Hub-Signature-256 required)
//
// Layers:
//   * GET  — echo the challenge only when WHATSAPP_VERIFY_TOKEN matches.
//   * POST — HMAC-SHA256 signature over the raw body with WHATSAPP_APP_SECRET
//            (fail closed: no secret configured, no messages processed).
//   * inbound messages are persisted, then run through the conversation state
//     machine in ./state.ts, which calls the same checkout / mpesa-stk Edge
//     Functions as the website (docs/whatsapp.md: one backend, two channels).

import { preflight, json } from "../_shared/cors.ts"
import { admin, projectUrl, safeDbMessage } from "../_shared/db.ts"
import { timingSafeEqual } from "../_shared/validate.ts"
import {
  handleMessage,
  type ChatTurn,
  type ConversationState,
  type CreatedOrder,
  type OrderStatusView,
  type ProductOption,
  type StateDeps,
  type VariantOption,
} from "./state.ts"

const MAX_MESSAGES_PER_BATCH = 3
const MAX_VARIANTS = 10
const MAX_PRODUCTS = 12

interface InboundMessage {
  waId: string
  text: string
  messageId: string
}

// ---------------------------------------------------------------------------
// signature + verification
// ---------------------------------------------------------------------------

async function verifySignature(rawBody: string, header: string | null): Promise<boolean> {
  const secret = Deno.env.get("WHATSAPP_APP_SECRET")
  if (!secret) return false // fail closed — caller answers 503
  if (!header || !header.startsWith("sha256=")) return false

  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody))
  const expected = [...new Uint8Array(mac)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
  return timingSafeEqual(header.slice("sha256=".length), expected)
}

function handleVerify(req: Request): Response | null {
  if (req.method !== "GET") return null
  const params = new URL(req.url).searchParams
  const mode = params.get("hub.mode")
  const token = params.get("hub.verify_token") ?? ""
  const challenge = params.get("hub.challenge") ?? ""
  const expected = Deno.env.get("WHATSAPP_VERIFY_TOKEN") ?? ""

  if (!expected) return json({ error: "WhatsApp is not configured" }, 503)
  if (mode === "subscribe" && token && challenge && timingSafeEqual(token, expected)) {
    return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } })
  }
  return json({ error: "Verification failed" }, 403)
}

// ---------------------------------------------------------------------------
// payload parsing
// ---------------------------------------------------------------------------

function extractMessages(payload: unknown): InboundMessage[] {
  const messages: InboundMessage[] = []
  const entries = Array.isArray((payload as Record<string, unknown>)?.entry)
    ? ((payload as { entry: unknown[] }).entry as Array<Record<string, unknown>>)
    : []

  for (const entry of entries) {
    const changes = Array.isArray(entry.changes) ? (entry.changes as Array<Record<string, unknown>>) : []
    for (const change of changes) {
      const value = change.value as Record<string, unknown> | undefined
      const batch = Array.isArray(value?.messages) ? (value.messages as Array<Record<string, unknown>>) : []
      for (const message of batch) {
        if (message.type !== "text") continue
        const text = (message.text as Record<string, unknown> | undefined)?.body
        const from = typeof message.from === "string" ? message.from : null
        if (!from || typeof text !== "string" || text.trim() === "") continue
        messages.push({
          waId: from,
          text: text.slice(0, 1000),
          messageId: typeof message.id === "string" ? message.id : "",
        })
        if (messages.length >= MAX_MESSAGES_PER_BATCH) return messages
      }
    }
  }
  return messages
}

// ---------------------------------------------------------------------------
// backend dependencies for the state machine
// ---------------------------------------------------------------------------

function deps(): StateDeps {
  const db = admin()

  return {
    async listProducts(): Promise<ProductOption[]> {
      const { data, error } = await db
        .from("products")
        .select("id, name")
        .eq("active", true)
        .order("name")
        .limit(MAX_PRODUCTS)
      if (error || !data) {
        console.error("whatsapp listProducts:", error?.message ?? "no data")
        return []
      }
      return data.map((row) => ({ id: row.id as string, name: row.name as string }))
    },

    async listVariants(productId: string): Promise<VariantOption[]> {
      const { data, error } = await db
        .from("product_variants")
        .select(
          "id, size, retail_price, wholesale_price, wholesale_threshold, active, " +
            "scent:scents(name), product:products(name)"
        )
        .eq("product_id", productId)
        .eq("active", true)
        .order("size")
        .limit(MAX_VARIANTS)
      if (error || !data) {
        console.error("whatsapp listVariants:", error?.message ?? "no data")
        return []
      }
      return data.map((row) => ({
        id: row.id as string,
        size: (row.size as string) ?? "",
        scent_name: (row.scent as { name?: string } | null)?.name ?? "",
        product_name: (row.product as { name?: string } | null)?.name ?? "",
        retail_price: Number(row.retail_price ?? 0),
        wholesale_price: Number(row.wholesale_price ?? 0),
        wholesale_threshold: Number(row.wholesale_threshold ?? 12),
      }))
    },

    async getVariantDetail(variantId: string): Promise<VariantOption | null> {
      const { data, error } = await db
        .from("product_variants")
        .select(
          "id, size, retail_price, wholesale_price, wholesale_threshold, product_id, active, " +
            "scent:scents(name), product:products(name)"
        )
        .eq("id", variantId)
        .maybeSingle()
      if (error || !data) return null
      return {
        id: data.id as string,
        size: (data.size as string) ?? "",
        scent_name: (data.scent as { name?: string } | null)?.name ?? "",
        product_name: (data.product as { name?: string } | null)?.name ?? "",
        retail_price: Number(data.retail_price ?? 0),
        wholesale_price: Number(data.wholesale_price ?? 0),
        wholesale_threshold: Number(data.wholesale_threshold ?? 12),
      }
    },

    async createOrder(input): Promise<CreatedOrder> {
      const { data, error } = await db.rpc("create_order", {
        p_items: [{ variant_id: input.variantId, quantity: input.quantity }],
        p_customer: { phone: input.phone, name: null, email: null },
        p_delivery: {
          type: "pickup",
          county_id: null,
          method_id: null,
          pickup_point_id: null,
          address: { text: input.address },
        },
        p_channel: "whatsapp",
        p_customer_type: input.mode,
        p_customer_notes: "WhatsApp order",
      })
      if (error || !data) {
        console.error("whatsapp createOrder:", error?.message ?? "no data")
        throw new Error(safeDbMessage(error?.message) ?? "the order could not be created")
      }
      return {
        order_id: data.order_id as string,
        order_number: data.order_number as string,
        total: Number(data.total ?? 0),
      }
    },

    async requestStkPush(orderId, phone): Promise<{ ok: boolean; error?: string }> {
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
      const response = await fetch(`${projectUrl()}/functions/v1/mpesa-stk`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
        },
        body: JSON.stringify({ order_id: orderId, phone }),
      })
      const body = (await response.json().catch(() => ({}))) as Record<string, unknown>
      if (!response.ok) {
        return {
          ok: false,
          error: typeof body.error === "string" ? body.error.slice(0, 160) : `HTTP ${response.status}`,
        }
      }
      return { ok: true }
    },

    async findOrderStatus(orderNumber: string): Promise<OrderStatusView | null> {
      const { data: order, error } = await db
        .from("orders")
        .select("order_number, total, status_id")
        .eq("order_number", orderNumber)
        .maybeSingle()
      if (error || !order) return null
      const { data: status } = await db
        .from("order_statuses")
        .select("slug")
        .eq("id", order.status_id as string)
        .maybeSingle()
      return {
        order_number: order.order_number as string,
        status: (status?.slug as string) ?? "unknown",
        total: Number(order.total ?? 0),
      }
    },
  }
}

// ---------------------------------------------------------------------------
// outbound send (WhatsApp Cloud API)
// ---------------------------------------------------------------------------

async function sendText(to: string, text: string): Promise<string | null> {
  const token = Deno.env.get("WHATSAPP_TOKEN")
  const phoneId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")
  if (!token || !phoneId) return "WhatsApp sending is not configured"

  try {
    const response = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { preview_url: false, body: text.slice(0, 4096) },
      }),
    })
    if (!response.ok) return `Graph API error (HTTP ${response.status})`
    return null
  } catch {
    return "Graph API request failed"
  }
}

// ---------------------------------------------------------------------------
// conversation persistence
// ---------------------------------------------------------------------------

interface ConversationRow {
  id: string
  current_step: string
  selected_product_id: string | null
  selected_variant_id: string | null
  quantity: number | null
  order_id: string | null
  metadata: Record<string, unknown> | null
}

async function loadOrCreateConversation(phone: string): Promise<ConversationRow | null> {
  const db = admin()
  const now = new Date().toISOString()

  const { data: existing, error: readError } = await db
    .from("whatsapp_conversations")
    .select(
      "id, current_step, selected_product_id, selected_variant_id, quantity, order_id, metadata"
    )
    .eq("conversation_id", phone)
    .maybeSingle()

  if (readError) {
    console.error("whatsapp conversation read:", readError.message)
    return null
  }
  if (existing) {
    await db
      .from("whatsapp_conversations")
      .update({ last_message_at: now, updated_at: now })
      .eq("id", existing.id)
    return existing as ConversationRow
  }

  const { data: created, error: insertError } = await db
    .from("whatsapp_conversations")
    .insert({
      conversation_id: phone,
      phone_number: phone,
      current_step: "BROWSING",
      last_message_at: now,
      metadata: {},
    })
    .select("id, current_step, selected_product_id, selected_variant_id, quantity, order_id, metadata")
    .single()

  if (insertError || !created) {
    console.error("whatsapp conversation insert:", insertError?.message ?? "no data")
    return null
  }
  return created as ConversationRow
}

async function applyTurn(conversationId: string, turn: ChatTurn): Promise<void> {
  const now = new Date().toISOString()
  const { error } = await admin()
    .from("whatsapp_conversations")
    .update({
      current_step: turn.update.current_step,
      selected_product_id: turn.update.selected_product_id ?? undefined,
      selected_variant_id: turn.update.selected_variant_id ?? undefined,
      quantity: turn.update.quantity ?? undefined,
      order_id: turn.update.order_id ?? undefined,
      metadata: turn.update.metadata ?? undefined,
      updated_at: now,
    })
    .eq("id", conversationId)
  if (error) console.error("whatsapp conversation update:", error.message)
}

// ---------------------------------------------------------------------------
// webhook entry point
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  const preflightResponse = preflight(req)
  if (preflightResponse) return preflightResponse

  if (req.method === "GET") {
    return handleVerify(req) ?? json({ error: "Method not allowed" }, 405)
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

  const rawBody = await req.text()

  if (!Deno.env.get("WHATSAPP_APP_SECRET")) {
    console.error("whatsapp: WHATSAPP_APP_SECRET is not configured")
    return json({ error: "WhatsApp is not configured" }, 503)
  }
  const signature = req.headers.get("x-hub-signature-256")
  if (!(await verifySignature(rawBody, signature))) {
    console.warn("whatsapp: rejected a request with an invalid signature")
    return json({ error: "Invalid signature" }, 401)
  }

  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return json({ error: "Body must be valid JSON" }, 400)
  }

  const inbound = extractMessages(payload)
  if (inbound.length === 0) return json({ received: true, ignored: true }, 200)

  const db = admin()
  const stateDeps = deps()

  for (const message of inbound) {
    let conversation: ConversationRow | null = null
    try {
      conversation = await loadOrCreateConversation(message.waId)
    } catch (e) {
      console.error("whatsapp conversation failure:", e instanceof Error ? e.message : e)
    }
    if (!conversation) continue

    const { data: stored } = await db
      .from("whatsapp_messages")
      .insert({
        conversation_id: conversation.id,
        direction: "inbound",
        message_type: "text",
        from_phone: message.waId,
        content: message.text,
        payload: message.messageId ? { wa_message_id: message.messageId } : {},
        processed: false,
      })
      .select("id")
      .single()

    const state: ConversationState = {
      current_step: conversation.current_step,
      selected_product_id: conversation.selected_product_id,
      selected_variant_id: conversation.selected_variant_id,
      quantity: conversation.quantity,
      order_id: conversation.order_id,
      metadata: conversation.metadata ?? {},
    }

    const turn = await handleMessage(state, message.text, stateDeps)
    await applyTurn(conversation.id, turn)

    const sendError = await sendText(message.waId, turn.reply)

    await db.from("whatsapp_messages").insert({
      conversation_id: conversation.id,
      direction: "outbound",
      message_type: "text",
      to_phone: message.waId,
      content: turn.reply,
      payload: sendError ? { delivery: "failed" } : { delivery: "sent" },
      processed: true,
      error: sendError,
    })

    if (stored?.id) {
      await db.from("whatsapp_messages").update({ processed: true }).eq("id", stored.id)
    }
  }

  return json({ received: true }, 200)
})
