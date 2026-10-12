import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mockSupabase, mockTable, resetMocks, mockCalls, okInsert } from '../helpers/mockSupabase.js'

vi.mock('../../src/lib/supabase.js', async () => ({ supabase: mockSupabase }))

import { checkout } from '../../src/services/checkout.service.js'
import type { CheckoutInput } from '../../src/types/checkout.js'

const VARIANT = {
  id: 'v1',
  retail_price: 700,
  wholesale_price: 600,
  wholesale_threshold: 12,
  stock_quantity: 500,
  active: true,
}

const makeInput = (overrides: Partial<CheckoutInput> = {}): CheckoutInput => ({
  items: [{ variant_id: 'v1', quantity: 24 }],
  customer_id: 'c1',
  customer_type: 'wholesale',
  delivery_type: 'courier',
  delivery_fee: 400,
  discount: 0,
  ...overrides,
})

describe('checkout', () => {
  beforeEach(() => {
    resetMocks()
    mockTable('product_variants', () => ({ data: VARIANT, error: null }))
    mockTable('pricing_tiers', () => ({ data: [], error: null }))
    mockTable('orders', () => okInsert({ id: 'o1', order_number: 'DB-0001' }))
    mockTable('order_items', () => okInsert())
  })

  it('prices the order from the database, not from the frontend', async () => {
    const result = await checkout(makeInput())
    expect(result.pricing[0].unit_price).toBe(600)
    expect(result.pricing[0].pricing_tier).toBe('wholesale')
    expect(result.subtotal).toBe(14400)
    expect(result.total).toBe(14800)
  })

  it('writes the server-calculated totals to the order row', async () => {
    await checkout(makeInput({ discount: 800 }))
    const insert = mockCalls('orders').find((c) => c.state.mutation === 'insert')
    expect(insert).toBeDefined()
    const payload = insert?.state.args.payload as Record<string, unknown>
    expect(payload.subtotal).toBe(14400)
    expect(payload.discount).toBe(800)
    expect(payload.total).toBe(14000)
  })

  it('creates the order in AWAITING_PAYMENT and never as PAID', async () => {
    const result = await checkout(makeInput())
    const orderInsert = mockCalls('orders').find((c) => c.state.mutation === 'insert')
    const payload = orderInsert?.state.args.payload as Record<string, unknown>
    expect(payload.status_id).toBe('awaiting_payment')
    expect(result.order_id).toBe('o1')
    expect(result.order_number).toBe('DB-0001')
  })

  it('writes one order item per cart line, priced server-side', async () => {
    await checkout(makeInput())
    const itemInsert = mockCalls('order_items').find((c) => c.state.mutation === 'insert')
    const items = itemInsert?.state.args.payload as Array<Record<string, unknown>>
    expect(items).toHaveLength(1)
    expect(items[0].order_id).toBe('o1')
    expect(items[0].unit_price).toBe(600)
    expect(items[0].line_total).toBe(14400)
  })

  it('touches no payment tables during checkout', async () => {
    await checkout(makeInput())
    const tables = mockCalls().map((c) => c.table)
    expect(tables).not.toContain('payments')
    expect(tables).not.toContain('payment_transactions')
  })
})
