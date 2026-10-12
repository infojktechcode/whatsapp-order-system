// WhatsApp conversation state machine (docs/whatsapp.md).
//
// Pure TypeScript with injected I/O (`StateDeps`): the same file runs inside
// the WhatsApp Edge Function (Deno) and under Vitest. All ordering goes through
// the shared backend — this layer never invents prices and never writes to
// tables directly; createOrder() posts to the checkout Edge Function, which
// recomputes every amount in Postgres.
//
// Steps follow the documented flow:
//   BROWSING -> SELECTING_PRODUCT -> SELECTING_VARIANT -> SELECTING_QUANTITY
//   -> DELIVERY_INFORMATION -> ORDER_REVIEW -> PAYMENT -> CONFIRMATION
// plus two sub-states: TRACKING_ORDER (menu 3) and AWAITING_PHONE (collected
// before the order is created).

import { normalizePhone, ValidationError } from "../_shared/validate.ts"

export type ChatStep =
  | "BROWSING"
  | "SELECTING_PRODUCT"
  | "SELECTING_VARIANT"
  | "SELECTING_QUANTITY"
  | "DELIVERY_INFORMATION"
  | "AWAITING_PHONE"
  | "ORDER_REVIEW"
  | "PAYMENT"
  | "CONFIRMATION"
  | "TRACKING_ORDER"

export type ShopMode = "retail" | "wholesale"

export interface ConversationState {
  current_step: string
  selected_product_id?: string | null
  selected_variant_id?: string | null
  quantity?: number | null
  order_id?: string | null
  metadata?: Record<string, unknown> | null
}

export interface ChatUpdate {
  current_step: ChatStep
  selected_product_id?: string | null
  selected_variant_id?: string | null
  quantity?: number | null
  order_id?: string | null
  metadata?: Record<string, unknown> | null
}

export interface ChatTurn {
  reply: string
  update: ChatUpdate
}

export interface ProductOption {
  id: string
  name: string
}

export interface VariantOption {
  id: string
  size: string
  scent_name: string
  product_name: string
  retail_price: number
  wholesale_price: number
  wholesale_threshold: number
}

export interface CreatedOrder {
  order_id: string
  order_number: string
  total: number
}

export interface OrderStatusView {
  order_number: string
  status: string
  total: number
}

export interface CreateOrderInput {
  variantId: string
  quantity: number
  phone: string
  address: string
  mode: ShopMode
}

export interface StateDeps {
  listProducts(mode: ShopMode): Promise<ProductOption[]>
  listVariants(productId: string): Promise<VariantOption[]>
  getVariantDetail(variantId: string): Promise<VariantOption | null>
  /** Must go through the checkout Edge Function (server-side pricing). */
  createOrder(input: CreateOrderInput): Promise<CreatedOrder>
  /** Must go through the mpesa-stk Edge Function (server-side amount). */
  requestStkPush(orderId: string, phone: string): Promise<{ ok: boolean; error?: string }>
  findOrderStatus(orderNumber: string): Promise<OrderStatusView | null>
}

export const MENU_TEXT = [
  "Hello! Welcome to Dear Body.",
  "",
  "1. Shop Products",
  "2. Wholesale",
  "3. Track Order",
  "4. Talk to an Agent",
  "",
  "Reply with a number.",
].join("\n")

const MAX_PRODUCTS = 12
const MAX_VARIANTS = 8
const MAX_QUANTITY = 500
const KNOWN_STEPS = new Set<string>([
  "BROWSING",
  "SELECTING_PRODUCT",
  "SELECTING_VARIANT",
  "SELECTING_QUANTITY",
  "DELIVERY_INFORMATION",
  "AWAITING_PHONE",
  "ORDER_REVIEW",
  "PAYMENT",
  "CONFIRMATION",
  "TRACKING_ORDER",
])

function normalizeStep(step: string | null | undefined): ChatStep {
  return step && KNOWN_STEPS.has(step) ? (step as ChatStep) : "BROWSING"
}

function mode(state: ConversationState): ShopMode {
  return state.metadata?.mode === "wholesale" ? "wholesale" : "retail"
}

function mergeMetadata(
  state: ConversationState,
  patch: Record<string, unknown>
): Record<string, unknown> {
  return { ...(state.metadata ?? {}), ...patch }
}

function resetUpdate(step: ChatStep = "BROWSING", metadata?: Record<string, unknown>): ChatUpdate {
  return {
    current_step: step,
    selected_product_id: null,
    selected_variant_id: null,
    quantity: null,
    ...(metadata ? { metadata } : {}),
  }
}

function digits(input: string): string {
  return input.replace(/\D/g, "")
}

function unitPrice(v: VariantOption, shopMode: ShopMode, quantity: number): number {
  if (
    shopMode === "wholesale" &&
    v.wholesale_price > 0 &&
    quantity >= v.wholesale_threshold
  ) {
    return v.wholesale_price
  }
  return v.retail_price
}

function variantLine(v: VariantOption, shopMode: ShopMode, index: number): string {
  const label = `${v.scent_name} ${v.size}`.replace(/\s+/g, " ").trim()
  let price = `${v.retail_price.toLocaleString()}`
  if (shopMode === "wholesale" && v.wholesale_price > 0) {
    price += ` (wholesale ${v.wholesale_price.toLocaleString()} from ${v.wholesale_threshold} units)`
  }
  return `${index + 1}. ${label} — KES ${price}`
}

function reviewSummary(v: VariantOption, shopMode: ShopMode, quantity: number): string {
  const unit = unitPrice(v, shopMode, quantity)
  const label = `${v.product_name} — ${v.scent_name} ${v.size}`.replace(/\s+/g, " ").trim()
  return [
    "Please confirm your order:",
    "",
    `${label}`,
    `${quantity} x KES ${unit.toLocaleString()} = KES ${(unit * quantity).toLocaleString()}`,
    "",
    "Reply YES to continue, or NO to start over.",
  ].join("\n")
}

/** Enters ORDER_REVIEW and shows the real summary (prices come from the DB). */
async function reviewTurn(
  state: ConversationState,
  metadata: Record<string, unknown> | null,
  deps: StateDeps
): Promise<ChatTurn> {
  const variant = state.selected_variant_id
    ? await deps.getVariantDetail(state.selected_variant_id)
    : null
  if (!variant || !state.quantity) {
    return { reply: MENU_TEXT, update: resetUpdate("BROWSING", metadata ?? undefined) }
  }
  return {
    reply: reviewSummary(variant, mode(state), Number(state.quantity)),
    update: { current_step: "ORDER_REVIEW", metadata },
  }
}

/** Chat orders are created as pickup with the location the customer typed; the
 * agent confirms the delivery method and applies the county rate afterwards. */
async function createOrderAndAdvance(
  state: ConversationState,
  deps: StateDeps
): Promise<ChatTurn> {
  const variantId = state.selected_variant_id ?? ""
  const quantity = Number(state.quantity ?? 0)
  const phone = String(state.metadata?.phone ?? "")
  const address = String(state.metadata?.address ?? "To be confirmed")

  try {
    const order = await deps.createOrder({
      variantId,
      quantity,
      phone,
      address,
      mode: mode(state),
    })
    return {
      reply: [
        `Order ${order.order_number} created — KES ${order.total.toLocaleString()}.`,
        "",
        "Reply PAY to get the M-Pesa prompt, or pay later.",
        "Reply STATUS any time to check your order.",
      ].join("\n"),
      update: {
        current_step: "PAYMENT",
        order_id: order.order_id,
        metadata: mergeMetadata(state, { order_number: order.order_number, order_total: order.total }),
      },
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error"
    return {
      reply: `We could not create the order: ${message}. Reply NO to start over.`,
      update: { current_step: "ORDER_REVIEW", metadata: state.metadata ?? null },
    }
  }
}

async function handlePaymentStep(
  state: ConversationState,
  raw: string,
  deps: StateDeps
): Promise<ChatTurn> {
  const choice = digits(raw).toLowerCase()
  const word = raw.toLowerCase()

  if (choice === "1" || word === "pay" || word === "stk") {
    const orderId = state.order_id ?? ""
    const phone = String(state.metadata?.phone ?? "")
    if (!orderId) {
      return { reply: MENU_TEXT, update: resetUpdate("BROWSING", state.metadata ?? undefined) }
    }
    const result = await deps.requestStkPush(orderId, phone)
    if (result.ok) {
      return {
        reply: [
          `M-Pesa prompt sent to ${phone}. Enter your PIN to complete payment.`,
          "",
          "Reply STATUS to check your order.",
        ].join("\n"),
        update: { current_step: "CONFIRMATION", metadata: state.metadata ?? null },
      }
    }
    return {
      reply: `We could not send the M-Pesa prompt (${result.error ?? "try again shortly"}). Reply PAY to retry.`,
      update: { current_step: "PAYMENT", metadata: state.metadata ?? null },
    }
  }

  if (choice === "2" || word === "status") {
    const orderNumber = String(state.metadata?.order_number ?? "")
    const view = orderNumber ? await deps.findOrderStatus(orderNumber) : null
    return {
      reply: view
        ? `Order ${view.order_number} is ${view.status} (KES ${view.total.toLocaleString()}).`
        : "We could not find your order. An agent can help — reply 4.",
      update: { current_step: "CONFIRMATION", metadata: state.metadata ?? null },
    }
  }

  if (choice === "0" || word === "menu") {
    return { reply: MENU_TEXT, update: resetUpdate("BROWSING", state.metadata ?? undefined) }
  }

  return {
    reply: ["Reply PAY to get the M-Pesa prompt, STATUS to check your order, or 0 for the menu."].join(
      "\n"
    ),
    update: { current_step: "PAYMENT", metadata: state.metadata ?? null },
  }
}

/**
 * Handles one inbound customer message and returns the reply plus the fields
 * to persist on whatsapp_conversations.
 */
export async function handleMessage(
  state: ConversationState,
  text: string,
  deps: StateDeps
): Promise<ChatTurn> {
  const raw = (text ?? "").trim()
  const step = normalizeStep(state.current_step)

  switch (step) {
    case "BROWSING": {
      const choice = digits(raw)
      const word = raw.toLowerCase()

      if (choice === "1" || word === "shop") {
        const products = (await deps.listProducts("retail")).slice(0, MAX_PRODUCTS)
        if (products.length === 0) {
          return {
            reply: "Our catalogue is being updated. Reply 4 to talk to an agent.",
            update: { current_step: "BROWSING", metadata: mergeMetadata(state, { mode: "retail" }) },
          }
        }
        const list = products.map((p, i) => `${i + 1}. ${p.name}`).join("\n")
        return {
          reply: `Choose a product:\n\n${list}\n\nReply with a number, or 0 for the menu.`,
          update: { current_step: "SELECTING_PRODUCT", metadata: mergeMetadata(state, { mode: "retail" }) },
        }
      }

      if (choice === "2" || word === "wholesale") {
        const products = (await deps.listProducts("wholesale")).slice(0, MAX_PRODUCTS)
        if (products.length === 0) {
          return {
            reply: "Our catalogue is being updated. Reply 4 to talk to an agent.",
            update: { current_step: "BROWSING", metadata: mergeMetadata(state, { mode: "wholesale" }) },
          }
        }
        const list = products.map((p, i) => `${i + 1}. ${p.name}`).join("\n")
        return {
          reply: `Wholesale catalogue — choose a product:\n\n${list}\n\nReply with a number, or 0 for the menu.`,
          update: {
            current_step: "SELECTING_PRODUCT",
            metadata: mergeMetadata(state, { mode: "wholesale" }),
          },
        }
      }

      if (choice === "3" || word === "track") {
        return {
          reply: "Please send your order number (e.g. DB-20261012-8F8F93). Reply 0 to go back.",
          update: { current_step: "TRACKING_ORDER", metadata: state.metadata ?? null },
        }
      }

      if (choice === "4" || word === "agent") {
        return {
          reply: "An agent will reply here shortly. You can keep browsing in the meantime.",
          update: { current_step: "BROWSING", metadata: state.metadata ?? null },
        }
      }

      return { reply: MENU_TEXT, update: { current_step: "BROWSING", metadata: state.metadata ?? null } }
    }

    case "SELECTING_PRODUCT": {
      if (digits(raw) === "0" || raw.toLowerCase() === "menu") {
        return { reply: MENU_TEXT, update: resetUpdate("BROWSING", state.metadata ?? undefined) }
      }
      const index = Number(digits(raw)) - 1
      const products = (await deps.listProducts(mode(state))).slice(0, MAX_PRODUCTS)
      if (!Number.isInteger(index) || index < 0 || index >= products.length) {
        return {
          reply: "Please reply with one of the numbers in the list (0 goes back).",
          update: { current_step: "SELECTING_PRODUCT", metadata: state.metadata ?? null },
        }
      }
      const product = products[index]
      const variants = (await deps.listVariants(product.id)).slice(0, MAX_VARIANTS)
      if (variants.length === 0) {
        return {
          reply: `${product.name} has no available options right now. Reply 0 to go back.`,
          update: { current_step: "SELECTING_PRODUCT", metadata: state.metadata ?? null },
        }
      }
      const list = variants.map((v, i) => variantLine(v, mode(state), i)).join("\n")
      return {
        reply: `${product.name} — choose a size/scent:\n\n${list}\n\nReply with a number, or 0 to go back.`,
        update: {
          current_step: "SELECTING_VARIANT",
          selected_product_id: product.id,
          metadata: state.metadata ?? null,
        },
      }
    }

    case "SELECTING_VARIANT": {
      if (digits(raw) === "0") {
        return { reply: MENU_TEXT, update: resetUpdate("BROWSING", state.metadata ?? undefined) }
      }
      const productId = state.selected_product_id ?? ""
      const index = Number(digits(raw)) - 1
      const variants = (await deps.listVariants(productId)).slice(0, MAX_VARIANTS)
      if (!Number.isInteger(index) || index < 0 || index >= variants.length) {
        return {
          reply: "Please reply with one of the numbers in the list (0 goes back to the menu).",
          update: {
            current_step: "SELECTING_VARIANT",
            selected_product_id: productId,
            metadata: state.metadata ?? null,
          },
        }
      }
      const variant = variants[index]
      return {
        reply: `How many ${variant.scent_name} ${variant.size} would you like? (1-${MAX_QUANTITY})`,
        update: {
          current_step: "SELECTING_QUANTITY",
          selected_product_id: productId,
          selected_variant_id: variant.id,
          metadata: state.metadata ?? null,
        },
      }
    }

    case "SELECTING_QUANTITY": {
      const quantity = Number(digits(raw))
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
        return {
          reply: `Please reply with a quantity between 1 and ${MAX_QUANTITY}.`,
          update: { current_step: "SELECTING_QUANTITY", metadata: state.metadata ?? null },
        }
      }
      return {
        reply: "Where should we deliver? Reply with your location (or type PICKUP).",
        update: {
          current_step: "DELIVERY_INFORMATION",
          quantity,
          metadata: state.metadata ?? null,
        },
      }
    }

    case "DELIVERY_INFORMATION": {
      if (raw.length > 500 || raw === "") {
        return {
          reply: "Please reply with a short delivery location (max 500 characters).",
          update: { current_step: "DELIVERY_INFORMATION", metadata: state.metadata ?? null },
        }
      }
      const metadata = mergeMetadata(state, { address: raw })
      if (metadata.phone) {
        return reviewTurn(state, metadata, deps)
      }
      return {
        reply: "What is your M-Pesa phone number? (e.g. 254712345678)",
        update: { current_step: "AWAITING_PHONE", metadata },
      }
    }

    case "AWAITING_PHONE": {
      let phone: string
      try {
        phone = normalizePhone(raw, "phone")
      } catch (e) {
        const message = e instanceof ValidationError ? e.message : "That phone number is not valid."
        return {
          reply: `${message} Please try again, or reply 0 for the menu.`,
          update: { current_step: "AWAITING_PHONE", metadata: state.metadata ?? null },
        }
      }
      return reviewTurn(state, mergeMetadata(state, { phone }), deps)
    }

    case "ORDER_REVIEW": {
      const word = raw.toLowerCase()
      if (word === "yes" || word === "y" || word === "confirm" || digits(raw) === "1") {
        if (!state.selected_variant_id || !state.quantity) {
          return { reply: MENU_TEXT, update: resetUpdate("BROWSING", state.metadata ?? undefined) }
        }
        return createOrderAndAdvance(state, deps)
      }
      if (word === "no" || word === "n" || word === "restart" || digits(raw) === "0") {
        return {
          reply: `No problem. Let's start again.\n\n${MENU_TEXT}`,
          update: resetUpdate("BROWSING", state.metadata ?? undefined),
        }
      }
      return reviewTurn(state, state.metadata ?? null, deps)
    }

    case "PAYMENT":
      return handlePaymentStep(state, raw, deps)

    case "CONFIRMATION": {
      const orderNumber = String(state.metadata?.order_number ?? "")
      const word = raw.toLowerCase()
      if (word === "menu" || digits(raw) === "0") {
        return { reply: MENU_TEXT, update: resetUpdate("BROWSING", state.metadata ?? undefined) }
      }
      const view = orderNumber ? await deps.findOrderStatus(orderNumber) : null
      if (view) {
        return {
          reply: `Order ${view.order_number} is ${view.status} (KES ${view.total.toLocaleString()}).\nReply 0 for the menu.`,
          update: { current_step: "CONFIRMATION", metadata: state.metadata ?? null },
        }
      }
      return { reply: MENU_TEXT, update: resetUpdate("BROWSING", state.metadata ?? undefined) }
    }

    case "TRACKING_ORDER": {
      if (digits(raw) === "0") {
        return { reply: MENU_TEXT, update: resetUpdate("BROWSING", state.metadata ?? undefined) }
      }
      const orderNumber = raw.toUpperCase()
      const view = await deps.findOrderStatus(orderNumber)
      if (!view) {
        return {
          reply: `We could not find order ${orderNumber}. Please check the number, or reply 4 to talk to an agent.`,
          update: { current_step: "TRACKING_ORDER", metadata: state.metadata ?? null },
        }
      }
      return {
        reply: `Order ${view.order_number} is ${view.status} (KES ${view.total.toLocaleString()}).\nReply 0 for the menu.`,
        update: { current_step: "BROWSING", metadata: state.metadata ?? null },
      }
    }
  }
}
