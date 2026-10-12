// The WhatsApp state machine runs inside the `whatsapp` Edge Function, but the
// file itself is pure TypeScript with injected I/O — so the exact conversation
// contract is unit-tested here (docs/whatsapp.md). Ordering always goes through
// deps.createOrder / deps.requestStkPush (the checkout + mpesa-stk Edge
// Functions): this layer never invents prices and never writes tables.

import { describe, it, expect, vi } from 'vitest'
import {
  handleMessage,
  MENU_TEXT,
  type ConversationState,
  type ProductOption,
  type ShopMode,
  type StateDeps,
  type VariantOption,
} from '../../supabase/functions/whatsapp/state.ts'

const PRODUCTS: ProductOption[] = [
  { id: 'p1', name: 'Body Lotion' },
  { id: 'p2', name: 'Perfume' },
]

const VARIANTS: VariantOption[] = [
  {
    id: 'v1',
    size: '236ml',
    scent_name: 'Sweet Vanilla',
    product_name: 'Body Lotion',
    retail_price: 850,
    wholesale_price: 700,
    wholesale_threshold: 12,
  },
  {
    id: 'v2',
    size: '500ml',
    scent_name: 'Aloe',
    product_name: 'Body Lotion',
    retail_price: 1200,
    wholesale_price: 1000,
    wholesale_threshold: 12,
  },
]

function makeDeps() {
  const listProducts = vi.fn(async (_mode: ShopMode) => PRODUCTS)
  const listVariants = vi.fn(async (_productId: string) => VARIANTS)
  const getVariantDetail = vi.fn(async (variantId: string) =>
    VARIANTS.find((v) => v.id === variantId) ?? null
  )
  const createOrder = vi.fn(async (_input: unknown) => ({
    order_id: 'o1',
    order_number: 'DB-20261012-ABC123',
    total: 1700,
  }))
  const requestStkPush = vi.fn(async (_orderId: string, _phone: string) => ({ ok: true }))
  const findOrderStatus = vi.fn(async (orderNumber: string) => ({
    order_number: orderNumber,
    status: 'awaiting_payment',
    total: 1700,
  }))

  const deps: StateDeps = {
    listProducts,
    listVariants,
    getVariantDetail,
    createOrder,
    requestStkPush,
    findOrderStatus,
  }
  return { deps, listProducts, listVariants, getVariantDetail, createOrder, requestStkPush, findOrderStatus }
}

function browsing(metadata: Record<string, unknown> = {}): ConversationState {
  return { current_step: 'BROWSING', metadata }
}

/** Threads each reply's update back into the state, like the webhook does. */
function conversation(deps: StateDeps, initial: ConversationState = browsing()) {
  let state = initial
  return {
    get state() {
      return state
    },
    async send(text: string) {
      const turn = await handleMessage(state, text, deps)
      state = { ...state, ...turn.update } as ConversationState
      return turn
    },
  }
}

describe('WhatsApp state machine — menu and browsing', () => {
  it('answers an unknown message with the main menu', async () => {
    const { deps } = makeDeps()
    const turn = await handleMessage(browsing(), 'hello', deps)
    expect(turn.reply).toBe(MENU_TEXT)
    expect(turn.update.current_step).toBe('BROWSING')
  })

  it('treats a corrupted step as BROWSING instead of crashing', async () => {
    const { deps } = makeDeps()
    const turn = await handleMessage({ current_step: 'GARBAGE' }, 'hi', deps)
    expect(turn.reply).toBe(MENU_TEXT)
    expect(turn.update.current_step).toBe('BROWSING')
  })

  it('opens the retail catalogue on option 1', async () => {
    const { deps, listProducts } = makeDeps()
    const turn = await handleMessage(browsing(), '1', deps)
    expect(listProducts).toHaveBeenCalledWith('retail')
    expect(turn.reply).toContain('Body Lotion')
    expect(turn.update.current_step).toBe('SELECTING_PRODUCT')
    expect(turn.update.metadata?.mode).toBe('retail')
  })

  it('opens the wholesale catalogue on option 2', async () => {
    const { deps, listProducts } = makeDeps()
    const turn = await handleMessage(browsing(), '2', deps)
    expect(listProducts).toHaveBeenCalledWith('wholesale')
    expect(turn.reply).toContain('Wholesale')
    expect(turn.update.metadata?.mode).toBe('wholesale')
  })

  it('rejects an invalid product choice without changing step', async () => {
    const { deps } = makeDeps()
    const state: ConversationState = { current_step: 'SELECTING_PRODUCT', metadata: {} }
    const turn = await handleMessage(state, '99', deps)
    expect(turn.reply).toMatch(/one of the numbers/)
    expect(turn.update.current_step).toBe('SELECTING_PRODUCT')
  })

  it('offers the agent instead of inventing a human reply', async () => {
    const { deps } = makeDeps()
    const turn = await handleMessage(browsing(), '4', deps)
    expect(turn.reply).toContain('agent')
    expect(turn.update.current_step).toBe('BROWSING')
  })
})

describe('WhatsApp state machine — product selection', () => {
  it('lists variant options with database prices', async () => {
    const { deps } = makeDeps()
    const state: ConversationState = { current_step: 'SELECTING_PRODUCT', metadata: {} }
    const turn = await handleMessage(state, '1', deps)

    expect(turn.reply).toContain('Sweet Vanilla 236ml')
    expect(turn.reply).toContain('KES 850')
    expect(turn.update.current_step).toBe('SELECTING_VARIANT')
    expect(turn.update.selected_product_id).toBe('p1')
  })

  it('shows wholesale pricing in wholesale mode', async () => {
    const { deps } = makeDeps()
    const state: ConversationState = {
      current_step: 'SELECTING_PRODUCT',
      metadata: { mode: 'wholesale' },
    }
    const turn = await handleMessage(state, '1', deps)
    expect(turn.reply).toContain('wholesale 700 from 12 units')
  })

  it('stores the chosen variant and asks for a quantity', async () => {
    const { deps } = makeDeps()
    const state: ConversationState = {
      current_step: 'SELECTING_VARIANT',
      selected_product_id: 'p1',
      metadata: {},
    }
    const turn = await handleMessage(state, '2', deps)
    expect(turn.reply).toContain('How many Aloe 500ml')
    expect(turn.update.selected_variant_id).toBe('v2')
    expect(turn.update.current_step).toBe('SELECTING_QUANTITY')
  })
})

describe('WhatsApp state machine — order flow', () => {
  it('walks quantity → delivery → phone → review → order → payment', async () => {
    const { deps, createOrder, requestStkPush } = makeDeps()
    const chat = conversation(deps)

    await chat.send('1') // catalogue
    await chat.send('1') // product p1
    await chat.send('1') // variant v1
    const qty = await chat.send('2')
    expect(qty.update.current_step).toBe('DELIVERY_INFORMATION')
    expect(qty.update.quantity).toBe(2)

    const delivery = await chat.send('Thika Town')
    expect(delivery.update.current_step).toBe('AWAITING_PHONE')
    expect(delivery.reply).toContain('phone number')

    const review = await chat.send('0712345678')
    expect(review.update.current_step).toBe('ORDER_REVIEW')
    expect(review.reply).toContain('Please confirm your order:')
    expect(review.reply).toContain('2 x KES 850')

    const created = await chat.send('yes')
    expect(created.update.current_step).toBe('PAYMENT')
    expect(created.update.order_id).toBe('o1')
    expect(created.reply).toContain('Order DB-20261012-ABC123 created')

    const paid = await chat.send('PAY')
    expect(paid.update.current_step).toBe('CONFIRMATION')
    expect(paid.reply).toContain('M-Pesa prompt sent to 254712345678')

    // createOrder received input only — no price, fee or total field exists.
    expect(createOrder).toHaveBeenCalledTimes(1)
    expect(createOrder.mock.calls[0][0]).toEqual({
      variantId: 'v1',
      quantity: 2,
      phone: '254712345678',
      address: 'Thika Town',
      mode: 'retail',
    })
    expect(requestStkPush).toHaveBeenCalledWith('o1', '254712345678')
  })

  it('rejects an invalid phone and stays in AWAITING_PHONE', async () => {
    const { deps } = makeDeps()
    const state: ConversationState = {
      current_step: 'AWAITING_PHONE',
      metadata: { address: 'Thika Town' },
    }
    const turn = await handleMessage(state, 'not-a-phone', deps)
    expect(turn.reply).toMatch(/Kenyan number/)
    expect(turn.update.current_step).toBe('AWAITING_PHONE')
    expect(turn.update.metadata?.phone).toBeUndefined()
  })

  it('keeps ORDER_REVIEW and surfaces the server message when checkout fails', async () => {
    const { deps } = makeDeps()
    deps.createOrder = async () => {
      throw new Error('Insufficient stock for SKU FFM-SV-236 (available 1)')
    }
    const state: ConversationState = {
      current_step: 'ORDER_REVIEW',
      selected_variant_id: 'v1',
      quantity: 2,
      metadata: { phone: '254712345678', address: 'Thika Town' },
    }
    const turn = await handleMessage(state, 'yes', deps)

    expect(turn.update.current_step).toBe('ORDER_REVIEW')
    expect(turn.reply).toContain('Insufficient stock')
    expect(turn.reply).toContain('Reply NO to start over')
  })

  it('resets the selection when the customer says NO', async () => {
    const { deps } = makeDeps()
    const state: ConversationState = {
      current_step: 'ORDER_REVIEW',
      selected_variant_id: 'v1',
      quantity: 2,
      metadata: { phone: '254712345678' },
    }
    const turn = await handleMessage(state, 'no', deps)
    expect(turn.update.current_step).toBe('BROWSING')
    expect(turn.update.selected_variant_id).toBeNull()
    expect(turn.update.quantity).toBeNull()
  })

  it('keeps PAYMENT and reports the reason when the STK push fails', async () => {
    const { deps } = makeDeps()
    deps.requestStkPush = async () => ({ ok: false, error: 'M-Pesa is not configured' })
    const state: ConversationState = {
      current_step: 'PAYMENT',
      order_id: 'o1',
      metadata: { phone: '254712345678' },
    }
    const turn = await handleMessage(state, 'pay', deps)
    expect(turn.update.current_step).toBe('PAYMENT')
    expect(turn.reply).toContain('M-Pesa is not configured')
  })
})

describe('WhatsApp state machine — order tracking', () => {
  it('asks for the order number from menu option 3', async () => {
    const { deps } = makeDeps()
    const turn = await handleMessage(browsing(), '3', deps)
    expect(turn.update.current_step).toBe('TRACKING_ORDER')
    expect(turn.reply).toContain('order number')
  })

  it('reports status for a known order', async () => {
    const { deps, findOrderStatus } = makeDeps()
    const state: ConversationState = { current_step: 'TRACKING_ORDER', metadata: {} }
    const turn = await handleMessage(state, 'db-20261012-abc123', deps)

    expect(findOrderStatus).toHaveBeenCalledWith('DB-20261012-ABC123')
    expect(turn.reply).toContain('awaiting_payment')
    expect(turn.update.current_step).toBe('BROWSING')
  })

  it('does not confirm an unknown order number', async () => {
    const { deps } = makeDeps()
    deps.findOrderStatus = async () => null
    const state: ConversationState = { current_step: 'TRACKING_ORDER', metadata: {} }
    const turn = await handleMessage(state, 'DB-00000000-000000', deps)
    expect(turn.reply).toContain('could not find')
    expect(turn.update.current_step).toBe('TRACKING_ORDER')
  })
})

describe('WhatsApp state machine — safety', () => {
  it('never leaks secrets in any reply', async () => {
    const { deps } = makeDeps()
    const chat = conversation(deps)
    const replies = [
      (await chat.send('hello')).reply,
      (await chat.send('1')).reply,
      (await chat.send('1')).reply,
      (await chat.send('9999')).reply,
      (await chat.send('3')).reply,
    ]
    for (const reply of replies) {
      expect(reply).not.toMatch(/consumer_key|consumer_secret|passkey|service_role|sbp_/i)
    }
  })

  it('never accepts an empty message as a valid menu choice', async () => {
    const { deps } = makeDeps()
    const turn = await handleMessage(browsing(), '   ', deps)
    expect(turn.reply).toBe(MENU_TEXT)
    expect(turn.update.current_step).toBe('BROWSING')
  })
})
